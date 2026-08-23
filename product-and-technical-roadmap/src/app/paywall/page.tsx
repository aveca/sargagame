import { getImprovements } from "@/lib/data";
import { Panel, SectionHead } from "@/components/ui";
import { FunnelViz } from "@/components/FunnelViz";
import { PaywallMatrix } from "@/components/PaywallMatrix";
import { PaywallBoard } from "@/components/PaywallBoard";
import { CountUp } from "@/components/CountUp";
import { FUNNEL_BUYERS, FUNNEL_TOTAL_SESSIONS } from "@/lib/seed/paywall";

export const dynamic = "force-dynamic";

const COMPARABLES = [
  { app: "Apps météo/surf premium", conv: "1,5 – 3 %", note: "paywall contextualisé sur le spot consulté" },
  { app: "Apps voyage (abonnement pass)", conv: "2 – 4 %", note: "essai + garantie au-dessus du CTA" },
  { app: "SaaS mobile top-quartile", conv: "5 %+", note: "1 plan, wallets natifs, preuve sociale" },
  { app: "SargaGame — aujourd'hui", conv: "0,12 %", note: "4 clics, 3 plans, réassurance absente", bad: true },
];

export default async function PaywallPage() {
  const items = await getImprovements();
  const paywall = items.filter((i) => i.mission === "paywall");

  return (
    <div className="space-y-14">
      <section className="pt-8 reveal">
        <p className="kicker mb-4">
          <span className="text-[#c9f158]">Mission 01 · priorité ★★★★★</span> — ne rien modifier, tout mesurer
        </p>
        <h1 className="text-[clamp(2.2rem,5.5vw,4.2rem)] font-semibold leading-[0.95] tracking-tight max-w-4xl">
          Le problème n'est pas le paiement.
          <br />
          <span className="italic font-serif2 font-normal text-[#c9f158]">C'est la conversion.</span>
        </h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-5 gap-x-8 mt-9 max-w-3xl">
          {[
            { v: FUNNEL_TOTAL_SESSIONS, l: "sessions / mois" },
            { v: FUNNEL_BUYERS, l: "paiements réussis" },
            { v: 71, suffix: " €", l: "MRR actuel" },
            { v: 4, l: "clics jusqu'au paiement" },
          ].map((s) => (
            <div key={s.l}>
              <p className="text-3xl font-semibold num"><CountUp value={s.v} suffix={s.suffix ?? ""} /></p>
              <p className="text-[0.65rem] font-mono uppercase tracking-widest text-[#4a5261] mt-1">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FUNNEL */}
      <section className="reveal">
        <SectionHead index="A" sub="cartographie des abandons" title="Funnel mesuré, étape par étape" />
        <Panel className="p-6">
          <FunnelViz />
        </Panel>
      </section>

      {/* COMPARAISON */}
      <section className="reveal">
        <SectionHead index="B" sub="marché" title="Repères conversion — meilleurs SaaS mobile & apps de voyage" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COMPARABLES.map((c) => (
            <Panel key={c.app} hover className={`p-5 ${c.bad ? "border-[#ff6b5b]/40" : ""}`}>
              <p className={`text-3xl font-semibold num ${c.bad ? "text-[#ff6b5b]" : "text-[#c9f158]"}`}>{c.conv}</p>
              <p className="text-sm font-medium mt-1">{c.app}</p>
              <p className="text-[0.72rem] text-[#8a93a1] mt-1.5 leading-snug">{c.note}</p>
            </Panel>
          ))}
        </div>
        <p className="text-[0.75rem] text-[#4a5261] font-mono mt-4">
          → Rattraper la moitié du fourchette bas des apps météo (0,75 %) suffit à multiplier le MRR par ~6 sans aucun trafic supplémentaire.
        </p>
      </section>

      {/* MATRICE */}
      <section className="reveal">
        <SectionHead index="C" sub="impact business × effort" title="La matrice des 20 améliorations" />
        <Panel className="p-6">
          <PaywallMatrix items={paywall} />
        </Panel>
      </section>

      {/* LES 20 */}
      <section className="reveal">
        <SectionHead index="D" sub="impact / effort / risque" title="Les 20 améliorations classées" />
        <PaywallBoard items={paywall} />
      </section>
    </div>
  );
}
