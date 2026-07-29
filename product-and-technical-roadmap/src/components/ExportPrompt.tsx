"use client";

import { useState } from "react";
import { Bot, Check, Copy, FileJson, FileText, Globe } from "lucide-react";

export function ExportPrompt({ prompt, jsonUrl, mdUrl }: { prompt: string; jsonUrl: string; mdUrl: string }) {
  const [ok, setOk] = useState(false);

  return (
    <div className="panel p-6 border-[#c9f158]/40 ring-1 ring-[#c9f158]/20 bg-gradient-to-b from-[#c9f158]/[0.06] to-transparent">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <Bot size={18} className="text-[#c9f158]" />
          <h2 className="font-semibold">Prompt pour votre IA locale</h2>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={jsonUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border hairline px-3 py-1.5 text-[0.72rem] font-mono text-[#8a93a1] hover:text-[#c9f158] hover:border-[#c9f158]/40 transition-colors"
          >
            <FileJson size={12} /> JSON brut
          </a>
          <a
            href={mdUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border hairline px-3 py-1.5 text-[0.72rem] font-mono text-[#8a93a1] hover:text-[#c9f158] hover:border-[#c9f158]/40 transition-colors"
          >
            <FileText size={12} /> Markdown brut
          </a>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(prompt);
              setOk(true);
              setTimeout(() => setOk(false), 1800);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#c9f158] px-4 py-1.5 text-[0.75rem] font-semibold text-[#05070a] hover:bg-[#d8ff70] transition-colors"
          >
            {ok ? <Check size={13} /> : <Copy size={13} />}
            {ok ? "Copié !" : "Copier le prompt"}
          </button>
        </div>
      </div>
      <pre className="whitespace-pre-wrap rounded-xl bg-[#05070a] border hairline p-5 text-[0.78rem] leading-relaxed text-[#d4d9e0] font-mono max-h-[420px] overflow-y-auto">
        {prompt}
      </pre>
      <p className="flex items-center gap-1.5 mt-3 text-[0.68rem] font-mono text-[#4a5261]">
        <Globe size={11} className="text-[#62e6c8]" />
        Le prompt contient les URLs publiques du rapport — votre IA locale les lira directement (JSON ou Markdown).
      </p>
    </div>
  );
}
