import { FUNNEL, FUNNEL_TOTAL_SESSIONS } from "@/lib/seed/paywall";
import { MousePointerClick, ShieldCheck, AlertTriangle } from "lucide-react";

const STEP_COLORS = ["#62e6c8", "#7fd9b8", "#a3d977", "#c9f158", "#e3f76b"];

export function FunnelViz({ compact = false }: { compact?: boolean }) {
  const max = FUNNEL_TOTAL_SESSIONS;
  return (
    <div className="space-y-3">
      {FUNNEL.map((s, i) => {
        const w = Math.max(6, (s.sessions / max) * 100);
        const prevDrop = i > 0 ? 100 - s.rate : 0;
        return (
          <div key={s.name} className="group">
            {/* connecteur de chute */}
            {i > 0 && (
              <div className="flex items-center gap-2 pl-4 py-1">
                <span className="h-4 w-px bg-[#ff6b5b]/50" />
                <span className="text-[0.65rem] font-mono text-[#ff6b5b]/90">
                  −{prevDrop.toFixed(1)} % · {s.drop}
                </span>
              </div>
            )}
            <div className="grid grid-cols-[1fr] md:grid-cols-[220px_1fr_120px] gap-2 md:items-center">
              {/* label */}
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[0.65rem] text-[#4a5261]">0{i + 1}</span>
                <div>
                  <p className="font-semibold text-sm leading-tight">{s.name}</p>
                  {!compact && <p className="text-[0.68rem] text-[#8a93a1]">{s.subtitle}</p>}
                </div>
              </div>
              {/* barre */}
              <div className="relative h-11 rounded-lg bg-white/[0.03] border hairline overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 grow-bar rounded-r-lg"
                  style={{ width: `${w}%`, background: `linear-gradient(90deg, ${STEP_COLORS[i]}22, ${STEP_COLORS[i]}44)`, borderRight: `2px solid ${STEP_COLORS[i]}` }}
                />
                <div className="absolute inset-0 flex items-center justify-between px-3">
                  <span className="text-xs font-mono num text-[#ecefe9]">
                    {s.sessions.toLocaleString("fr-FR")} <span className="text-[#4a5261]">sessions/mois</span>
                  </span>
                  <span className="flex items-center gap-3 text-[0.68rem] font-mono">
                    <span className="text-[#8a93a1] hidden sm:flex items-center gap-1">
                      <MousePointerClick size={11} /> {s.clicks} clics
                    </span>
                    <span style={{ color: STEP_COLORS[i] }}>{s.ofTotal.toFixed(1)} %</span>
                  </span>
                </div>
              </div>
              {/* taux */}
              <div className="text-right">
                <p className="text-sm font-semibold num">{s.rate.toFixed(1)} %</p>
                <p className="text-[0.62rem] font-mono text-[#4a5261] uppercase tracking-wider">étape →</p>
              </div>
            </div>
            {/* détails frictions / confiance */}
            {!compact && (
              <details className="ml-4 md:ml-[236px] mt-1 group-open:block">
                <summary className="cursor-pointer select-none text-[0.68rem] font-mono text-[#8a93a1] hover:text-[#c9f158] transition-colors list-none flex items-center gap-1.5">
                  <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
                  {s.frictions.length} frictions · {s.trust.length} éléments de confiance
                </summary>
                <div className="grid md:grid-cols-2 gap-3 pt-2 pb-1">
                  <div className="panel p-3">
                    <p className="flex items-center gap-1.5 text-[0.65rem] font-mono uppercase tracking-widest text-[#ff6b5b] mb-2">
                      <AlertTriangle size={11} /> Frictions
                    </p>
                    <ul className="space-y-1.5">
                      {s.frictions.map((f) => (
                        <li key={f} className="text-[0.78rem] text-[#b9bfca] leading-snug flex gap-2">
                          <span className="text-[#ff6b5b]/60 mt-0.5">—</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="panel p-3">
                    <p className="flex items-center gap-1.5 text-[0.65rem] font-mono uppercase tracking-widest text-[#62e6c8] mb-2">
                      <ShieldCheck size={11} /> Confiance
                    </p>
                    <ul className="space-y-1.5">
                      {s.trust.map((f) => (
                        <li key={f} className="text-[0.78rem] text-[#b9bfca] leading-snug flex gap-2">
                          <span className="text-[#62e6c8]/60 mt-0.5">+</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
