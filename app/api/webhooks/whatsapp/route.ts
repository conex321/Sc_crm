import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { integrationEventsRaw } from "@/lib/db/schema";
import {
  parseTwilioWhatsAppForm,
  verifyTwilioSignature,
} from "@/lib/integrations/twilio";
import { inngest } from "@/inngest/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));
  const signature = request.headers.get("x-twilio-signature");

  // In dev (TWILIO_AUTH_TOKEN unset) skip verification.
  if (process.env.TWILIO_AUTH_TOKEN) {
    const url = request.headers.get("x-forwarded-proto")
      ? `${request.headers.get("x-forwarded-proto")}://${request.headers.get(
          "host",
        )}${new URL(request.url).pathname}`
      : request.url;
    if (!verifyTwilioSignature(url, params, signature)) {
      return new NextResponse("invalid signature", { status: 401 });
    }
  }

  const msg = parseTwilioWhatsAppForm(params);
  if (!msg) {
    return new NextResponse("unrecognized event", { status: 200 });
  }

  const inserted = await db
    .insert(integrationEventsRaw)
    .values({
      provider: "whatsapp",
      eventId: msg.messageSid,
      eventType: "message_received",
      payload: { ...params, parsed: msg } as object,
    })
    .onConflictDoNothing({ target: [integrationEventsRaw.provider, integrationEventsRaw.eventId] })
    .returning({ id: integrationEventsRaw.id });

  if (inserted.length > 0) {
    await inngest.send({
      name: "whatsapp/event.received",
      data: { rawEventId: inserted[0].id, messageSid: msg.messageSid },
    });
  }

  // Twilio expects an empty TwiML / 204 response to ack the webhook
  return new NextResponse("", { status: 204 });
}
