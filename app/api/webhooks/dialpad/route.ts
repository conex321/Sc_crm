import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { integrationEventsRaw } from "@/lib/db/schema";
import { verifyDialpadSignature, extractCallEvent } from "@/lib/integrations/dialpad";
import { inngest } from "@/inngest/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-dialpad-signature");

  // In dev (no DIALPAD_WEBHOOK_SECRET set), skip verification but log warning.
  if (process.env.DIALPAD_WEBHOOK_SECRET) {
    if (!verifyDialpadSignature(rawBody, signature)) {
      return new NextResponse("invalid signature", { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("invalid JSON", { status: 400 });
  }

  const event = extractCallEvent(payload);
  if (!event) {
    return new NextResponse("unrecognized event", { status: 200 });
  }

  // 1. Idempotent insert into raw event log
  const inserted = await db
    .insert(integrationEventsRaw)
    .values({
      provider: "dialpad",
      eventId: event.call_id,
      eventType: event.event_type,
      payload: payload as object,
    })
    .onConflictDoNothing({ target: [integrationEventsRaw.provider, integrationEventsRaw.eventId] })
    .returning({ id: integrationEventsRaw.id });

  // 2. Enqueue async processing
  if (inserted.length > 0) {
    await inngest.send({
      name: "dialpad/event.received",
      data: { rawEventId: inserted[0].id, eventId: event.call_id },
    });
  }

  return NextResponse.json({ ok: true });
}
