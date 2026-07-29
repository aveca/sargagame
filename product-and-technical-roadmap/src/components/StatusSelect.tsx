"use client";

import { useState, useTransition } from "react";
import type { ItemStatus } from "@/lib/types";

const OPTIONS: { value: ItemStatus; label: string }[] = [
  { value: "todo", label: "À faire" },
  { value: "progress", label: "En cours" },
  { value: "done", label: "Fait" },
  { value: "rejected", label: "Écarté" },
];

export function StatusSelect({ id, status }: { id: number; status: ItemStatus }) {
  const [current, setCurrent] = useState<ItemStatus>(status);
  const [pending, start] = useTransition();

  return (
    <select
      className="select-dark"
      value={current}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as ItemStatus;
        setCurrent(next); // optimiste
        start(async () => {
          const res = await fetch("/api/improvements", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, status: next }),
          });
          if (!res.ok) setCurrent(status);
        });
      }}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
