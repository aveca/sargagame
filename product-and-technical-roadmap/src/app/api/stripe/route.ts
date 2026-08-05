import { NextResponse } from "next/server";
import { db } from "@/db";
import { stripeFindings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getStripeFindings } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await getStripeFindings();
  return NextResponse.json(rows);
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as { id?: number; handled?: boolean };
  if (typeof body.id !== "number" || typeof body.handled !== "boolean") {
    return NextResponse.json({ error: "id et handled requis" }, { status: 400 });
  }
  await db.update(stripeFindings).set({ handled: body.handled }).where(eq(stripeFindings.id, body.id));
  const rows = await getStripeFindings();
  return NextResponse.json(rows.find((r) => r.id === body.id) ?? null);
}
