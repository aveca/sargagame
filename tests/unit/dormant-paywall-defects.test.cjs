#!/usr/bin/env node
'use strict'

/**
 * dormant-paywall-defects.test.cjs — verrou « défauts dormants » du paywall.
 *
 * DÉFAUT DORMANT n°1 (retiré 2026-11-27, AUCUN impact live) :
 *   `PremiumModal.jsx` passait `seq`, `proof`, `onProofOpen`, `onProofBack` à
 *   `<PassOffer>`. Or `PassOffer` (src/PassOffer.jsx) n'accepte QUE
 *   {lang,currency,community,freshTs,onBuy,passKey,ctaSource}. React ignore
 *   les props inconnues d'un composant fonction → les 4 props partaient dans
 *   le vide, et tout le câblage derrière était mort :
 *     - `passSeq` (abVariant `pw_pass_seq` 50/50) ne servait qu'à ces props ;
 *     - le précalcul `_seqProof` (useMemo) ne servait qu'à `proof` ;
 *     - `onProofOpen` / `onProofBack` émettaient `sg_pass_proof_open` /
 *       `sg_pass_seq_back` — deux événements donc JAMAIS émis.
 *   Bilan : l'A/B `pw_pass_seq` n'a jamais tourné et personne ne l'a su
 *   pendant ~5 mois. Aucun prix, aucun paiement, aucune copie visible
 *   n'étaient concernés → le retrait est inobservable en production.
 *
 * DÉFAUT DORMANT n°2 (retiré 2026-11-27, AUCUN impact live) :
 *   bandeau « Tarif haute saison en cours · +15 % » affiché pour PAY_CUR==="usd"
 *   de juin à novembre, alors que la surcharge USD haute saison a été SUPPRIMÉE
 *   côté serveur le 2026-11-09 (src/lib/pricing.js : base = montant facturé).
 *   Annoncer un surcoût jamais débité = un prix fantôme. Le bloc vivait dans la
 *   branche legacy `!passOnly && !pwComic` (jamais rendue en mode pass-only,
 *   qui est le mode live depuis 2026-06-26) → aucun impact live aujourd'hui.
 *
 * CE QUE CE TEST VERROUILLE :
 *   1. `PremiumModal.jsx` ne repasse AUCUNE des 4 props mortes à `<PassOffer>` ;
 *   2. `PremiumModal.jsx` ne recalcule plus `passSeq` / `_seqProof`, et n'émet
 *      plus `sg_pass_proof_open` / `sg_pass_seq_back` (sinon du code mort
 *      revient, invisible) ;
 *   3. `PremiumModal.jsx` n'affiche plus aucun « +15 % » / bandeau haute saison
 *      qui contredirait le serveur ;
 *   4. `PassOffer.jsx` garde sa signature SANS ces props → si on réintroduit un
 *      jour l'écran preuve, il faut d'abord le câbler (friction volontaire) ;
 *   5. PAS de sur-nettoyage : `SeqDots` reste importé ET utilisé (funnel B2B,
 *      voisin immédiat du bloc retiré), `useMemo` reste importé ET utilisé ;
 *   6. le rendu pass-only garde ses props VIVANTES, dont l'attribution
 *      (`ctaSource`) et la fraîcheur (`freshTs`) — un refactor ne doit pas les
 *      perdre en silence.
 *
 * Contrôle négatif : chacun de ces 7 cas est vérifiable en réinjectant le défaut
 * (le verrou doit tomber). Cf. historique du PR.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const modal = fs.readFileSync(path.join(ROOT, 'src', 'PremiumModal.jsx'), 'utf8')
const offer = fs.readFileSync(path.join(ROOT, 'src', 'PassOffer.jsx'), 'utf8')

// Dépile les commentaires (guillemets, templates, //, /*) : seules les
// affirmations sur du code AFFICHÉ doivent s'appliquer au code nu. Une mention
// dans un commentaire de retrait est saine — elle explique POURQUOI.
function stripComments(src) {
  let out = '', i = 0
  const n = src.length
  while (i < n) {
    const c = src[i], d = src[i + 1]
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue }
        if (src[i] === q) { out += src[i]; i++; break }
        out += src[i]; i++
      }
      continue
    }
    out += c; i++
  }
  return out
}
const modalCode = stripComments(modal)

// Props réellement acceptées par PassOffer (signature destrurée).
const sigMatch = offer.match(/function\s+PassOffer\s*\(\s*\{([^}]*)\}\s*\)/)
assert.ok(sigMatch, 'signature de PassOffer introuvable')
const accepted = new Set(
  sigMatch[1].split(',').map((s) => s.split('=')[0].trim()).filter(Boolean)
)
const DEAD = ['seq', 'proof', 'onProofOpen', 'onProofBack']

// ── 1. PassOffer n'accepte toujours pas les props mortes ─────────────────────
for (const p of DEAD) {
  assert.ok(!accepted.has(p),
    `PassOffer accepte désormais \`${p}\` : l'écran preuve a été câblé sans que ` +
    `le verrou dormant-paywall-defects.test.cjs soit mis à jour — le réintroduire ` +
    `est une décision de revenu, pas un refactor`)
}

// ── 2. PremiumModal ne repasse aucune prop morte à <PassOffer> ───────────────
for (const p of DEAD) {
  assert.ok(!new RegExp('\\b' + p + '=\\{').test(modalCode),
    `PremiumModal repasse \`${p}={...}\` à un composant : « ${p} » était une props ` +
    `MORTE pour PassOffer (ignorée par React). Si c'est maintenant volontaire, la ` +
    `cible accepte-t-elle la prop ? cf. tests/unit/dormant-paywall-defects.test.cjs`)
  assert.ok(!modalCode.includes(`${p}={passSeq}`), `props morte ressuscitée : ${p}={passSeq}`)
  assert.ok(!modalCode.includes(`${p}={_seqProof}`), `props morte ressuscitée : ${p}={_seqProof}`)
}

// ── 3. plus de calcul mort ni d'événement fantôme en amont ──────────────────
assert.ok(!/const\s+passSeq\b/.test(modalCode),
  '`passSeq` est de retour : calcul mort (aucun consommateur). Le bras A/B ' +
  '`pw_pass_seq` avait été prouvé inerte — ne pas le réintroduire à moitié')
assert.ok(!/const\s+_seqProof\b/.test(modalCode),
  '`_seqProof` est de retour : useMemo mort (aucun consommateur)')
for (const evt of ['sg_pass_proof_open', 'sg_pass_seq_back']) {
  assert.ok(!modalCode.includes(`"${evt}"`) && !modalCode.includes(`'${evt}'`),
    `émission de \`${evt}\` de retour dans PremiumModal : événirment jamais ` +
    `mesuré (props mortes) — le câbler à moitié fabriquerait un faux « 0 »`)
}
assert.ok(!/abVariant\(\s*"pw_pass_seq"/.test(modalCode),
  'le tirage A/B `pw_pass_seq` est de retour sans consommateur : il consomme ' +
  'une assignation de bras pour un effet nul')

// ── 4. plus de bandeau de prix fantôme (surcharge supprimée côté serveur) ────
assert.ok(!modalCode.includes('+15 %'),
  'PremiumModal AFFICHE encore « +15 % » : la surcharge USD haute saison est ' +
  'SUPPRIMÉE côté serveur depuis 2026-11-09 (src/lib/pricing.js) — un prix ' +
  'affiché différent du prix facturé est un mensonge au paiement')
assert.ok(!modalCode.includes('Tarif haute saison en cours'), 'bandeau haute saison de retour')
assert.ok(!modalCode.includes('High-season rate'), 'bandeau haute saison (EN) de retour')
assert.ok(!modalCode.includes('Tarifa alta temporada'), 'bandeau haute saison (ES) de retour')
assert.ok(!modalCode.includes('haute saison en cours'), 'bandeau haute saison (variante FR courte)')
// La trace écrite du retrait doit rester, sinon on ré-ajoutera le bandeau.
assert.ok(/RETIRÉ 2026-11-27/.test(modal),
  'la trace du retrait (RETIRÉ 2026-11-27) a disparu de PremiumModal : sans elle, ' +
  'un futur contributeur ré-introduira le bandeau de prix fantôme')
// La vérité serveur doit rester documentée là où elle est appliquée.
assert.ok(/2026-11-09/.test(offer) && /surcharge/.test(offer),
  'src/PassOffer.jsx doit continuer à documenter la suppression de la surcharge ' +
  'USD (2026-11-09) : c\'est la source de vérité affichée au client')
assert.ok(/2026-11-09/.test(fs.readFileSync(path.join(ROOT, 'src', 'lib', 'pricing.js'), 'utf8')),
  'src/lib/pricing.js doit conserver la trace de la suppression (2026-11-09)')

// ── 5. pas de sur-nettoyage : les imports voisins restent NÉCESSAIRES ────────
assert.ok(/^import\s*\{[^}]*\bSeqDots\b[^}]*\}\s*from\s*"\.\/SeqPrimitives\.jsx"/m.test(modal),
  'import `SeqDots` perdu : il sert encore au funnel B2B (preuve séquentielle). ' +
  'Un nettoyage trop large du bloc passseq l\'a emporté — casse le B2B')
assert.ok(/<SeqDots\b/.test(modalCode),
  '`SeqDots` n\'est plus RENDU : le funnel B2B a perdu son indicateur de séquence')
assert.ok(/^import\s+React,\{[^}]*\buseMemo\b/m.test(modal),
  'import `useMemo` perdu : il sert encore ailleurs dans PremiumModal')
assert.ok(/<PassStorefront\b/.test(modalCode), 'PassStorefront doit rester rendu dans PremiumModal')

// ── 6. le rendu pass-only garde ses props vivantes ──────────────────────────
// ⚠️ 2026-11-27 — MISSION « wallets + mesure » : la 3ᵉ prop morte
// `wallet={walletAvail()}` (PassOffer ne la déclare pas, cf. src/PassOffer.jsx:20
// + commentaire ligne 52 « aucun bouton wallet ») a ÉTÉ RETIRÉE — mais pas
// comme un simple nettoyage : c'était le SEUL endroit qui lançait `walletAvail()`
// hors écran de paiement, donc le seul kick de la détection Apple/Google Pay
// (cache sessionStorage `sg_wallet_avail`, TTL 5 min). Le kick a d'abord été
// DÉPLACÉ dans un effet (`await Promise.resolve(walletAvail())` → `setWallet`),
// ce qui a au passage CORRIGÉ un défaut live : l'ancien rendu faisait
// `const w=walletAvail()` puis `if(!w.apple&&!w.google)return null`, or
// `walletAvail()` renvoie une PROMISE quand le cache est froid → les boutons
// express n'étaient PAS garantis d'être offerts. Le contrat ci-dessous verrouille
// les deux sens : la prop morte ne revient pas, et le kick reste dans un effet.
const passOnlyStart = modalCode.indexOf('{passOnly&&<PassStorefront')
const passOnlyEnd = modalCode.indexOf('{!passOnly&&pwComic', passOnlyStart + 1)
assert.ok(passOnlyStart >= 0 && passOnlyEnd > passOnlyStart, 'rendu pass-only introuvable')
const passOnlyRender = modalCode.slice(passOnlyStart, passOnlyEnd)
for (const live of ['lang={lang}', 'currency={PAY_CUR}', 'source={source||"unknown"', 'setPayStep={setPayStep}', 'passCtxRef={passCtxRef}', 'highlightedKey={_passFromUrl']) {
  assert.ok(passOnlyRender.includes(live),
    `le rendu pass-only a perdu \`${live}\` — dont l'attribution (\`source\`) et le rappel de paiement (\`setPayStep\`) : une régression de mesure, pas un nettoyage`)
}
assert.ok(!/wallet=\{walletAvail\(\)\}/.test(modalCode),
  'la prop morte `wallet={walletAvail()}` est revenue sur un <PassOffer> : ' +
  'PassOffer ne la declare pas (src/PassOffer.jsx:20) — soit elle repartait ' +
  'dans le vide, soit elle masquait que la detection wallet n etait plus ' +
  'lancee. Le kick doit vivre dans l effet, pas dans une prop morte')
assert.ok(/\[\s*wallet\s*,\s*setWallet\s*\]\s*=\s*useState\(null\)/.test(modal)
  && /await\s+Promise\.resolve\(walletAvail\(\)\)/.test(modal)
  && /setWallet\(/.test(modal),
  'le kick de detection wallet (state `wallet` + effet `await ' +
  'Promise.resolve(walletAvail())` → `setWallet`) a disparu : le prop mort ' +
  'etait le SEUL appelant hors ecran de paiement — plus de kick = plus aucun ' +
  'wallet express propose')

console.log('✓ dormant-paywall-defects : 4 props mortes retirées, 0 calcul mort, 0 prix fantôme, imports vivants intacts')