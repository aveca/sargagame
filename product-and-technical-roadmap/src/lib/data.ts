import { db } from "@/db";
import { missions, improvements, stripeFindings } from "@/db/schema";
import { asc, desc, sql } from "drizzle-orm";
import { MISSION_SEEDS } from "./seed/missions";
import { SEED_IMPROVEMENTS } from "./seed/backlog";
import { STRIPE_SEEDS } from "./seed/stripe";
import type {
  MissionRow,
  ImprovementRow,
  StripeFindingRow,
  Stats,
  MissionStatus,
  ItemStatus,
} from "./types";

// ─── Seed idempotent ─────────────────────────────────────────────────────────

let seedPromise: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = doSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function tableCount(table: typeof missions | typeof improvements | typeof stripeFindings): Promise<number> {
  const rows = await db.select({ c: sql<number>`count(*)::int` }).from(table);
  return rows[0]?.c ?? 0;
}

async function doSeed(): Promise<void> {
  if ((await tableCount(missions)) === 0) {
    await db.insert(missions).values(MISSION_SEEDS);
  }
  if ((await tableCount(improvements)) === 0) {
    await db.insert(improvements).values(
      SEED_IMPROVEMENTS.map((it) => ({
        title: it.t,
        descr: it.d,
        category: it.cat,
        mission: it.m,
        roi: it.roi,
        effort: it.eff,
        risk: it.risk,
        revenue: it.rev,
        debtTech: it.dt,
        ux: it.ux,
        seo: it.seo,
        perf: it.perf,
        ai: it.ia,
        auto: it.auto,
      }))
    );
  }
  if ((await tableCount(stripeFindings)) === 0) {
    await db.insert(stripeFindings).values(STRIPE_SEEDS);
  }
}

// ─── Lectures ────────────────────────────────────────────────────────────────

function toMission(r: typeof missions.$inferSelect): MissionRow {
  return {
    id: r.id,
    slug: r.slug,
    ordre: r.ordre,
    title: r.title,
    tagline: r.tagline,
    prompt: r.prompt,
    stars: r.stars,
    status: r.status as MissionStatus,
    progress: r.progress,
    report: r.report,
  };
}

function toImprovement(r: typeof improvements.$inferSelect): ImprovementRow {
  return {
    id: r.id,
    title: r.title,
    descr: r.descr,
    category: r.category,
    mission: r.mission,
    roi: r.roi,
    effort: r.effort,
    risk: r.risk as ImprovementRow["risk"],
    revenue: r.revenue,
    debtTech: r.debtTech,
    ux: r.ux,
    seo: r.seo,
    perf: r.perf,
    ai: r.ai,
    auto: r.auto,
    status: r.status as ItemStatus,
  };
}

function toStripe(r: typeof stripeFindings.$inferSelect): StripeFindingRow {
  return {
    id: r.id,
    path: r.path,
    line: r.line,
    snippet: r.snippet,
    kind: r.kind,
    used: r.used,
    deletable: r.deletable,
    risk: r.risk as StripeFindingRow["risk"],
    notes: r.notes,
    handled: r.handled,
  };
}

export async function getMissions(): Promise<MissionRow[]> {
  await ensureSeeded();
  const rows = await db.select().from(missions).orderBy(asc(missions.ordre));
  return rows.map(toMission);
}

export async function getImprovements(): Promise<ImprovementRow[]> {
  await ensureSeeded();
  const rows = await db.select().from(improvements).orderBy(desc(improvements.roi), asc(improvements.id));
  return rows.map(toImprovement);
}

export async function getStripeFindings(): Promise<StripeFindingRow[]> {
  await ensureSeeded();
  const rows = await db.select().from(stripeFindings).orderBy(asc(stripeFindings.id));
  return rows.map(toStripe);
}

export async function getStats(): Promise<Stats> {
  await ensureSeeded();
  const [itemRows, stripeRows, missionRows] = await Promise.all([
    db.select().from(improvements),
    db.select().from(stripeFindings),
    db.select().from(missions),
  ]);
  const total = itemRows.length;
  const done = itemRows.filter((i) => i.status === "done");
  const prog = itemRows.filter((i) => i.status === "progress");
  const rej = itemRows.filter((i) => i.status === "rejected");
  const potential = itemRows.filter((i) => i.status !== "done" && i.status !== "rejected").reduce((a, i) => a + i.revenue, 0);
  const captured = done.reduce((a, i) => a + i.revenue, 0);
  const avgRoi = total ? Math.round(itemRows.reduce((a, i) => a + i.roi, 0) / total) : 0;
  return {
    totalItems: total,
    doneItems: done.length,
    inProgressItems: prog.length,
    rejectedItems: rej.length,
    potentialMrr: potential,
    capturedMrr: captured,
    avgRoi,
    stripeTotal: stripeRows.length,
    stripeHandled: stripeRows.filter((s) => s.handled).length,
    stripeHighRisk: stripeRows.filter((s) => s.risk === "Élevé" && !s.handled).length,
    missionsDone: missionRows.filter((m) => m.status === "done").length,
    missionsTotal: missionRows.length,
  };
}
