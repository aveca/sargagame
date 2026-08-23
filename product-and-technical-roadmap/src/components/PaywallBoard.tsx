"use client";

import { useState } from "react";
import type { ImprovementRow } from "@/lib/types";
import { RiskBadge } from "./ui";
import { StatusSelect } from "./StatusSelect";
import { ChevronDown, TrendingUp } from "lucide-react";

function ImpactDots({ roi }: { roi: number }) {
  const n = Math.max(1, Math.round(roi / 20));
  return (
    <span className="inline-flex gap-0.5" title={`Impact ${n}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < n ? "bg-[#c9f158]" : "bg-[#2a344a]"}`} />
      ))}
    </span>
  );
}

export function PaywallBoard({ items }: { items: ImprovementRow[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const totalGain = items.reduce((a, i) => a + i.revenue, 0);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="chip">
          <TrendingUp size={11} className="inline mr-1 text-[#c9f158]" />
          gain cumulé estimé ≈ <span className="text-[#c9f158] num">{totalGain.toLocaleString("fr-FR")} €/mois</span>
        </span>
        <span className="chip hidden sm:inline-block">classé par impact business</span>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => {
          const open = openId === it.id;
          return (
            <div
              key={it.id}
              className={`panel panel-hover overflow-hidden ${it.status === "done" ? "opacity-55" : ""}`}
            >
              <div
                className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[44px_1fr_170px_auto] items-center gap-3 px-4 py-3.5 cursor-pointer"
                onClick={() => setOpenId(open ? null : it.id)}
              >
                <span className="font-mono text-[0.68rem] text-[#4a5261] num w-8">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <p className="text-[0.88rem] font-medium leading-snug truncate">{it.title}</p>
                  <div className="flex items-center gap-2.5 mt-1">
                    <ImpactDots roi={it.roi} />
                    <span className="chip !py-0.5 hidden md:inline-block">{it.category}</span>
                    <RiskBadge risk={it.risk} />
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-4 font-mono text-[0.7rem]">
                  <div>
                    <p className="text-[#4a5261] uppercase tracking-wider text-[0.58rem]">effort</p>
                    <p className="num text-[#8a93a1]">{it.effort}/10</p>
                  </div>
                  <div>
                    <p className="text-[#4a5261] uppercase tracking-wider text-[0.58rem]">gain est.</p>
                    <p className="num text-[#62e6c8]">+{it.revenue} €</p>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <StatusSelect id={it.id} status={it.status} />
                  <ChevronDown size={13} className={`text-[#4a5261] transition-transform ${open ? "rotate-180" : ""}`} />
                </div>
              </div>
              {open && (
                <div className="border-t hairline px-4 py-3 bg-[#05070a]/60">
                  <p className="text-[0.8rem] text-[#b9bfca] leading-relaxed max-w-3xl">{it.descr}</p>
                  <div className="flex gap-6 mt-3 font-mono text-[0.65rem] text-[#4a5261]">
                    <span>ROI <span className="text-[#c9f158] num">{it.roi}/100</span></span>
                    <span>UX <span className="text-[#c9f158] num">{it.ux}</span></span>
                    <span>AUTOM. <span className="text-[#62e6c8] num">{it.auto}</span></span>
                    <span>DETTE <span className="text-[#ff6b5b] num">{it.debtTech}</span></span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
