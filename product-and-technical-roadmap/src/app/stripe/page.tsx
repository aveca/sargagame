import { getStripeFindings } from "@/lib/data";
import { Panel, SectionHead } from "@/components/ui";
import { StripeTable } from "@/components/StripeTable";
import { CountUp } from "@/components/CountUp";

export const dynamic = "force-dynamic";

export default async function StripePage() {
  const rows = await getStripeFindings();
  const dead = rows.filter((r) => !r.used).length;
  const high = rows.filter((r) => r.risk === "Élevé").length;
  const planned = rows.filter((r) => r.deletable === "oui").length;

  return (
    <div className="space-y-8">
      <section className="pt-8 reveal">
        <p className="kicker mb-4">
          <span className="text-[#c9f158]">Mission 03 · chasse à la dette</span> — migration Stripe → Mollie inachevée
        </p>
        <h1 className="text-[clamp(2.2rem,5.5vw,4rem)] font-semibold leading-[0.95] tracking-tight">
          Inventaire exhaustif des <span className="italic font-serif2 font-normal text-[#c9f158]">références Stripe</span>.
        </h1>
        <p className="text-[0.9rem] text-[#8a93a1] max-w-2xl mt-4 leading-relaxed">
          Imports, API, webhooks, configs, README, docs, commentaires, JSON, variables d'env, routes, code mort.
          Deux pièges identifiés : une <span className="text-[#ff6b5b]">mention CGV légalement fausse</span> et un{" "}
          <span className="text-[#ffb84d]">healthcheck couplé à une variable d'env morte</span>.
        </p>
        <div className="flex flex-wrap gap-8 mt-7">
          {[
            { v: rows.length, l: "références trouvées" },
            { v: dead, l: "mortes / non utilisées" },
            { v: planned, l: "supprimables telles quelles" },
            { v: high, l: "à risque élevé", tone: "#ff6b5b" },
          ].map((s) => (
            <div key={s.l}>
              <p className="text-3xl font-semibold num" style={{ color: s.tone ?? "#ecefe9" }}>
                <CountUp value={s.v} />
              </p>
              <p className="text-[0.65rem] font-mono uppercase tracking-widest text-[#4a5261] mt-1">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      <Panel className="p-5 border-[#ff6b5b]/30 reveal">
        <p className="text-sm font-semibold text-[#ff6b5b] mb-1">À corriger avant toute suppression</p>
        <p className="text-[0.82rem] text-[#b9bfca] leading-relaxed">
          <code className="font-mono text-[0.74rem] text-[#ecefe9]">public/legal/cgv.html:88</code> — « Paiement traité par Stripe, Inc. » est
          une mention légale active et incorrecte : le prestataire réel est Mollie B.V. C'est la seule ligne de cet inventaire
          qui est un <em>risque juridique</em>, pas une dette de propreté.
        </p>
      </Panel>

      <section className="reveal">
        <SectionHead index="S" sub="traitement piloté" title="Inventaire des 26 références" />
        <StripeTable rows={rows} />
      </section>
    </div>
  );
}
