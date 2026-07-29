import type { ReactNode } from "react";
import type { ItemStatus, MissionStatus, RiskLevel } from "@/lib/types";

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="kicker">{children}</p>;
}

export function Panel({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return <div className={`panel ${hover ? "panel-hover" : ""} ${className}`}>{children}</div>;
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const map: Record<RiskLevel, string> = {
    Faible: "text-[#62e6c8] border-[#62e6c8]/30 bg-[#62e6c8]/8",
    Moyen: "text-[#ffb84d] border-[#ffb84d]/30 bg-[#ffb84d]/8",
    Élevé: "text-[#ff6b5b] border-[#ff6b5b]/30 bg-[#ff6b5b]/8",
  };
  return (
    <span className={`chip border ${map[risk]}`}>{risk}</span>
  );
}

export function StatusBadge({ status }: { status: ItemStatus | MissionStatus }) {
  const map: Record<string, string> = {
    todo: "text-[#8a93a1] border-[#2a344a] bg-white/[0.03]",
    progress: "text-[#ffb84d] border-[#ffb84d]/30 bg-[#ffb84d]/8",
    done: "text-[#c9f158] border-[#c9f158]/35 bg-[#c9f158]/8",
    rejected: "text-[#ff6b5b] border-[#ff6b5b]/30 bg-[#ff6b5b]/8",
  };
  const label: Record<string, string> = {
    todo: "À faire",
    progress: "En cours",
    done: "Fait",
    rejected: "Écarté",
  };
  return <span className={`chip border ${map[status]}`}>{label[status]}</span>;
}

export function ScoreBar({ value, tone = "lime" }: { value: number; tone?: "lime" | "teal" | "coral" }) {
  const colors = { lime: "#c9f158", teal: "#62e6c8", coral: "#ff6b5b" };
  return (
    <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
      <div
        className="h-full rounded-full grow-bar"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: colors[tone] }}
      />
    </div>
  );
}

export function SectionHead({
  index,
  title,
  sub,
  right,
}: {
  index: string;
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-6 mb-6 mt-2">
      <div>
        <p className="kicker mb-2">
          <span className="text-[#c9f158]">{index}</span> — {sub ?? "section"}
        </p>
        <h2 className="text-[clamp(1.5rem,3.2vw,2.4rem)] font-semibold tracking-tight leading-none">
          {title}
        </h2>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
