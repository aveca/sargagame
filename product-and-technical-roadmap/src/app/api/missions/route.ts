import { NextResponse } from "next/server";
import { db } from "@/db";
import { missions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getMissions } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await getMissions();
  return NextResponse.json(rows);
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as { id?: number; status?: string; progress?: number; report?: string };
  if (typeof body.id !== "number") {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (body.status && ["todo", "progress", "done"].includes(body.status)) patch.status = body.status;
  if (typeof body.progress === "number") patch.progress = Math.max(0, Math.min(100, Math.round(body.progress)));
  if (typeof body.report === "string") patch.report = body.report;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "rien à mettre à jour" }, { status: 400 });
  }
  await db.update(missions).set(patch).where(eq(missions.id, body.id));
  const rows = await getMissions();
  return NextResponse.json(rows.find((r) => r.id === body.id) ?? null);
}
