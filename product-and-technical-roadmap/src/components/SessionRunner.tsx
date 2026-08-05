"use client";

import { useMemo, useState, useTransition } from "react";
import type { MissionRow, MissionStatus } from "@/lib/types";
import { CopyButton } from "./CopyButton";
import {
  Check,
  ChevronDown,
  Clock,
  FileText,
  Play,
  Save,
  Star,
  Terminal,
} from "lucide-react";

const META: Record<string, { est: string; deliverable: string }> = {
  "paywall": { est: "20 min", deliverable: "PAYWALL_AUDIT.md — friction map + 20 améliorations classées" },
  "backlog-roi": { est: "15 min", deliverable: "BACKLOG_ROI.md — 100 items, 10 colonnes, tri ROI décroissant" },
  "dette-stripe": { est: "10 min", deliverable: "STRIPE_DEBT.md — références, utilisée ?, supprimable ?, risque" },
  "architecture": { est: "15 min", deliverable: "ARCH_AUDIT.md — couplage, cycles, fichiers > 800 lignes" },
  "quick-wins": { est: "10 min", deliverable: "QUICK_WINS.md — idées classées par gain estimé" },
  "audit-ia": { est: "10 min", deliverable: "AI_AUDIT.md — classé Impact / Coût / Temps / Moat" },
  "hypercroissance": { est: "10 min", deliverable: "GROWTH_AUDIT.md — blocages acquisition → international" },
  "master-audit": { est: "25 min", deliverable: "MASTER_AUDIT.md — synthèse finale + plan 71 € → 10 000 €" },
};

function Step({
  m,
  index,
  isCurrent,
  isDone,
  isLast,
  onPatch,
}: {
  m: MissionRow;
  index: number;
  isCurrent: boolean;
  isDone: boolean;
  isLast: boolean;
  onPatch: (id: number, body: Record<string, unknown>) => Promise<void>;
}) {
  const [openPrompt, setOpenPrompt] = useState(isCurrent);
  const [report, setReport] = useState(m.report ?? "");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const meta = META[m.slug];

  const status: MissionStatus = m.status;

  return (
    <div className="relative grid grid-cols-[40px_1fr] gap-4">
      {/* rail */}
      <div className="flex flex-col items-center">
        <span
          className={`z-10 grid h-9 w-9 place-items-center rounded-full border font-mono text-xs transition-colors ${
            isDone
              ? "border-[#c9f158] bg-[#c9f158] text-[#05070a]"
              : isCurrent
                ? "border-[#c9f158] bg-[#c9f158]/10 text-[#c9f158]"
                : "border-[#2a344a] bg-[#0b0f14] text-[#4a5261]"
          }`}
        >
          {isDone ? <Check size={14} strokeWidth={3} /> : String(index + 1).padStart(2, "0")}
        </span>
        {!isLast && <span className={`w-px grow ${isDone ? "bg-[#c9f158]/50" : "bg-[#1b2230]"}`} />}
      </div>

      {/* carte */}
      <div
        className={`panel mb-5 ${isCurrent ? "ring-1 ring-[#c9f158]/40" : ""} ${isDone ? "opacity-70" : ""}`}
      >
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className={`font-semibold text-[1rem] leading-tight ${isDone ? "line-through decoration-[#c9f158]/50" : ""}`}>
                  {m.title}
                </h3>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={9} className={i < m.stars ? "fill-[#c9f158] text-[#c9f158]" : "text-[#2a344a]"} />
                  ))}
                </div>
                {isCurrent && (
                  <span className="chip border border-[#c9f158]/40 bg-[#c9f158]/10 text-[#c9f158]">
                    <Play size={9} className="inline mr-1" /> en cours
                  </span>
                )}
              </div>
              <p className="text-[0.76rem] text-[#8a93a1] mt-1.5 leading-snug">{m.tagline}</p>
              {meta && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 font-mono text-[0.65rem]">
                  <span className="inline-flex items-center gap-1 text-[#4a5261]">
                    <Clock size={10} /> {meta.est}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[#62e6c8]">
                    <FileText size={10} /> {meta.deliverable}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <CopyButton text={m.prompt} />
              {!isDone ? (
                <button
                  onClick={() => onPatch(m.id, { status: "done", progress: 100 })}
                  className="rounded-lg bg-[#c9f158] px-3 py-1.5 text-[0.72rem] font-semibold text-[#05070a] hover:bg-[#d8ff70] transition-colors"
                >
                  Terminée
                </button>
              ) : (
                <button
                  onClick={() => onPatch(m.id, { status: "todo" })}
                  className="rounded-lg border hairline px-3 py-1.5 text-[0.72rem] font-mono text-[#8a93a1] hover:text-[#ecefe9] transition-colors"
                >
                  Réouvrir
                </button>
              )}
            </div>
          </div>

          {/* prompt */}
          <div className="border-t hairline mt-4 pt-3">
            <button
              onClick={() => setOpenPrompt(!openPrompt)}
              className="flex items-center gap-1.5 text-[0.7rem] font-mono text-[#8a93a1] hover:text-[#c9f158] transition-colors"
            >
              <Terminal size={12} />
              {openPrompt ? "Masquer le prompt" : "Voir le prompt"}
              <ChevronDown size={11} className={`transition-transform ${openPrompt ? "rotate-180" : ""}`} />
            </button>
            {openPrompt && (
              <pre className="mt-2.5 whitespace-pre-wrap rounded-lg bg-[#05070a] border hairline p-4 text-[0.74rem] leading-relaxed text-[#b9bfca] font-mono">
                {m.prompt}
              </pre>
            )}
          </div>

          {/* rapport Mimo */}
          <div className="border-t hairline mt-4 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[0.7rem] font-mono text-[#8a93a1] flex items-center gap-1.5">
                <FileText size={12} />
                Rapport Mimo
                {m.report && !dirty && <span className="text-[#c9f158]">· enregistré</span>}
              </p>
              {dirty && (
                <button
                  onClick={async () => {
                    await onPatch(m.id, { report });
                    setDirty(false);
                    setSaved(true);
                    setTimeout(() => setSaved(false), 1800);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#c9f158] px-3 py-1.5 text-[0.72rem] font-semibold text-[#05070a] hover:bg-[#d8ff70] transition-colors"
                >
                  <Save size={12} /> Enregistrer
                </button>
              )}
              {saved && <span className="text-[0.72rem] font-mono text-[#c9f158]">✓ collé</span>}
            </div>
            <textarea
              value={report}
              rows={4}
              onChange={(e) => {
                setReport(e.target.value);
                setDirty(true);
              }}
              placeholder={isCurrent ? "Collez ici le rapport produit par Mimo, puis enregistrez…" : ""}
              className="w-full rounded-lg bg-[#05070a] border hairline p-3 text-[0.76rem] font-mono leading-relaxed text-[#b9bfca] placeholder:text-[#2a344a] outline-none focus:border-[#c9f158]/40 transition-colors resize-y min-h-[90px]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SessionRunner({ missions }: { missions: MissionRow[] }) {
  const [list, setList] = useState(missions);
  const [, start] = useTransition();

  const patch = (id: number, body: Record<string, unknown>): Promise<void> => {
    setList((prev) => prev.map((m) => (m.id === id ? { ...m, ...body } : m)));
    return new Promise<void>((resolve) => {
      start(async () => {
        await fetch("/api/missions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...body }),
        });
        resolve();
      });
    });
  };

  const doneCount = list.filter((m) => m.status === "done").length;
  const currentIndex = useMemo(() => {
    const idx = list.findIndex((m) => m.status !== "done");
    return idx === -1 ? list.length - 1 : idx;
  }, [list]);
  const allDone = doneCount === list.length;

  return (
    <div>
      {/* barre de progression */}
      <div className="panel p-4 mb-7 flex items-center gap-4">
        <div className="h-1.5 grow rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#c9f158] transition-all duration-700"
            style={{ width: `${(doneCount / list.length) * 100}%` }}
          />
        </div>
        <span className="font-mono text-[0.72rem] text-[#8a93a1] shrink-0 num">
          {doneCount}/{list.length}
        </span>
      </div>

      {allDone && (
        <div className="panel p-5 mb-6 border-[#c9f158]/40 text-center">
          <p className="font-semibold text-[#c9f158]">Session complète.</p>
          <p className="text-[0.8rem] text-[#8a93a1] mt-1">
            Les 8 rapports sont collés. Prochaine étape : lancer les 20 tâches du Master Audit depuis le backlog.
          </p>
        </div>
      )}

      <div>
        {list.map((m, i) => (
          <Step
            key={m.id}
            m={m}
            index={i}
            isCurrent={i === currentIndex && m.status !== "done"}
            isDone={m.status === "done"}
            isLast={i === list.length - 1}
            onPatch={patch}
          />
        ))}
      </div>
    </div>
  );
}
