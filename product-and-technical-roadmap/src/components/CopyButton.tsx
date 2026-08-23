"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyButton({ text, label = "Copier le prompt" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1800);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border hairline px-3 py-1.5 text-[0.72rem] font-mono text-[#8a93a1] hover:text-[#c9f158] hover:border-[#c9f158]/40 transition-colors"
    >
      {ok ? <Check size={12} className="text-[#c9f158]" /> : <Copy size={12} />}
      {ok ? "Copié !" : label}
    </button>
  );
}
