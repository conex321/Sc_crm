import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { integrationEventsRaw } from "@/lib/db/schema";
import {
  extractMailshakeEvent,
  verifyMailshakeSignature,
} from "@/lib/integrations/mailshake";
import { inngest } from "@/inngest/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-mailshake-signature");

  if (process.env.MAILSHAKE_WEBHOOK_SECRET) {
    if (!verifyMailshakeSignature(rawBody, signature)) {
      return new NextResponse("invalid signature", { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("invalid JSON", { status: 400 });
  }

  const event = extractMailshakeEvent(payload);
  if (!event) return new NextResponse("unrecognized", { status: 200 });

  const inserted = await db
    .insert(integrationEventsRaw)
    .values({
      provider: "mailshake",
      eventId: event.id,
      eventType: event.type,
      payload: payload as object,
    })
    .onConflictDoNothing({ target: [integrationEventsRaw.provider, integrationEventsRaw.eventId] })
    .returning({ id: integrationEventsRaw.id });

  if (inserted.length > 0) {
    await inngest.send({
      name: "mailshake/event.received",
      data: { rawEventId: inserted[0].id },
    });
  }

  return NextResponse.json({ ok: true });
}
