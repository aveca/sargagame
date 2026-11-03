#!/usr/bin/env node
/**
 * workflow-outbound-governance.test.cjs — Gouvernance des 38 workflows GitHub
 * Actions pour les actions sortantes (mission P0.23 / #1157).
 *
 * Ce test verrouille l'audit `scripts/audit-workflow-outbound.cjs` AU NIVEAU
 * JOB > STEP, sur le depot reel, et prouve qu'il est FAIL-CLOSED sur des
 * fixtures synthetiques :
 *
 *   G1  js-yaml est installe (devDependency) ET est le parseur utilise
 *   G2  les 38 workflows sont tous lisibles par le vrai parseur YAML
 *   G3  zero finding HIGH sur le depot reel
 *   G4  aucun appel HTTP mutant vers Apps Script (clean_bounces ou equivalent)
 *   G5  les findings MEDIUM sont EXACTEMENT la politique documentee (un nouveau casse)
 *   G6  daily-copernicus : plus aucun flag dangereux, plus aucun curl Apps Script
 *   G7  weekly-optimize : beached-calibrate en `--write`, cleanup sans flag,
 *       seuls des `action=` en lecture seule
 *   G8  l'exemption R1 est VERIFIEE sur la source : lecture seule accordee,
 *       script avec ecriture externe REFUSEE, script manquant REFUSE
 *   G9  fidelite des deux parseurs : meme nombre de jobs et de steps, 38 fois
 *   G10 fixture : trigger automatique + `--send` => HIGH (meme avec un `if:`)
 *   G11 fixture : curl Apps Script mutant (clean_bounces) => HIGH
 *   G12 fixture : curl Apps Script en lecture seule => aucun HIGH
 *   G13 fixture : YAML invalide => HIGH (pas de repli silencieux)
 *   G14 fixture : exemption dont la source a PERDU sa lecture seule => HIGH
 *   G15 couverture : chaque script declare existe et passe par le contrat central
 *   G16 l'audit lui-meme n'a aucun effet de bord a l'import
 *   R6  exceptions inline : shells `run:` + secret d'envoi, interdits par defaut
 *       (HIGH), toleres uniquement manuels ET documentes (INFO), perimes des
 *       qu'un trigger automatique apparait (HIGH, niveau workflow)
 *
 * Aucun reseau, aucune ecriture : lecture seule + fixtures dans un dossier temporaire.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const WF_DIR = path.join(ROOT, '.github', 'workflows');
const AUDIT = path.join(ROOT, 'scripts', 'audit-workflow-outbound.cjs');

const audit = require(AUDIT);

let failures = 0;
function record(name, ok, extra) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

/** Tous les workflows reels, scannes. */
function scanAll() {
  const files = fs.readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f)).sort();
  return files.map((f) => audit.scanFile(path.join(WF_DIR, f)));
}

/** Aplatis tous les findings (workflow + etapes) d'un scan. */
function flatten(scans) {
  const out = [];
  for (const s of scans) {
    for (const f of s.workflowFindings) out.push({ severity: f.severity, code: f.code, file: s.file, jobId: '(workflow)', stepName: '(parse)' });
    for (const j of s.jobs) {
      for (const f of j.findings) out.push({ severity: f.severity, code: f.code, file: s.file, jobId: j.jobId, stepName: j.stepName });
    }
  }
  return out;
}

/** Politique documentee : secrets presents sur une etape planifiee sans condition.
 *  Le contrat central reste la barriere reelle ; ces 6 cas sont actes. */
const DOCUMENTED_MEDIUM_POLICY = [
  'daily-brief.yml|send|Send daily verdict (SMTP alerte@)',
  'notify-photos.yml|notify|Notify founder of pending photos',
  'weekend-email.yml|send|Send weekend bulletin (SMTP alerte@ → MQ + GP)',
  'weekly-outreach.yml|outreach|Auto-outreach (scrape + email backlink requests)',
  'weekly-outreach.yml|outreach|Curated backlink outreach (low-volume, high-authority)',
  'weekly-outreach.yml|outreach|B2B outreach (self-serve, faible volume)',
];

function main() {
  const scans = scanAll();
  const findings = flatten(scans);
  const highs = findings.filter((f) => f.severity === 'HIGH');
  const mediums = findings.filter((f) => f.severity === 'MEDIUM');

  // ── G1 — le vrai parseur YAML est present ET utilise ──────────────────────
  console.log('\nG1 — parseur :');
  const yamlResolvable = (() => {
    try { require.resolve('js-yaml'); return true; } catch (_) { return false; }
  })();
  record('G1a js-yaml resout depuis le test (devDependency installee)', yamlResolvable);
  record('G1b chaque workflow est analyse par js-yaml (pas le repli ligne-a-ligne)',
    scans.every((s) => s.parserUsed === 'js-yaml'),
    scans.map((s) => s.parserUsed).filter((p, i, a) => a.indexOf(p) === i).join(',') || '(vide)');

  // ── G2/G3 — lisibilite et zero HIGH ───────────────────────────────────────
  console.log('\nG2-G3 — depot reel :');
  record('G2a 38 workflows scannes', scans.length === 38, String(scans.length));
  record('G2b aucun workflow illisible par le vrai parseur (R5)',
    scans.every((s) => !s.parseError),
    scans.filter((s) => s.parseError).map((s) => s.file + ':' + s.parseError).join(' | ') || 'aucune erreur');
  record('G3  zero finding HIGH sur les 38 workflows', highs.length === 0,
    highs.map((h) => `${h.file}/${h.jobId}/${h.stepName}: ${h.code}`).join(' | ') || '0 HIGH');

  // ── G4 — plus aucun HTTP mutant vers Apps Script ──────────────────────────
  console.log('\nG4 — Apps Script :');
  const curlSteps = scans.flatMap((s) => s.jobs.filter((j) => j.curlAppsScript));
  record('G4a zero appel curl vers Apps Script MUTANT',
    curlSteps.every((j) => j.curlReadOnly),
    curlSteps.filter((j) => !j.curlReadOnly).map((j) => `${j.file}/${j.stepName}: ${j.curlAction}`).join(' | ') || 'aucun mutant');
  record('G4b zero occurrence de `clean_bounces` dans les workflows',
    scans.every((s) => s.jobs.every((j) => !/clean_bounces/i.test(j.run))));

  // ── G5 — politique MEDIUM verrouillee ─────────────────────────────────────
  console.log('\nG5 — politique documentee :');
  const observedMedium = mediums.map((m) => `${m.file}|${m.jobId}|${m.stepName}`).sort();
  const expectedMedium = DOCUMENTED_MEDIUM_POLICY.slice().sort();
  record('G5a les 6 findings MEDIUM sont exactement la politique actee',
    JSON.stringify(observedMedium) === JSON.stringify(expectedMedium),
    observedMedium.join(' ; ') || 'aucun');
  record('G5b chaque finding MEDIUM documente est present (aucune regression silencieuse)',
    DOCUMENTED_MEDIUM_POLICY.every((k) => observedMedium.includes(k)),
    DOCUMENTED_MEDIUM_POLICY.filter((k) => !observedMedium.includes(k)).join(' | ') || 'complet');

  // ── G6 — daily-copernicus : strips de la mission ──────────────────────────
  console.log('\nG6 — daily-copernicus.yml :');
  const dcRaw = fs.readFileSync(path.join(WF_DIR, 'daily-copernicus.yml'), 'utf8');
  const dcScan = scans.find((s) => s.file === 'daily-copernicus.yml');
  const dcOutbound = dcScan.jobs.filter((j) => j.outboundScripts.length);
  // Les seuls flags dangereux toléres sont ceux d'une exemption VÉRIFIÉE
  // mecaniquement sur la source (`mollie-mrr.cjs --send`, lecture seule).
  // Tout autre flag sur un trigger automatique reste HIGH (regle R1).
  const dcDangerous = dcOutbound.filter((j) => j.dangerousFlags.some((f) => {
    const exempt = j.outboundScripts.some((script) => {
      const v = audit.verifyReadOnlyScript(script);
      return v.exists && v.clean && audit.READ_ONLY_FLAG_EXEMPTIONS.some((e) => e.script === script && e.flags.includes(f));
    });
    return !exempt;
  }));
  record('G6a aucun flag `--send`/`--purge`/`--force` hors exemption verifiee',
    dcDangerous.length === 0,
    dcDangerous.map((j) => `${j.stepName}:${j.dangerousFlags}`).join(' | ') || 'aucun (mollie-mrr.cjs --send est verifie lecture seule)');
  record('G6b les seuls flags dangereux toleres sont ceux de mollie-mrr.cjs (exemption verifiee)',
    dcOutbound.filter((j) => j.dangerousFlags.length).every((j) => j.outboundScripts.includes('mollie-mrr.cjs')),
    dcOutbound.filter((j) => j.dangerousFlags.length).map((j) => `${j.outboundScripts}:${j.dangerousFlags}`).join(' | ') || 'aucun');
  // G6c : les seules mentions de `curl` sont dans des COMMENTAIRES de la mission
  // (aucune etape `run:` ne contient de curl).
  const dcRunCurl = dcScan.jobs.filter((j) => j.run && /\bcurl\b/.test(j.run));
  record('G6c zero etape `run:` contenant `curl` (les mentions restantes sont des commentaires)',
    dcRunCurl.length === 0,
    dcRunCurl.map((j) => j.stepName).join(' | ') || 'aucune');
  record('G6d cleanup Apps Script passe par le wrapper Node (appscript-cleanup.cjs)',
    dcRaw.includes('appscript-cleanup.cjs'));
  record('G6e le workflow garde ses triggers (schedule/dispatch/push) — rien de desactive',
    /schedule/.test(dcRaw) && /workflow_dispatch/.test(dcRaw));

  // ── G7 — weekly-optimize ─────────────────────────────────────────────────
  console.log('\nG7 — weekly-optimize.yml :');
  const woScan = scans.find((s) => s.file === 'weekly-optimize.yml');
  const woRaw = fs.readFileSync(path.join(WF_DIR, 'weekly-optimize.yml'), 'utf8');
  const woSteps = woScan.jobs;
  const beached = woSteps.filter((j) => j.outboundScripts.includes('beached-calibrate.cjs'));
  record('G7a beached-calibrate est appele en `--write` (jamais `--send`)',
    beached.length > 0 && beached.every((j) => /--write/.test(j.run) && !/--send/.test(j.run)),
    beached.map((j) => j.run.split('\n').find((l) => /beached-calibrate/.test(l)) || '?').join(' | '));
  record('G7b les appscript-cleanup sont appeles sans flag de demande reelle',
    woSteps.filter((j) => j.outboundScripts.includes('appscript-cleanup.cjs'))
      .every((j) => j.dangerousFlags.length === 0));
  record('G7c les seuls appels curl visent `action=email_stats` (lecture seule)',
    woSteps.filter((j) => j.curlAppsScript).every((j) => j.curlReadOnly && j.curlAction === 'email_stats'),
    woSteps.filter((j) => j.curlAppsScript).map((j) => j.curlAction).join(',') || 'aucun curl');
  record('G7d beached-calibrate ne compte PAS comme flag dangereux (ecriture locale guardraille)',
    !woSteps.some((j) => j.dangerousFlags.includes('--write')));

  // ── G8 — exemption R1 verifiee sur la source ─────────────────────────────
  console.log('\nG8 — exemptions R1 (verification mecanique) :');
  const mrr = audit.verifyReadOnlyScript('mollie-mrr.cjs');
  record('G8a mollie-mrr.cjs existe et est (encore) lecture seule', mrr.exists && mrr.clean,
    mrr.sites.join('/') || 'aucun site d\'ecriture externe');
  record('G8b l\'exemption accordee est celle de mollie-mrr.cjs (--send)',
    audit.READ_ONLY_FLAG_EXEMPTIONS.some((e) => e.script === 'mollie-mrr.cjs' && e.flags.includes('--send')));
  record('G8c le verifieure REFUSE un script contenant une ecriture externe',
    (() => {
      const v = audit.verifyReadOnlyScript('auto-outreach.cjs');
      return v.exists && v.clean === false && v.sites.length > 0;
    })(),
    audit.verifyReadOnlyScript('auto-outreach.cjs').sites.join('/'));
  record('G8d le verifieure REFUSE un script inexistant (fail-closed)',
    (() => {
      const v = audit.verifyReadOnlyScript('script-qui-nexiste-pas.cjs');
      return v.exists === false && v.clean === false;
    })());
  const exemptInfos = findings.filter((f) => f.code === 'DOCUMENTED_READ_ONLY_EXEMPTION');
  record('G8e le depot reel contient l\'exemption verifiee et documentee',
    exemptInfos.some((f) => /mollie-mrr/.test(f.code) || f.file === 'daily-copernicus.yml'),
    `${exemptInfos.length} finding(s) INFO d'exemption`);
  const broken = findings.filter((f) => f.code === 'BROKEN_READ_ONLY_EXEMPTION');
  record('G8f aucune exemption cassee sur le depot reel', broken.length === 0,
    broken.map((b) => b.file).join(','));

  // ── R6 — exceptions inline (shell `run:` + secret d'envoi) ────────────────
  console.log('\nR6 — exceptions inline :');
  const inlineInfos = findings.filter((f) => f.code === 'DOCUMENTED_INLINE_EXCEPTION');
  record('R6a les blocs inline documentes sortent en INFO, jamais en HIGH',
    inlineInfos.length >= 1 && inlineInfos.every((f) => f.severity === 'INFO'),
    inlineInfos.map((f) => f.file + '/' + f.stepName).join(', ') || 'aucun');
  record('R6b aucune exception inline ne couvre un workflow AUTOMATIQUE (escalade => HIGH)',
    audit.INLINE_RUN_EXCEPTIONS.every((ex) => {
      const s = scans.find((x) => x.file === ex.file);
      return !s || !s.isAutomatic;
    }),
    audit.INLINE_RUN_EXCEPTIONS.map((e) => {
      const s = scans.find((x) => x.file === e.file);
      return `${e.file}=${s ? (s.isAutomatic ? 'AUTOMATIQUE!' : 'manuel') : 'ABSENT!'}`;
    }).join(', '));
  record('R6c chaque entree d\'exception correspond a un workflow EXISTANT (pas d\'entree perimee)',
    audit.INLINE_RUN_EXCEPTIONS.every((e) => fs.existsSync(path.join(WF_DIR, e.file))),
    audit.INLINE_RUN_EXCEPTIONS.filter((e) => !fs.existsSync(path.join(WF_DIR, e.file))).join(', ') || 'toutes presentes');

  // ── G9 — fidelite des deux parseurs ──────────────────────────────────────
  console.log('\nG9 — fidelite js-yaml / repli ligne-a-ligne :');
  let fidelityBad = [];
  for (const f of fs.readdirSync(WF_DIR).filter((x) => /\.ya?ml$/.test(x)).sort()) {
    const raw = fs.readFileSync(path.join(WF_DIR, f), 'utf8');
    const y = audit.parseWorkflowYaml(raw);
    const stepsY = y.jobs.reduce((n, j) => n + j.steps.length, 0);
    const l = audit.parseWorkflowLines(raw);
    const stepsL = l.jobs.reduce((n, j) => n + j.steps.length, 0);
    if (y.jobs.length !== l.jobs.length || stepsY !== stepsL) {
      fidelityBad.push(`${f}: yaml ${y.jobs.length}j/${stepsY}s vs lignes ${l.jobs.length}j/${stepsL}s`);
    }
  }
  record('G9 les deux parseurs extraient le meme nombre de jobs ET de steps (38/38)',
    fidelityBad.length === 0, fidelityBad.join(' | ') || 'identiques');
  record('G9b `on:` en liste flow est normalise (triggers non vides)',
    (() => {
      const t = audit.normalizeTriggers(['push', 'schedule']);
      return t.includes('push') && t.includes('schedule');
    })());

  // ── G10-G13 — fixtures synthetiques : fail-closed prouve ──────────────────
  console.log('\nG10-G13 — fixtures synthetiques (fail-closed) :');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-gov-'));
  function fixture(name, content) {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, content);
    return audit.scanFile(p);
  }
  function codesOf(scan) {
    const out = [];
    // Les findings de NIVEAU WORKFLOW (erreur de parse, exception inline perimee)
    // portent aussi une severite : sans le prefixe, un test chercherait
    // `HIGH:INVALID_WORKFLOW_YAML` et ne trouverait jamais rien — la fixture
    // passerait au vert pour une mauvaise raison.
    for (const f of scan.workflowFindings) out.push(`${f.severity}:${f.code}`);
    for (const j of scan.jobs) for (const f of j.findings) out.push(`${f.severity}:${f.code}`);
    return out;
  }

  // G10 — R1 : trigger automatique + flag de demande reelle
  {
    const s = fixture('r1.yml', `name: fixture-r1
on:
  schedule: [{cron: "0 6 * * *"}]
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - name: envoi reel non garde
        run: node scripts/automation/push-winback.cjs --send
        env:
          SMTP_PASS: \${{ secrets.SMTP_PASS }}
`);
    const c = codesOf(s);
    record('G10a fixture trigger auto + --send => HIGH DANGEROUS_FLAG_ON_AUTOMATIC_TRIGGER',
      c.includes('HIGH:DANGEROUS_FLAG_ON_AUTOMATIC_TRIGGER'), c.join(' '));
  }
  // G10b — meme chose, mais avec un `if:` sur le step : TOUJOURS HIGH (fail-closed)
  {
    const s = fixture('r1b.yml', `name: fixture-r1b
on:
  schedule: [{cron: "0 6 * * *"}]
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - name: envoi reel garde par if
        if: github.event_name == 'workflow_dispatch'
        run: node scripts/automation/push-winback.cjs --send
`);
    const c = codesOf(s);
    record('G10b fixture trigger auto + --send MEME avec `if:` => HIGH (le contrat, pas le YAML, garde)',
      c.includes('HIGH:DANGEROUS_FLAG_ON_AUTOMATIC_TRIGGER'), c.join(' '));
  }
  // G11 — R2 : curl Apps Script mutant
  {
    const s = fixture('r2.yml', `name: fixture-r2
on:
  schedule: [{cron: "0 6 * * *"}]
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - name: cleanup direct hors contrat
        run: curl -sL "\${{ secrets.APPS_SCRIPT_URL }}?action=clean_bounces"
        env:
          APPS_SCRIPT_URL: \${{ secrets.APPS_SCRIPT_URL }}
`);
    const c = codesOf(s);
    record('G11a fixture curl action=clean_bounces => HIGH DIRECT_APPS_SCRIPT_HTTP_WRITE',
      c.includes('HIGH:DIRECT_APPS_SCRIPT_HTTP_WRITE'), c.join(' '));
  }
  // G12 — R2b : curl Apps Script en lecture seule
  {
    const s = fixture('r2b.yml', `name: fixture-r2b
on:
  schedule: [{cron: "0 6 * * *"}]
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - name: stats en lecture
        run: curl -sL "\${{ secrets.APPS_SCRIPT_URL }}?action=email_stats"
        env:
          APPS_SCRIPT_URL: \${{ secrets.APPS_SCRIPT_URL }}
`);
    const c = codesOf(s);
    record('G12 fixture curl action=email_stats => aucun HIGH (lecture seule actee)',
      !c.some((x) => x.startsWith('HIGH:')) && c.some((x) => x === 'INFO:APPS_SCRIPT_READ_ONLY_CURL'), c.join(' '));
  }
  // G13 — R5 : YAML invalide
  {
    const s = fixture('r5.yml', `name: fixture-r5
on: [schedule
jobs: [ ceci n'est pas du yaml valide
`);
    const c = codesOf(s);
    record('G13 fixture YAML invalide => HIGH INVALID_WORKFLOW_YAML (pas de repli silencieux)',
      c.includes('HIGH:INVALID_WORKFLOW_YAML'), c.join(' '));
    record('G13b le parseur declare quand meme js-yaml (l\'erreur est remontee, pas avalee)',
      s.parserUsed === 'js-yaml' && Boolean(s.parseError));
  }
  // G14 — exemption dont la source a perdu sa lecture seule
  {
    // On ajoute une exemption pour un script qui CONTIENT une ecriture externe.
    // Si le script redevient mutant, l'exemption doit etre refusee -> HIGH.
    const before = audit.READ_ONLY_FLAG_EXEMPTIONS.length;
    audit.READ_ONLY_FLAG_EXEMPTIONS.push({
      script: 'auto-outreach.cjs',
      flags: ['--send'],
      reason: 'FIXTURE de test : ce script envoie des emails, l\'exemption doit etre REFUSEE.',
    });
    try {
      const s = fixture('r4.yml', `name: fixture-r4
on:
  workflow_dispatch: {}
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - name: script mutant declare exempte
        run: node scripts/automation/auto-outreach.cjs --send
`);
      const c = codesOf(s);
      record('G14 fixture exemption sur un script MUTANT => HIGH BROKEN_READ_ONLY_EXEMPTION',
        c.includes('HIGH:BROKEN_READ_ONLY_EXEMPTION') && c.includes('HIGH:DANGEROUS_FLAG_ON_AUTOMATIC_TRIGGER') === false,
        c.join(' '));
    } finally {
      audit.READ_ONLY_FLAG_EXEMPTIONS.length = before; // restauration
    }
    record('G14b la liste d\'exemptions est restauree apres le test',
      audit.READ_ONLY_FLAG_EXEMPTIONS.length === before);
  }

  // R6d — fixture : bloc shell INLINE non documente + secret d'envoi, automatique
  {
    const s = fixture('r6.yml', `name: fixture-r6
on:
  schedule: [{cron: "0 6 * * *"}]
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - name: envoi SMTP inline hors contrat
        env:
          SMTP_PASS: \${{ secrets.SMTP_PASS }}
        run: |
          curl -sS --url "smtps://smtp.example.com:465" --mail-from "a@b.c" --mail-rcpt "d@e.f"
`);
    const c = codesOf(s);
    record('R6d fixture bloc shell inline + SMTP_PASS sur schedule => HIGH INLINE_OUTBOUND_NOT_GATED',
      c.includes('HIGH:INLINE_OUTBOUND_NOT_GATED'), c.join(' '));
  }
  // R6e — fixture : MEME bloc inline, mais le secret est au niveau du JOB
  // (injecte pour une autre etape) => aucun HIGH (le smoke de deploiement
  // cloudflare-production.yml ne doit pas basculer en faux positif).
  {
    const s = fixture('r6b.yml', `name: fixture-r6b
on:
  schedule: [{cron: "0 6 * * *"}]
jobs:
  j:
    runs-on: ubuntu-latest
    env:
      MOLLIE_API_KEY: \${{ secrets.MOLLIE_API_KEY }}
    steps:
      - name: smoke GET sans secret propre
        env:
          DOMAIN: example.com
        run: curl -sS -o /dev/null -w "%{http_code}" "https://example.com/"
`);
    const c = codesOf(s);
    record('R6e fixture curl GET, secret seulement au niveau JOB => aucun HIGH',
      !c.some((x) => x.startsWith('HIGH:')), c.join(' ') || 'aucun finding');
  }
  // R6f — fixture : exception documentee, MANUELLE => INFO (pas de HIGH).
  {
    const s = fixture('check-mail-backlog.yml', `name: fixture-inline-ok
on:
  workflow_dispatch: {}
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - name: read inbox
        env:
          SMTP_PASS: \${{ secrets.SMTP_PASS }}
        run: |
          curl -sS "imaps://imap.example.com"
`);
    const c = codesOf(s);
    record('R6f fixture workflow d\'exception INLINE en manuel => INFO DOCUMENTED_INLINE_EXCEPTION',
      c.includes('INFO:DOCUMENTED_INLINE_EXCEPTION') && !c.some((x) => x.startsWith('HIGH:')), c.join(' '));
  }
  // R6g — fixture : MEME workflow d'exception, mais avec un trigger automatique
  // => l'exemption est perimee DES LE NIVEAU WORKFLOW (fail-closed).
  {
    const s = fixture('check-mail-backlog.yml', `name: fixture-inline-escalade
on:
  schedule: [{cron: "0 6 * * *"}]
  workflow_dispatch: {}
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
      - name: read inbox
        run: curl -sS "imaps://imap.example.com"
`);
    const c = codesOf(s);
    record('R6g fixture workflow d\'exception INLINE + schedule => HIGH INLINE_EXCEPTION_ESCALATED',
      c.includes('HIGH:INLINE_EXCEPTION_ESCALATED'), c.join(' '));
  }

  // ── G15 — couverture de la liste des scripts sortants ─────────────────────
  console.log('\nG15 — couverture OUTBOUND_SCRIPTS :');
  const ungated = [];
  const missing = [];
  // Exemption R1 : un script dont l'exemption est VERIFIEE mecaniquement
  // (aucun site d'ecriture externe, y compris transitivement) n'a pas besoin du
  // contrat central — il n'a aucune action sortante a autoriser. On refuse
  // pourtant l'exemption des que la source cesse d'etre en lecture seule, donc
  // la porte reste fermee (meme regle que G6a et G14).
  const verifiedReadOnly = (script) => {
    const ex = audit.READ_ONLY_FLAG_EXEMPTIONS.find((e) => e.script === script);
    if (!ex) return false;
    const v = audit.verifyReadOnlyScript(script);
    return Boolean(v.exists && v.clean);
  };
  for (const script of audit.OUTBOUND_SCRIPTS) {
    const p1 = path.join(ROOT, 'scripts', 'automation', script);
    const p2 = path.join(ROOT, 'scripts', script);
    const p = fs.existsSync(p1) ? p1 : p2;
    if (!fs.existsSync(p)) { missing.push(script); continue; }
    if (verifiedReadOnly(script)) continue;
    const src = fs.readFileSync(p, 'utf8');
    const gated = /authorizeAction|assertEmailSendAllowed|assertPushSendAllowed|assertOutreachAllowed|assertAnalyticsDeleteAllowed|assertExternalWriteAllowed|assertAppsScriptCleanupAllowed/.test(src);
    if (!gated) ungated.push(script);
  }
  record('G15a chaque script declare dans OUTBOUND_SCRIPTS existe sur le disque',
    missing.length === 0, missing.join(', ') || `${audit.OUTBOUND_SCRIPTS.length} scripts`);
  record('G15b chaque script declare passe par le contrat central (aucun non-gate)',
    ungated.length === 0, ungated.join(', ') || 'tous gates');
  record('G15b2 toute exemption R1 restante est reverifiee mecaniquement (fail-closed)',
    audit.READ_ONLY_FLAG_EXEMPTIONS.every((ex) => {
      const v = audit.verifyReadOnlyScript(ex.script);
      return Boolean(v.exists && v.clean);
    }),
    audit.READ_ONLY_FLAG_EXEMPTIONS.map((e) => {
      const v = audit.verifyReadOnlyScript(e.script);
      return `${e.script}=${v.exists && v.clean ? 'verifiee lecture seule' : 'REFUSEE:' + v.sites.join(',')}`;
    }).join(', '));
  record('G15c la liste couvre au moins les scripts invoques par les workflows AUTOMATIQUES',
    (() => {
      const invoked = new Set();
      for (const s of scans) {
        for (const j of s.jobs) {
          for (const m of j.run.matchAll(/node\s+scripts\/(?:automation\/)?([A-Za-z0-9._-]+\.cjs)/g)) invoked.add(m[1]);
        }
      }
      const declared = new Set(audit.OUTBOUND_SCRIPTS);
      const autoOutboundMissing = [];
      for (const s of scans.filter((x) => x.isAutomatic)) {
        for (const j of s.jobs) {
          for (const name of j.outboundScripts) if (!declared.has(name)) autoOutboundMissing.push(`${s.file}:${name}`);
        }
      }
      return autoOutboundMissing.length === 0 && invoked.size > 0;
    })(),
    'scripts invoques par des workflows automatiques et absents de la liste : ' +
    (scans.filter((x) => x.isAutomatic).flatMap((s) => s.jobs.flatMap((j) => j.outboundScripts.filter((n) => !audit.OUTBOUND_SCRIPTS.includes(n)))).join(', ') || 'aucun'));

  // ── G16 — l'audit lui-meme est pur a l'import ─────────────────────────────
  console.log('\nG16 — purete de l\'audit :');
  {
    const res = spawnSync(process.execPath, ['-e',
      `const a = require(${JSON.stringify(AUDIT)}); console.log('IMPORT_OK ' + (typeof a.scanFile))`],
      { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    record('G16a require() de l\'audit n\'execute rien (garde require.main)',
      res.status === 0 && String(res.stdout).includes('IMPORT_OK'),
      String(res.stdout).trim() + String(res.stderr).slice(0, 120));
    const after = audit.scanFile(path.join(WF_DIR, 'daily-copernicus.yml'));
    record('G16b re-scan identique apres import (aucun etat mute)',
      after.jobs.length === dcScan.jobs.length);
  }

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* temporaire : sans importance */ }

  console.log(failures === 0
    ? '\nWORKFLOW_OUTBOUND_GOVERNANCE PASS'
    : `\nWORKFLOW_OUTBOUND_GOVERNANCE FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
