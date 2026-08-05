import { CURRENT_MRR, TARGET_MRR } from "@/lib/seed/paywall";
import { CountUp } from "./CountUp";

// Arc SVG : progression de 71 € vers 10 000 € (échelle log pour lisibilité)
export function GaugeMrr({ captured = 0 }: { captured?: number }) {
  const effective = Math.max(CURRENT_MRR + captured, 1);
  const pct = Math.log(effective + 1) / Math.log(TARGET_MRR + 1);
  const R = 120;
  const CX = 150;
  const CY = 150;
  // arc de -210° à 30° (240° total)
  const start = -210;
  const end = start + 240 * Math.min(1, pct);
  const polar = (angle: number, r: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
  };
  const arc = (from: number, to: number, r: number) => {
    const [x1, y1] = polar(from, r);
    const [x2, y2] = polar(to, r);
    const large = to - from > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  return (
    <div className="relative">
      <svg viewBox="0 0 300 205" className="w-full">
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#62e6c8" />
            <stop offset="100%" stopColor="#c9f158" />
          </linearGradient>
        </defs>
        <path d={arc(start, 30, R)} fill="none" stroke="#1b2230" strokeWidth="14" strokeLinecap="round" />
        <path
          d={arc(start, end, R)}
          fill="none"
          stroke="url(#gauge-grad)"
          strokeWidth="14"
          strokeLinecap="round"
          className="tick"
        />
        {/* jalons log */}
        {[100, 500, 1000, 5000, 10000].map((m) => {
          const p = Math.log(m + 1) / Math.log(TARGET_MRR + 1);
          const a = start + 240 * Math.min(1, p);
          const [x1, y1] = polar(a, R - 18);
          const [x2, y2] = polar(a, R - 26);
          return (
            <g key={m}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#4a5261" strokeWidth="1.5" />
            </g>
          );
        })}
        <text x={CX} y={CY - 18} textAnchor="middle" className="fill-[#8a93a1]" fontSize="10" fontFamily="var(--font-mono)">
          MRR ACTUEL
        </text>
        <text x={CX} y={CY + 14} textAnchor="middle" className="fill-[#ecefe9]" fontSize="34" fontWeight="700" fontFamily="var(--font-grotesk)">
          {Math.round(effective)} €
        </text>
        <text x={CX} y={CY + 34} textAnchor="middle" className="fill-[#c9f158]" fontSize="10" fontFamily="var(--font-mono)">
          → OBJECTIF 10 000 €
        </text>
      </svg>
      <div className="flex justify-between px-1 -mt-2">
        {[
          { l: "départ", v: CURRENT_MRR },
          { l: "phase 1", v: 320 },
          { l: "phase 2", v: 1800 },
          { l: "phase 3", v: 4500 },
          { l: "phase 4", v: 10000 },
        ].map((m) => (
          <div key={m.l} className="text-center">
            <p className="text-[0.6rem] font-mono uppercase tracking-widest text-[#4a5261]">{m.l}</p>
            <p className={`text-sm font-semibold num ${m.v <= effective ? "text-[#c9f158]" : "text-[#8a93a1]"}`}>
              <CountUp value={m.v} suffix=" €" />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
