"use client";

import { useMemo, useState, useTransition } from "react";
import type { StripeFindingRow } from "@/lib/types";
import { RiskBadge } from "./ui";
import { Search, CheckSquare, Square, CircleSlash, CircleCheck, CircleDashed } from "lucide-react";

const KIND_LABEL: Record<string, string> = {
  import: "Import",
  api: "API",
  config: "Config",
  webhook: "Webhook",
  README: "README",
  docs: "Docs",
  comment: "Commentaire",
  json: "JSON",
  env: "Env",
  route: "Route",
  dead: "Code mort",
};

function UsedIcon({ used }: { used: boolean }) {
  return used ? (
    <span className="inline-flex items-center gap-1 text-[#ffb84d] text-[0.7rem] font-mono">
      <CircleDashed size={12} /> utilisée
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[#4a5261] text-[0.7rem] font-mono">
      <CircleSlash size={12} /> morte
    </span>
  );
}

function DeletableBadge({ v }: { v: string }) {
  const map: Record<string, string> = {
    oui: "text-[#c9f158] border-[#c9f158]/35 bg-[#c9f158]/8",
    non: "text-[#ff6b5b] border-[#ff6b5b]/30 bg-[#ff6b5b]/8",
    partiel: "text-[#ffb84d] border-[#ffb84d]/30 bg-[#ffb84d]/8",
  };
  return <span className={`chip border ${map[v] ?? map.oui}`}>{v}</span>;
}

export function StripeTable({ rows }: { rows: StripeFindingRow[] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [risk, setRisk] = useState("all");
  const [view, setView] = useState<"all" | "todo" | "done">("all");
  const [handled, setHandled] = useState<Record<number, boolean>>(
    Object.fromEntries(rows.map((r) => [r.id, r.handled]))
  );
  const [, start] = useTransition();

  const kinds = useMemo(() => Array.from(new Set(rows.map((r) => r.kind))), [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (q.trim()) {
      const n = q.toLowerCase();
      list = list.filter((r) => r.path.toLowerCase().includes(n) || r.snippet.toLowerCase().includes(n) || r.notes.toLowerCase().includes(n));
    }
    if (kind !== "all") list = list.filter((r) => r.kind === kind);
    if (risk !== "all") list = list.filter((r) => r.risk === risk);
    if (view !== "all") list = list.filter((r) => (view === "done" ? handled[r.id] : !handled[r.id]));
    return list;
  }, [rows, q, kind, risk, view, handled]);

  const doneCount = rows.filter((r) => handled[r.id]).length;

  const toggle = (id: number) => {
    const next = !handled[id];
    setHandled((h) => ({ ...h, [id]: next }));
    start(async () => {
      await fetch("/api/stripe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, handled: next }),
      });
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#4a5261]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chemin, snippet, note…" className="select-dark !pl-7 w-60" />
        </div>
        <select className="select-dark" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">Tous types</option>
          {kinds.map((k) => (
            <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>
          ))}
        </select>
        <select className="select-dark" value={risk} onChange={(e) => setRisk(e.target.value)}>
          <option value="all">Tous risques</option>
          <option value="Faible">Faible</option>
          <option value="Moyen">Moyen</option>
          <option value="Élevé">Élevé</option>
        </select>
        <select className="select-dark" value={view} onChange={(e) => setView(e.target.value as typeof view)}>
          <option value="all">Tout</option>
          <option value="todo">À traiter</option>
          <option value="done">Traité</option>
        </select>
        <span className="chip ml-auto">
          <CircleCheck size={11} className="inline mr-1 text-[#c9f158]" />
          {doneCount}/{rows.length} traitées
        </span>
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[980px]">
            <thead>
              <tr className="border-b hairline">
                {["✓", "Référence", "Type", "Utilisée ?", "Supprimable ?", "Risque", "Note d'action"].map((h) => (
                  <th key={h} className="px-4 py-3 text-[0.62rem] font-mono uppercase tracking-widest text-[#4a5261]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => {
                const done = handled[r.id];
                return (
                  <tr key={r.id} className={`row-hover border-b hairline ${idx % 2 ? "bg-white/[0.012]" : ""} ${done ? "opacity-45" : ""}`}>
                    <td className="px-4 py-2.5">
                      <button onClick={() => toggle(r.id)} className="text-[#8a93a1] hover:text-[#c9f158] transition-colors" aria-label="Marquer traité">
                        {done ? <CheckSquare size={15} className="text-[#c9f158]" /> : <Square size={15} className="text-[#4a5261]" />}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 max-w-[340px]">
                      <p className="font-mono text-[0.74rem] text-[#ecefe9] leading-snug break-all">{r.path}<span className="text-[#4a5261]">:{r.line}</span></p>
                      <p className="font-mono text-[0.66rem] text-[#8a93a1] mt-1 truncate">{r.snippet}</p>
                    </td>
                    <td className="px-4 py-2.5"><span className="chip">{KIND_LABEL[r.kind] ?? r.kind}</span></td>
                    <td className="px-4 py-2.5"><UsedIcon used={r.used} /></td>
                    <td className="px-4 py-2.5"><DeletableBadge v={r.deletable} /></td>
                    <td className="px-4 py-2.5"><RiskBadge risk={r.risk} /></td>
                    <td className="px-4 py-2.5 max-w-[320px]">
                      <p className="text-[0.74rem] text-[#b9bfca] leading-snug">{r.notes}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="text-center py-10 text-[0.8rem] text-[#4a5261] font-mono">Aucune référence ne correspond aux filtres.</p>
        )}
      </div>
    </div>
  );
}
