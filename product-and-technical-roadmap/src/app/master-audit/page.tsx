import { getStats } from "@/lib/data";
import { Panel, SectionHead } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { MASTER, MOONSHOT_20, TRAJECTOIRE } from "@/lib/seed/master";
import { Check, X, TrendingUp, AlertTriangle, Target } from "lucide-react";

export const dynamic = "force-dynamic";

const PHASE_STYLE: Record<number, string> = {
  1: "text-[#c9f158] border-[#c9f158]/40 bg-[#c9f158]/8",
  2: "text-[#62e6c8] border-[#62e6c8]/40 bg-[#62e6c8]/8",
  3: "text-[#ffb84d] border-[#ffb84d]/40 bg-[#ffb84d]/8",
  4: "text-[#ff6b5b] border-[#ff6b5b]/40 bg-[#ff6b5b]/8",
};

export default async function MasterAuditPage() {
  const stats = await getStats();

  return (
    <div className="space-y-12 max-w-5xl mx-auto">
      {/* ─── en-tête document ─── */}
      <section className="pt-8 reveal">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="kicker mb-4">
              <span className="text-[#c9f158]">MASTER_AUDIT.md</span> — mission 08 · document de synthèse CTO
            </p>
            <h1 className="text-[clamp(2.2rem,5.5vw,4rem)] font-semibold leading-[0.95] tracking-tight">
              Audit <span className="italic font-serif2 font-normal text-[#c9f158]">master</span> du projet.
            </h1>
          </div>
          <PrintButton />
        </div>
        <div className="flex flex-wrap gap-2 mt-6">
          {[
            `${stats.totalItems} améliorations classées ROI`,
            `${stats.potentialMrr.toLocaleString("fr-FR")} €/mois de potentiel identifié`,
            `${stats.stripeTotal} références Stripe auditées`,
            "20 tâches moonshot 71 € → 10 000 €",
          ].map((c) => (
            <span key={c} className="chip">{c}</span>
          ))}
        </div>
      </section>

      {/* ─── forces / faiblesses ─── */}
      <section className="grid md:grid-cols-2 gap-4 reveal">
        <Panel className="p-6">
          <p className="kicker mb-4 text-[#c9f158]">Forces</p>
          <ul className="space-y-3">
            {MASTER.forces.map((f) => (
              <li key={f} className="flex gap-2.5 text-[0.83rem] leading-relaxed text-[#d4d9e0]">
                <Check size={14} className="text-[#c9f158] shrink-0 mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="p-6">
          <p className="kicker mb-4 text-[#ff6b5b]">Faiblesses</p>
          <ul className="space-y-3">
            {MASTER.faiblesses.map((f) => (
              <li key={f} className="flex gap-2.5 text-[0.83rem] leading-relaxed text-[#d4d9e0]">
                <X size={14} className="text-[#ff6b5b] shrink-0 mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      {/* ─── dettes ─── */}
      <section className="reveal">
        <SectionHead index="D" sub="sept fronts" title="Cartographie des dettes" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MASTER.dettes.map((d) => (
            <Panel key={d.label} hover className="p-5">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="font-semibold text-sm">{d.label}</h3>
                <span className={`num text-sm font-semibold ${d.score >= 80 ? "text-[#ff6b5b]" : d.score >= 65 ? "text-[#ffb84d]" : "text-[#8a93a1]"}`}>
                  {d.score}
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden mb-4">
                <div
                  className="h-full rounded-full grow-bar"
                  style={{
                    width: `${d.score}%`,
                    background: d.score >= 80 ? "#ff6b5b" : d.score >= 65 ? "#ffb84d" : "#62e6c8",
                  }}
                />
              </div>
              <ul className="space-y-2">
                {d.items.map((it) => (
                  <li key={it} className="text-[0.76rem] text-[#8a93a1] leading-snug flex gap-2">
                    <span className="text-[#4a5261]">—</span>
                    {it}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      </section>

      {/* ─── opportunités / menaces ─── */}
      <section className="grid md:grid-cols-2 gap-4 reveal">
        <Panel className="p-6">
          <p className="kicker mb-4 flex items-center gap-2">
            <TrendingUp size={12} className="text-[#62e6c8]" /> Opportunités
          </p>
          <ol className="space-y-3">
            {MASTER.opportunites.map((o, i) => (
              <li key={o} className="flex gap-3 text-[0.83rem] leading-relaxed text-[#d4d9e0]">
                <span className="font-mono text-[0.68rem] text-[#62e6c8] mt-0.5">O{i + 1}</span>
                {o}
              </li>
            ))}
          </ol>
        </Panel>
        <Panel className="p-6">
          <p className="kicker mb-4 flex items-center gap-2">
            <AlertTriangle size={12} className="text-[#ffb84d]" /> Menaces
          </p>
          <ol className="space-y-3">
            {MASTER.menaces.map((m, i) => (
              <li key={m} className="flex gap-3 text-[0.83rem] leading-relaxed text-[#d4d9e0]">
                <span className="font-mono text-[0.68rem] text-[#ffb84d] mt-0.5">M{i + 1}</span>
                {m}
              </li>
            ))}
          </ol>
        </Panel>
      </section>

      {/* ─── moonshot 20 ─── */}
      <section className="reveal">
        <SectionHead
          index="M"
          sub="le plan"
          title="Les 20 tâches : 71 € → 10 000 €/mois"
          right={
            <span className="chip">
              <Target size={11} className="inline mr-1 text-[#c9f158]" />
              trajectoire 12 mois
            </span>
          }
        />
        <Panel className="divide-y divide-[#1b2230]">
          {MOONSHOT_20.map((t) => (
            <div key={t.n} className="grid grid-cols-[44px_1fr_auto] md:grid-cols-[56px_1fr_130px_90px] items-center gap-3 px-4 py-3.5">
              <span className="font-mono text-[0.7rem] text-[#4a5261] num">{String(t.n).padStart(2, "0")}</span>
              <div className="min-w-0">
                <p className="text-[0.86rem] font-medium leading-snug">{t.title}</p>
                <p className="text-[0.72rem] text-[#8a93a1] mt-0.5 leading-snug hidden md:block">{t.why}</p>
              </div>
              <span className={`chip border justify-self-start ${PHASE_STYLE[t.phase]}`}>P{t.phase}</span>
              <span className={`num text-right font-semibold text-[0.85rem] ${t.gain > 0 ? "text-[#62e6c8]" : "text-[#4a5261]"}`}>
                {t.gain > 0 ? `+${t.gain} €` : "prérequis"}
              </span>
            </div>
          ))}
        </Panel>
      </section>

      {/* ─── trajectoire ─── */}
      <section className="reveal pb-4">
        <SectionHead index="T" sub="jalons" title="Trajectoire consolidée" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TRAJECTOIRE.map((p) => (
            <Panel key={p.phase} hover className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className={`chip border ${PHASE_STYLE[p.phase]}`}>Phase {p.phase}</span>
                <span className="font-mono text-[0.65rem] text-[#4a5261]">{p.periode}</span>
              </div>
              <p className="num text-3xl font-semibold text-[#c9f158]">{p.mrrCible.toLocaleString("fr-FR")} €</p>
              <p className="font-semibold text-sm mt-1">{p.nom}</p>
              <ul className="mt-2.5 space-y-1">
                {p.leviers.map((l) => (
                  <li key={l} className="text-[0.72rem] text-[#8a93a1] flex gap-1.5">
                    <span className="text-[#4a5261]">·</span> {l}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
        <p className="text-[0.72rem] text-[#4a5261] font-mono mt-6">
          Conclusion — Ne pas refactorer. Contrôler la conversion semaine 1-3, ouvrir l'acquisition semaine 4-10, expansion ensuite.
          La dette technique ne se rembourse que sur la trajectoire de vente.
        </p>
      </section>
    </div>
  );
}
