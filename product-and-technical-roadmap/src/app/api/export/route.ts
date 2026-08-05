import { NextResponse } from "next/server";
import { getMissions, getImprovements, getStripeFindings, getStats } from "@/lib/data";
import { FUNNEL, CURRENT_MRR, TARGET_MRR } from "@/lib/seed/paywall";
import { RAPPORTS } from "@/lib/seed/rapports";
import { MASTER, MOONSHOT_20, TRAJECTOIRE } from "@/lib/seed/master";

export const dynamic = "force-dynamic";

const CONTEXT = {
  produit: "SargaGame — application web cartographique de vigilance sargasse par plage",
  zone: "Martinique / Guadeloupe / Caraïbes (extension EN-ES-NL prévue)",
  trafic: "~9 000 sessions / mois, 78 % mobile",
  mrr: CURRENT_MRR,
  objectif_mrr: TARGET_MRR,
  abonnes: 11,
  arpu: "≈ 6,50 €",
  paiement: "Mollie (migration Stripe → Mollie récente, dette résiduelle)",
  conversion_globale: "0,12 % (11 acheteurs / 9 000 sessions)",
};

function mdTable(headers: string[], rows: string[][]): string {
  const clean = (s: string) => s.replace(/\|/g, "·").replace(/\n+/g, " ").trim();
  const head = `| ${headers.map(clean).join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map(clean).join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

function buildMarkdown(payload: Record<string, unknown>): string {
  const items = payload.backlog_100 as { title: string; category: string; roi: number; effort: number; risk: string; revenue: number; mission: string; status: string; descr: string | null }[];
  const stripe = payload.stripe_findings as { path: string; line: number; kind: string; used: boolean; deletable: string; risk: string; notes: string; snippet: string }[];
  const missions = payload.missions as { ordre: number; title: string; tagline: string; stars: number; status: string }[];
  const funnel = payload.funnel as typeof FUNNEL;
  const rapports = payload.rapports as typeof RAPPORTS;
  const moonshot = payload.moonshot_20 as typeof MOONSHOT_20;
  const master = payload.master as typeof MASTER;

  const parts: string[] = [];
  parts.push(`# SARGA·OPS — Rapport d'audit stratégique (export LLM)`);
  parts.push(`Généré le ${payload.generated_at}\n`);
  parts.push(`## Contexte produit\n`);
  parts.push(mdTable(["champ", "valeur"], Object.entries(CONTEXT).map(([k, v]) => [k, String(v)])));
  parts.push(`\n## État du funnel de vente (mesuré)\n`);
  parts.push(
    mdTable(
      ["étape", "sessions/mois", "% étape", "% total", "clics", "cause de chute"],
      funnel.map((s) => [s.name, String(s.sessions), `${s.rate} %`, `${s.ofTotal} %`, String(s.clicks), s.drop])
    )
  );
  parts.push(`\nDétail des frictions et éléments de confiance par étape :\n`);
  for (const s of funnel) {
    parts.push(`### ${s.name}\n- Frictions : ${s.frictions.join(" · ")}\n- Confiance : ${s.trust.join(" · ")}\n`);
  }
  parts.push(`## Les 8 missions d'audit\n`);
  parts.push(mdTable(["#", "mission", "priorité ★", "statut", "tagline"], missions.map((m) => [String(m.ordre), m.title, String(m.stars), m.status, m.tagline])));
  parts.push(`\n## Backlog des 100 améliorations (tri ROI décroissant)\n`);
  parts.push(
    mdTable(
      ["#", "amélioration", "catégorie", "mission", "ROI", "effort /10", "risque", "gain €/mois", "statut"],
      items.map((i, n) => [String(n + 1), i.title, i.category, i.mission, String(i.roi), String(i.effort), i.risk, String(i.revenue), i.status])
    )
  );
  parts.push(`\nDescriptions complètes :\n`);
  for (const i of items) {
    if (i.descr) parts.push(`- **${i.title}** — ${i.descr}`);
  }
  parts.push(`\n## Inventaire dette Stripe (${stripe.length} références)\n`);
  parts.push(
    mdTable(
      ["référence", "type", "utilisée ?", "supprimable ?", "risque", "note d'action"],
      stripe.map((s) => [`${s.path}:${s.line}`, s.kind, s.used ? "oui" : "non (morte)", s.deletable, s.risk, s.notes])
    )
  );
  parts.push(`\n## Rapports d'audit\n`);
  for (const r of rapports) {
    parts.push(`### ${r.title}\n${r.verdict}\n`);
    for (const f of r.findings) {
      parts.push(`- **[${f.severity}] ${f.title}** — ${f.detail} (${f.evidence}) → ${f.recommendation}`);
    }
    parts.push("");
  }
  parts.push(`## Master audit\n### Forces\n${master.forces.map((f) => `- ${f}`).join("\n")}`);
  parts.push(`\n### Faiblesses\n${master.faiblesses.map((f) => `- ${f}`).join("\n")}`);
  parts.push(`\n### Dettes (score de gravité /100)\n` + mdTable(["dette", "score", "éléments"], master.dettes.map((d) => [d.label, String(d.score), d.items.join(" · ")])));
  parts.push(`\n### Opportunités\n${master.opportunites.map((f) => `- ${f}`).join("\n")}`);
  parts.push(`\n### Menaces\n${master.menaces.map((f) => `- ${f}`).join("\n")}`);
  parts.push(`\n## Moonshot — les 20 tâches de 71 € à 10 000 €/mois\n`);
  parts.push(mdTable(["#", "tâche", "phase", "gain €/mois à maturité", "pourquoi"], moonshot.map((t) => [String(t.n), t.title, `P${t.phase}`, String(t.gain), t.why])));
  return parts.join("\n\n");
}

export async function GET(req: Request) {
  const [missions, improvements, stripeFindings, stats] = await Promise.all([
    getMissions(),
    getImprovements(),
    getStripeFindings(),
    getStats(),
  ]);

  const payload = {
    generated_at: new Date().toISOString(),
    source: "SARGA·OPS — War Room ROI",
    context: CONTEXT,
    stats,
    funnel: FUNNEL,
    missions: missions.map(({ id: _id, ...m }) => m),
    paywall_20: improvements.filter((i) => i.mission === "paywall"),
    backlog_100: improvements,
    stripe_findings: stripeFindings,
    rapports: RAPPORTS,
    master: MASTER,
    moonshot_20: MOONSHOT_20,
    trajectoire: TRAJECTOIRE,
  };

  const format = new URL(req.url).searchParams.get("format");
  if (format === "md" || format === "markdown") {
    return new Response(buildMarkdown(payload), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'inline; filename="sarga-audit-export.md"',
      },
    });
  }
  return NextResponse.json(payload);
}
