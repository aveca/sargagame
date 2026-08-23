import type { ImprovementRow } from "@/lib/types";

// Matrice 2×2 : X = effort (1-10), Y = ROI (0-100)
export function PaywallMatrix({ items }: { items: ImprovementRow[] }) {
  const W = 640;
  const H = 420;
  const PAD = 46;
  const x = (eff: number) => PAD + ((eff - 1) / 9) * (W - 2 * PAD);
  const y = (roi: number) => H - PAD - (roi / 100) * (H - 2 * PAD);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* quadrants */}
        <rect x={PAD} y={PAD} width={(W - 2 * PAD) / 2} height={(H - 2 * PAD) / 2} fill="#c9f158" opacity="0.05" />
        <rect x={PAD + (W - 2 * PAD) / 2} y={PAD} width={(W - 2 * PAD) / 2} height={(H - 2 * PAD) / 2} fill="#62e6c8" opacity="0.04" />
        {/* grille */}
        {[25, 50, 75].map((v) => (
          <line key={v} x1={PAD} y1={y(v)} x2={W - PAD} y2={y(v)} stroke="#1b2230" strokeDasharray="3 5" />
        ))}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#2a344a" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#2a344a" />
        {/* médianes */}
        <line x1={x(5.5)} y1={PAD} x2={x(5.5)} y2={H - PAD} stroke="#2a344a" strokeDasharray="2 4" />
        <line x1={PAD} y1={y(78)} x2={W - PAD} y2={y(78)} stroke="#2a344a" strokeDasharray="2 4" />
        {/* labels quadrants */}
        <text x={PAD + 10} y={PAD + 18} fontSize="10" fill="#c9f158" fontFamily="var(--font-mono)" letterSpacing="1.5">
          QUICK WINS — SHIPPER D'ABORD
        </text>
        <text x={W - PAD - 10} y={PAD + 18} textAnchor="end" fontSize="10" fill="#62e6c8" fontFamily="var(--font-mono)" letterSpacing="1.5">
          GROS PARIS — PLANIFIER
        </text>
        <text x={PAD + 10} y={H - PAD - 10} fontSize="10" fill="#4a5261" fontFamily="var(--font-mono)" letterSpacing="1.5">
          COMBLES — SI TEMPS LIBRE
        </text>
        <text x={W - PAD - 10} y={H - PAD - 10} textAnchor="end" fontSize="10" fill="#4a5261" fontFamily="var(--font-mono)" letterSpacing="1.5">
          PIÈGES — ÉVITER
        </text>
        {/* axes */}
        <text x={W / 2} y={H - 10} textAnchor="middle" fontSize="10" fill="#8a93a1" fontFamily="var(--font-mono)">
          EFFORT →
        </text>
        <text x={14} y={H / 2} fontSize="10" fill="#8a93a1" fontFamily="var(--font-mono)" transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle">
          ROI →
        </text>
        {/* points */}
        {items.map((it, i) => {
          const done = it.status === "done";
          return (
            <g key={it.id} className="group/dot">
              <circle
                cx={x(it.effort)}
                cy={y(it.roi)}
                r="13"
                fill={done ? "#62e6c8" : "#c9f158"}
                opacity={done ? 0.5 : 0.16}
              />
              <circle
                cx={x(it.effort)}
                cy={y(it.roi)}
                r="5"
                fill={done ? "#62e6c8" : "#c9f158"}
              />
              <text
                x={x(it.effort)}
                y={y(it.roi) - 10}
                textAnchor="middle"
                fontSize="8.5"
                fill="#8a93a1"
                fontFamily="var(--font-mono)"
              >
                {String(i + 1).padStart(2, "0")}
              </text>
              <title>{it.title} — ROI {it.roi} · effort {it.effort}</title>
            </g>
          );
        })}
      </svg>
      <p className="text-[0.65rem] font-mono text-[#4a5261] mt-2">
        ◦ numérotés selon le rang ROI — survoler pour le titre ·{" "}
        <span className="text-[#62e6c8]">turquoise = fait</span>
      </p>
    </div>
  );
}
