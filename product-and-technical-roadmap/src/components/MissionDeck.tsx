"use client";

import { useState, useTransition } from "react";
import type { MissionRow, MissionStatus } from "@/lib/types";
import { CopyButton } from "./CopyButton";
import { ChevronDown, Star, Terminal } from "lucide-react";

const STATUS_OPTS: { value: MissionStatus; label: string }[] = [
  { value: "todo", label: "En attente" },
  { value: "progress", label: "En cours" },
  { value: "done", label: "Terminée" },
];

function MissionCard({ m }: { m: MissionRow }) {
  const [status, setStatus] = useState<MissionStatus>(m.status);
  const [progress, setProgress] = useState(m.progress);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const patch = (body: Record<string, unknown>) =>
    start(async () => {
      await fetch("/api/missions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, ...body }),
      });
    });

  const border =
    status === "done"
      ? "hover:border-[#c9f158]/35"
      : status === "progress"
        ? "border-[#ffb84d]/30"
        : "";

  return (
    <article className={`panel panel-hover flex flex-col ${border} ${m.slug === "paywall" ? "ring-1 ring-[#c9f158]/30" : ""}`}>
      <div className="p-5 flex flex-col gap-3 grow">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/[0.04] border hairline font-mono text-xs text-[#8a93a1]">
              {String(m.ordre).padStart(2, "0")}
            </span>
            <div>
              <h3 className="font-semibold text-[0.95rem] leading-tight">{m.title}</h3>
              <div className="flex gap-0.5 mt-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={9}
                    className={i < m.stars ? "fill-[#c9f158] text-[#c9f158]" : "text-[#2a344a]"}
                  />
                ))}
              </div>
            </div>
          </div>
          <select
            className="select-dark shrink-0"
            value={status}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value as MissionStatus;
              setStatus(v);
              patch({ status: v, progress: v === "done" ? 100 : progress });
              if (v === "done") setProgress(100);
            }}
          >
            {STATUS_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[0.78rem] text-[#8a93a1] leading-snug grow">{m.tagline}</p>
        {/* progression */}
        <div>
          <div className="flex justify-between text-[0.62rem] font-mono text-[#4a5261] mb-1.5">
            <span>AVANCEMENT</span>
            <span className="num">{progress} %</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            disabled={pending}
            onChange={(e) => setProgress(Number(e.target.value))}
            onMouseUp={() => patch({ progress })}
            onTouchEnd={() => patch({ progress })}
            className="w-full h-1 accent-[#c9f158] cursor-pointer"
          />
        </div>
        {/* prompt */}
        <div className="border-t hairline pt-3 flex items-center justify-between gap-2">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1.5 text-[0.7rem] font-mono text-[#8a93a1] hover:text-[#c9f158] transition-colors"
          >
            <Terminal size={12} />
            Prompt Mimo
            <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          <CopyButton text={m.prompt} />
        </div>
        {open && (
          <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-[#05070a] border hairline p-3 text-[0.7rem] leading-relaxed text-[#b9bfca] font-mono max-h-64 overflow-y-auto">
            {m.prompt}
          </pre>
        )}
      </div>
    </article>
  );
}

export function MissionDeck({ missions }: { missions: MissionRow[] }) {
  const done = missions.filter((m) => m.status === "done").length;
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="chip">{done}/{missions.length} terminées</span>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {missions.map((m) => (
          <MissionCard key={m.id} m={m} />
        ))}
      </div>
    </div>
  );
}
