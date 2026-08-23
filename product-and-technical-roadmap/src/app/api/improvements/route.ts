import { NextResponse } from "next/server";
import { db } from "@/db";
import { improvements } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getImprovements } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await getImprovements();
  return NextResponse.json(rows);
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as { id?: number; status?: string };
  if (typeof body.id !== "number") {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }
  if (!body.status || !["todo", "progress", "done", "rejected"].includes(body.status)) {
    return NextResponse.json({ error: "statut invalide" }, { status: 400 });
  }
  await db.update(improvements).set({ status: body.status }).where(eq(improvements.id, body.id));
  const rows = await getImprovements();
  return NextResponse.json(rows.find((r) => r.id === body.id) ?? null);
}
