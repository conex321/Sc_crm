import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { integrationEventsRaw } from "@/lib/db/schema";
import { verifyStripeWebhook } from "@/lib/integrations/stripe";
import { inngest } from "@/inngest/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event;
  try {
    event = verifyStripeWebhook(rawBody, signature);
  } catch (err) {
    return new NextResponse(
      `Webhook signature verification failed: ${err instanceof Error ? err.message : "unknown"}`,
      { status: 400 },
    );
  }

  const inserted = await db
    .insert(integrationEventsRaw)
    .values({
      provider: "stripe",
      eventId: event.id,
      eventType: event.type,
      payload: event as unknown as object,
    })
    .onConflictDoNothing({ target: [integrationEventsRaw.provider, integrationEventsRaw.eventId] })
    .returning({ id: integrationEventsRaw.id });

  if (inserted.length > 0) {
    await inngest.send({
      name: "stripe/event.received",
      data: { rawEventId: inserted[0].id, stripeEventId: event.id, type: event.type },
    });
  }

  return NextResponse.json({ received: true });
}
