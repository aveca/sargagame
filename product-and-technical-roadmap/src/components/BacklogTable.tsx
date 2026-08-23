"use client";

import { Fragment, useMemo, useState } from "react";
import type { ImprovementRow } from "@/lib/types";
import { RiskBadge } from "./ui";
import { StatusSelect } from "./StatusSelect";
import { Search, ChevronDown } from "lucide-react";

type SortKey = "roi" | "effort" | "revenue" | "debtTech" | "ux" | "seo" | "perf" | "ai" | "auto";

const COLS: { key: SortKey; label: string }[] = [
  { key: "roi", label: "ROI" },
  { key: "effort", label: "Effort" },
  { key: "revenue", label: "€/mois" },
  { key: "debtTech", label: "Dette tech" },
  { key: "ux", label: "UX" },
  { key: "seo", label: "SEO" },
  { key: "perf", label: "Perf" },
  { key: "ai", label: "IA" },
  { key: "auto", label: "Autom." },
];

const MISSIONS_LABELS: Record<string, string> = {
  "paywall": "Paywall",
  "backlog-roi": "Backlog ROI",
  "dette-stripe": "Dette Stripe",
  "architecture": "Architecture",
  "quick-wins": "Quick wins",
  "audit-ia": "Audit IA",
  "hypercroissance": "Hypercroissance",
  "master-audit": "Master Audit",
};

function MiniScore({ v, tone }: { v: number; tone: "lime" | "teal" | "coral" }) {
  const c = { lime: "#c9f158", teal: "#62e6c8", coral: "#ff6b5b" }[tone];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1 w-8 rounded-full bg-white/[0.07] overflow-hidden inline-block">
        <span className="block h-full rounded-full" style={{ width: `${v}%`, background: c }} />
      </span>
      <span className="num text-[0.68rem] text-[#8a93a1]">{v}</span>
    </span>
  );
}

export function BacklogTable({ items }: { items: ImprovementRow[] }) {
  const [q, setQ] = useState("");
  const [mission, setMission] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("roi");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [openId, setOpenId] = useState<number | null>(null);

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category))).sort(), [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter(
        (i) => i.title.toLowerCase().includes(needle) || (i.descr ?? "").toLowerCase().includes(needle)
      );
    }
    if (mission !== "all") list = list.filter((i) => i.mission === mission);
    if (category !== "all") list = list.filter((i) => i.category === category);
    if (status !== "all") list = list.filter((i) => i.status === status);
    list = [...list].sort((a, b) => (b[sortKey] - a[sortKey]) * (sortDir === -1 ? 1 : -1));
    return list;
  }, [items, q, mission, category, status, sortKey, sortDir]);

  const totalRevenue = filtered.reduce((a, i) => a + i.revenue, 0);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === -1 ? 1 : -1));
    else {
      setSortKey(k);
      setSortDir(-1);
    }
  };

  return (
    <div>
      {/* filtres */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#4a5261]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher…"
            className="select-dark !pl-7 w-52"
          />
        </div>
        <select className="select-dark" value={mission} onChange={(e) => setMission(e.target.value)}>
          <option value="all">Toutes missions</option>
          {Object.entries(MISSIONS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select className="select-dark" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">Toutes catégories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select className="select-dark" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Tous statuts</option>
          <option value="todo">À faire</option>
          <option value="progress">En cours</option>
          <option value="done">Fait</option>
          <option value="rejected">Écarté</option>
        </select>
        <span className="chip ml-auto">
          {filtered.length} items · <span className="text-[#c9f158]">≈ {totalRevenue.toLocaleString("fr-FR")} €/mois</span> de potentiel
        </span>
      </div>

      {/* table */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b hairline">
                <th className="px-4 py-3 text-[0.62rem] font-mono uppercase tracking-widest text-[#4a5261] w-8">#</th>
                <th className="px-4 py-3 text-[0.62rem] font-mono uppercase tracking-widest text-[#4a5261]">Amélioration</th>
                <th className="px-3 py-3 text-[0.62rem] font-mono uppercase tracking-widest text-[#4a5261] hidden lg:table-cell">Catégorie</th>
                {COLS.map((c) => (
                  <th key={c.key} className="px-3 py-3">
                    <button
                      onClick={() => toggleSort(c.key)}
                      className={`text-[0.62rem] font-mono uppercase tracking-widest flex items-center gap-1 transition-colors ${
                        sortKey === c.key ? "text-[#c9f158]" : "text-[#4a5261] hover:text-[#8a93a1]"
                      }`}
                    >
                      {c.label}
                      {sortKey === c.key && <ChevronDown size={10} className={sortDir === 1 ? "rotate-180" : ""} />}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-3 text-[0.62rem] font-mono uppercase tracking-widest text-[#4a5261]">Risque</th>
                <th className="px-4 py-3 text-[0.62rem] font-mono uppercase tracking-widest text-[#4a5261]">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it, idx) => {
                const open = openId === it.id;
                return (
                  <Fragment key={it.id}>
                    <tr
                      onClick={() => setOpenId(open ? null : it.id)}
                      className={`row-hover cursor-pointer border-b hairline ${idx % 2 ? "bg-white/[0.012]" : ""}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-[0.65rem] text-[#4a5261] num">{String(idx + 1).padStart(3, "0")}</td>
                      <td className="px-4 py-2.5 max-w-[380px]">
                        <p className="text-[0.82rem] font-medium leading-snug">{it.title}</p>
                        <p className="text-[0.62rem] font-mono text-[#4a5261] mt-0.5">{MISSIONS_LABELS[it.mission] ?? it.mission}</p>
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        <span className="chip">{it.category}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`num font-semibold text-[0.82rem] ${it.roi >= 80 ? "text-[#c9f158]" : it.roi >= 55 ? "text-[#ecefe9]" : "text-[#8a93a1]"}`}>
                          {it.roi}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 num text-[0.78rem] text-[#8a93a1]">{it.effort}</td>
                      <td className="px-3 py-2.5">
                        <span className={`num text-[0.78rem] ${it.revenue > 0 ? "text-[#62e6c8]" : "text-[#4a5261]"}`}>
                          {it.revenue > 0 ? `+${it.revenue} €` : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5"><MiniScore v={it.debtTech} tone="coral" /></td>
                      <td className="px-3 py-2.5"><MiniScore v={it.ux} tone="lime" /></td>
                      <td className="px-3 py-2.5"><MiniScore v={it.seo} tone="teal" /></td>
                      <td className="px-3 py-2.5"><MiniScore v={it.perf} tone="teal" /></td>
                      <td className="px-3 py-2.5"><MiniScore v={it.ai} tone="lime" /></td>
                      <td className="px-3 py-2.5"><MiniScore v={it.auto} tone="teal" /></td>
                      <td className="px-3 py-2.5"><RiskBadge risk={it.risk} /></td>
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <StatusSelect id={it.id} status={it.status} />
                      </td>
                    </tr>
                    {open && it.descr && (
                      <tr className="border-b hairline bg-[#0b0f14]">
                        <td />
                        <td colSpan={13} className="px-4 py-3">
                          <p className="text-[0.78rem] text-[#b9bfca] leading-relaxed max-w-3xl">{it.descr}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="text-center py-10 text-[0.8rem] text-[#4a5261] font-mono">Aucun item ne correspond aux filtres.</p>
        )}
      </div>
    </div>
  );
}
