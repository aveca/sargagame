"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-1.5 rounded-lg border hairline px-3 py-1.5 text-[0.72rem] font-mono text-[#8a93a1] hover:text-[#c9f158] hover:border-[#c9f158]/40 transition-colors"
    >
      <Printer size={12} /> Exporter / imprimer
    </button>
  );
}
