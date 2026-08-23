import { headers } from "next/headers";
import { getMissions, getImprovements, getStripeFindings } from "@/lib/data";
import { Panel, SectionHead } from "@/components/ui";
import { ExportPrompt } from "@/components/ExportPrompt";
import { FUNNEL, CURRENT_MRR, TARGET_MRR } from "@/lib/seed/paywall";
import { RAPPORTS } from "@/lib/seed/rapports";
import { MASTER, MOONSHOT_20, TRAJECTOIRE } from "@/lib/seed/master";

export const dynamic = "force-dynamic";

function buildPrompt(base: string): string {
  return `Tu as accès à internet.

## Étape 1 — Lecture obligatoire
Lis intégralement le rapport d'audit stratégique de SargaGame :
- JSON (structure complète) : ${base}/api/export
- Markdown (alternative) : ${base}/api/export?format=md
- Page web (rendu humain) : ${base}/export

Ne résume pas avant d'avoir tout lu.

## Contexte
SargaGame est une app web cartographique de vigilance sargasse par plage (Martinique, Guadeloupe, Caraïbes).
~9 000 sessions/mois (78 % mobile), 11 abonnés payants à ~6,50 € → MRR 71 €.
Paywall + checkout Mollie. Conversion globale : 0,12 %.
Le rapport contient : le funnel mesuré (Carte → Fiche plage → PremiumModal → PassOffer → Checkout Mollie), 20 améliorations paywall classées, un backlog de 100 améliorations noté sur 10 colonnes, l'inventaire de 26 références Stripe résiduelles, 4 rapports (architecture / quick wins / IA / hypercroissance), un master audit et un plan de 20 tâches pour atteindre 10 000 € de MRR.

## Étape 2 — Ta mission
1. CHALLENGE chaque hypothèse chiffrée (taux du funnel, gains €/mois, benchmarks 1,5-4 %) avec des données réelles et récentes d'apps météo/voyage et de SaaS à paywall que tu trouves en ligne. Cite chaque source avec son URL.
2. CORRIGE le classement ROI du backlog si tes benchmarks contredisent les estimations du rapport (tableau avant/après pour les 25 premiers items).
3. AJOUTE 10 améliorations absentes du rapport, aux colonnes identiques (ROI, effort, risque, gain €/mois, dette tech, UX, SEO, perf, IA, autom.).
4. VÉRIFIE la faisabilité technique des 5 premières tâches moonshot contre la documentation publique de Mollie (webhooks, wallets Apple/Google Pay, lien de reprise de paiement).
5. PROPOSE un plan d'exécution semaine par semaine pour les 30 premiers jours, avec critères de succès mesurables.

## Étape 3 — Format de sortie
Un unique document Markdown téléchargeable, en français, structuré en :
# SargaGame — Audit contre-vérifié
## 1. Hypothèses validées / corrigées (avec sources)
## 2. Classement ROI corrigé (top 25)
## 3. Les 10 améliorations manquantes
## 4. Faisabilité Mollie (moonshot 1-5)
## 5. Plan 30 jours semaine par semaine
## 6. Tableau récapitulatif recalculé
Sois précis, chiffré, et signale toute incohérence interne du rapport source.`;
}

const TH = "px-3 py-2 text-left text-[0.6rem] font-mono uppercase tracking-widest text-[#4a5261] border-b hairline";
const TD = "px-3 py-2 align-top text-[0.78rem] text-[#b9bfca] border-b hairline";

export default async function ExportPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = `${proto}://${host}`;

  const [missions, items, stripe] = await Promise.all([getMissions(), getImprovements(), getStripeFindings()]);
  const paywall = items.filter((i) => i.mission === "paywall");

  return (
    <div className="space-y-12 max-w-6xl mx-auto">
      <section className="pt-8 reveal">
        <p className="kicker mb-4">
          <span className="text-[#c9f158]">export complet</span> — lisible par humain &amp; LLM · {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
        </p>
        <h1 className="text-[clamp(2.2rem,5.5vw,4rem)] font-semibold leading-[0.95] tracking-tight">
          Rapport web <span className="italic font-serif2 font-normal text-[#c9f158]">exportable</span>.
        </h1>
        <p className="text-[0.9rem] text-[#8a93a1] max-w-2xl mt-4 leading-relaxed">
          Tout le contenu du War Room en une page publique : copiez le prompt ci-dessous dans votre IA locale,
          elle lira elle-même le rapport (JSON ou Markdown) et contre-vérifiera chaque hypothèse avec ses sources.
        </p>
      </section>

      {/* PROMPT */}
      <section className="reveal">
        <ExportPrompt
          prompt={buildPrompt(base)}
          jsonUrl={`${base}/api/export`}
          mdUrl={`${base}/api/export?format=md`}
        />
      </section>

      {/* CONTEXTE */}
      <section className="reveal">
        <SectionHead index="01" sub="contexte produit" title="État des lieux" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { l: "MRR actuel", v: `${CURRENT_MRR} €` },
            { l: "Objectif", v: `${TARGET_MRR.toLocaleString("fr-FR")} €` },
            { l: "Sessions / mois", v: "9 000" },
            { l: "Conversion globale", v: "0,12 %" },
            { l: "Abonnés actifs", v: "11" },
            { l: "ARPU", v: "≈ 6,50 €" },
            { l: "Part mobile", v: "78 %" },
            { l: "Paiement", v: "Mollie" },
          ].map((s) => (
            <Panel key={s.l} className="p-4">
              <p className="num text-2xl font-semibold">{s.v}</p>
              <p className="text-[0.62rem] font-mono uppercase tracking-widest text-[#4a5261] mt-1">{s.l}</p>
            </Panel>
          ))}
        </div>
      </section>

      {/* FUNNEL */}
      <section className="reveal">
        <SectionHead index="02" sub="mesuré" title="Funnel Carte → Checkout Mollie" />
        <Panel className="overflow-x-auto p-1">
          <table className="w-full border-collapse min-w-[760px]">
            <thead>
              <tr>{["Étape", "Sessions", "% étape", "% total", "Clics", "Cause de chute"].map((x) => <th key={x} className={TH}>{x}</th>)}</tr>
            </thead>
            <tbody>
              {FUNNEL.map((s) => (
                <tr key={s.name}>
                  <td className={TD}><span className="font-semibold text-[#ecefe9]">{s.name}</span></td>
                  <td className={`${TD} num`}>{s.sessions.toLocaleString("fr-FR")}</td>
                  <td className={`${TD} num`}>{s.rate} %</td>
                  <td className={`${TD} num text-[#c9f158]`}>{s.ofTotal} %</td>
                  <td className={`${TD} num`}>{s.clicks}</td>
                  <td className={TD}>{s.drop}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        {FUNNEL.map((s) => (
          <Panel key={`${s.name}-d`} className="p-5 mt-3">
            <h3 className="font-semibold text-sm mb-3">{s.name} — frictions &amp; confiance</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <ul className="space-y-1.5">
                {s.frictions.map((f) => <li key={f} className="text-[0.78rem] text-[#b9bfca] flex gap-2"><span className="text-[#ff6b5b]/60">—</span>{f}</li>)}
              </ul>
              <ul className="space-y-1.5">
                {s.trust.map((t) => <li key={t} className="text-[0.78rem] text-[#b9bfca] flex gap-2"><span className="text-[#62e6c8]/60">+</span>{t}</li>)}
              </ul>
            </div>
          </Panel>
        ))}
      </section>

      {/* MISSIONS */}
      <section className="reveal">
        <SectionHead index="03" sub="exécution" title="Les 8 missions" />
        <Panel className="overflow-x-auto p-1">
          <table className="w-full border-collapse min-w-[680px]">
            <thead>
              <tr>{["#", "Mission", "Priorité", "Statut", "Résumé"].map((x) => <th key={x} className={TH}>{x}</th>)}</tr>
            </thead>
            <tbody>
              {missions.map((m) => (
                <tr key={m.slug}>
                  <td className={`${TD} num`}>{m.ordre}</td>
                  <td className={TD}><span className="font-semibold text-[#ecefe9]">{m.title}</span></td>
                  <td className={`${TD} text-[#c9f158] tracking-tight`}>{"★".repeat(m.stars)}{"☆".repeat(5 - m.stars)}</td>
                  <td className={TD}>{m.status}</td>
                  <td className={TD}>{m.tagline}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </section>

      {/* PAYWALL 20 */}
      <section className="reveal">
        <SectionHead index="04" sub="mission n°1" title="Les 20 améliorations paywall" />
        <Panel className="overflow-x-auto p-1">
          <table className="w-full border-collapse min-w-[820px]">
            <thead>
              <tr>{["#", "Amélioration", "Description", "ROI", "Effort", "Risque", "Gain €/mois"].map((x) => <th key={x} className={TH}>{x}</th>)}</tr>
            </thead>
            <tbody>
              {paywall.map((i, n) => (
                <tr key={i.id}>
                  <td className={`${TD} num`}>{String(n + 1).padStart(2, "0")}</td>
                  <td className={TD}><span className="font-semibold text-[#ecefe9]">{i.title}</span></td>
                  <td className={`${TD} max-w-[360px]`}>{i.descr}</td>
                  <td className={`${TD} num text-[#c9f158] font-semibold`}>{i.roi}</td>
                  <td className={`${TD} num`}>{i.effort}/10</td>
                  <td className={TD}>{i.risk}</td>
                  <td className={`${TD} num text-[#62e6c8]`}>+{i.revenue} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </section>

      {/* BACKLOG 100 */}
      <section className="reveal">
        <SectionHead index="05" sub="tri roi décroissant" title="Backlog — les 100 améliorations" />
        <Panel className="overflow-x-auto p-1">
          <table className="w-full border-collapse min-w-[820px]">
            <thead>
              <tr>{["#", "Amélioration", "Catég.", "Mission", "ROI", "Eff.", "Risque", "€/mois"].map((x) => <th key={x} className={TH}>{x}</th>)}</tr>
            </thead>
            <tbody>
              {items.map((i, n) => (
                <tr key={i.id}>
                  <td className={`${TD} num`}>{String(n + 1).padStart(3, "0")}</td>
                  <td className={TD}><span className="text-[#ecefe9]">{i.title}</span></td>
                  <td className={TD}>{i.category}</td>
                  <td className={TD}>{i.mission}</td>
                  <td className={`${TD} num ${i.roi >= 80 ? "text-[#c9f158] font-semibold" : ""}`}>{i.roi}</td>
                  <td className={`${TD} num`}>{i.effort}</td>
                  <td className={TD}>{i.risk}</td>
                  <td className={`${TD} num ${i.revenue > 0 ? "text-[#62e6c8]" : "text-[#4a5261]"}`}>{i.revenue > 0 ? `+${i.revenue}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </section>

      {/* STRIPE */}
      <section className="reveal">
        <SectionHead index="06" sub="dette de migration" title="Inventaire Stripe — 26 références" />
        <Panel className="overflow-x-auto p-1">
          <table className="w-full border-collapse min-w-[820px]">
            <thead>
              <tr>{["Référence", "Type", "Utilisée ?", "Supprimable ?", "Risque", "Note d'action"].map((x) => <th key={x} className={TH}>{x}</th>)}</tr>
            </thead>
            <tbody>
              {stripe.map((s) => (
                <tr key={s.id}>
                  <td className={TD}><span className="font-mono text-[0.72rem] text-[#ecefe9] break-all">{s.path}:{s.line}</span><br /><span className="font-mono text-[0.64rem] text-[#4a5261]">{s.snippet}</span></td>
                  <td className={TD}>{s.kind}</td>
                  <td className={TD}>{s.used ? "oui" : "morte"}</td>
                  <td className={TD}>{s.deletable}</td>
                  <td className={`${TD} ${s.risk === "Élevé" ? "text-[#ff6b5b]" : s.risk === "Moyen" ? "text-[#ffb84d]" : ""}`}>{s.risk}</td>
                  <td className={`${TD} max-w-[320px]`}>{s.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </section>

      {/* RAPPORTS */}
      <section className="reveal">
        <SectionHead index="07" sub="narratif" title="Les 4 rapports" />
        {RAPPORTS.map((r) => (
          <Panel key={r.slug} className="p-6 mb-4">
            <h3 className="font-semibold mb-2">{r.title}</h3>
            <p className="text-[0.85rem] text-[#d4d9e0] leading-relaxed mb-4">{r.verdict}</p>
            <ul className="space-y-2.5">
              {r.findings.map((f) => (
                <li key={f.title} className="text-[0.8rem] text-[#b9bfca] leading-relaxed">
                  <span className="font-semibold text-[#ecefe9]">[{f.severity}] {f.title}</span> — {f.detail}{" "}
                  <span className="text-[#4a5261] font-mono text-[0.68rem]">({f.evidence})</span>{" "}
                  <span className="text-[#62e6c8]">→ {f.recommendation}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </section>

      {/* MASTER */}
      <section className="reveal">
        <SectionHead index="08" sub="synthèse" title="Master audit & moonshot" />
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <Panel className="p-5">
            <p className="kicker mb-3 text-[#c9f158]">Forces</p>
            <ul className="space-y-2">{MASTER.forces.map((f) => <li key={f} className="text-[0.8rem] text-[#d4d9e0]">+ {f}</li>)}</ul>
          </Panel>
          <Panel className="p-5">
            <p className="kicker mb-3 text-[#ff6b5b]">Faiblesses</p>
            <ul className="space-y-2">{MASTER.faiblesses.map((f) => <li key={f} className="text-[0.8rem] text-[#d4d9e0]">− {f}</li>)}</ul>
          </Panel>
        </div>
        <Panel className="p-5 mb-4">
          <p className="kicker mb-3">Dettes (gravité /100)</p>
          <ul className="space-y-2.5">
            {MASTER.dettes.map((d) => (
              <li key={d.label} className="text-[0.8rem] text-[#b9bfca]">
                <span className="font-semibold text-[#ecefe9]">{d.label} — {d.score}/100</span>
                <span className="text-[#4a5261]"> · </span>{d.items.join(" · ")}
              </li>
            ))}
          </ul>
        </Panel>
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <Panel className="p-5">
            <p className="kicker mb-3 text-[#62e6c8]">Opportunités</p>
            <ul className="space-y-2">{MASTER.opportunites.map((f) => <li key={f} className="text-[0.8rem] text-[#d4d9e0]">○ {f}</li>)}</ul>
          </Panel>
          <Panel className="p-5">
            <p className="kicker mb-3 text-[#ffb84d]">Menaces</p>
            <ul className="space-y-2">{MASTER.menaces.map((f) => <li key={f} className="text-[0.8rem] text-[#d4d9e0]">! {f}</li>)}</ul>
          </Panel>
        </div>
        <Panel className="overflow-x-auto p-1">
          <table className="w-full border-collapse min-w-[760px]">
            <thead>
              <tr>{["#", "Tâche moonshot", "Phase", "Gain €/mois", "Pourquoi"].map((x) => <th key={x} className={TH}>{x}</th>)}</tr>
            </thead>
            <tbody>
              {MOONSHOT_20.map((t) => (
                <tr key={t.n}>
                  <td className={`${TD} num`}>{String(t.n).padStart(2, "0")}</td>
                  <td className={TD}><span className="font-semibold text-[#ecefe9]">{t.title}</span></td>
                  <td className={`${TD} num`}>P{t.phase}</td>
                  <td className={`${TD} num text-[#62e6c8]`}>{t.gain > 0 ? `+${t.gain} €` : "prérequis"}</td>
                  <td className={`${TD} max-w-[380px]`}>{t.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 pb-4">
          {TRAJECTOIRE.map((p) => (
            <Panel key={p.phase} className="p-4">
              <p className="num text-xl font-semibold text-[#c9f158]">{p.mrrCible.toLocaleString("fr-FR")} €</p>
              <p className="font-semibold text-sm">{p.nom} <span className="font-mono text-[0.6rem] text-[#4a5261]">· {p.periode}</span></p>
              <p className="text-[0.72rem] text-[#8a93a1] mt-1">{p.leviers.join(" · ")}</p>
            </Panel>
          ))}
        </div>
      </section>
    </div>
  );
}
