import { Panel, SectionHead } from "@/components/ui";
import { RAPPORTS } from "@/lib/seed/rapports";
import { ShieldAlert, ArrowUpRight } from "lucide-react";

export const dynamic = "force-dynamic";

const SEV_STYLE: Record<string, string> = {
  Critique: "text-[#ff6b5b] border-[#ff6b5b]/30 bg-[#ff6b5b]/8",
  "Élevée": "text-[#ffb84d] border-[#ffb84d]/30 bg-[#ffb84d]/8",
  Moyenne: "text-[#62e6c8] border-[#62e6c8]/30 bg-[#62e6c8]/8",
  Faible: "text-[#8a93a1] border-[#2a344a] bg-white/[0.03]",
};

export default function RapportsPage() {
  return (
    <div className="space-y-10">
      <section className="pt-8 reveal">
        <p className="kicker mb-4">
          <span className="text-[#c9f158]">Missions 04 · 05 · 06 · 07</span> — rapports narratifs
        </p>
        <h1 className="text-[clamp(2.2rem,5.5vw,4rem)] font-semibold leading-[0.95] tracking-tight">
          Architecture, quick wins, IA, <span className="italic font-serif2 font-normal text-[#c9f158]">hypercroissance</span>.
        </h1>
      </section>

      {/* ancres */}
      <nav className="flex flex-wrap gap-2 reveal no-print">
        {RAPPORTS.map((r, i) => (
          <a key={r.slug} href={`#${r.slug}`} className="chip hover:text-[#c9f158] hover:border-[#c9f158]/40 transition-colors">
            0{i + 4} · {r.title.split("—")[0].split("&")[0].trim()}
          </a>
        ))}
      </nav>

      {RAPPORTS.map((r, ri) => (
        <section key={r.slug} id={r.slug} className="scroll-mt-24 reveal">
          <SectionHead index={`0${ri + 4}`} sub="rapport" title={r.title} />
          <Panel className="p-6 mb-4 border-l-2 border-l-[#c9f158]">
            <p className="text-[0.92rem] leading-relaxed text-[#d4d9e0] max-w-4xl">{r.verdict}</p>
          </Panel>
          <div className="grid md:grid-cols-2 gap-4">
            {r.findings.map((f) => (
              <Panel key={f.title} hover className="p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-[0.92rem] leading-snug max-w-[80%]">{f.title}</h3>
                  <span className={`chip border shrink-0 ${SEV_STYLE[f.severity]}`}>{f.severity}</span>
                </div>
                <p className="text-[0.8rem] text-[#8a93a1] leading-relaxed">{f.detail}</p>
                <div className="mt-auto space-y-2 border-t hairline pt-3">
                  <p className="flex items-center gap-1.5 font-mono text-[0.65rem] text-[#4a5261] break-all">
                    <ShieldAlert size={11} className="shrink-0" /> {f.evidence}
                  </p>
                  <p className="flex items-start gap-1.5 text-[0.76rem] text-[#62e6c8] leading-snug">
                    <ArrowUpRight size={12} className="shrink-0 mt-0.5" /> {f.recommendation}
                  </p>
                </div>
              </Panel>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
