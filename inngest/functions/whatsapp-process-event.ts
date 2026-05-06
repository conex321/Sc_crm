import { inngest } from "../client";
import { db } from "@/lib/db";
import { integrationEventsRaw, messages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { recordActivity } from "@/lib/integrations/record-activity";
import { matchPhoneToContact } from "@/lib/integrations/contact-matcher";

export const whatsappProcessEvent = inngest.createFunction(
  {
    id: "whatsapp-process-event",
    concurrency: 10,
    retries: 3,
    triggers: [{ event: "whatsapp/event.received" }],
  },
  async ({ event, step }) => {
    const rawEventId = event.data.rawEventId as string;

    const raw = await step.run("load-raw", async () => {
      const rows = await db
        .select()
        .from(integrationEventsRaw)
        .where(eq(integrationEventsRaw.id, rawEventId))
        .limit(1);
      return rows[0];
    });
    if (!raw) return { skipped: true };

    const payload = raw.payload as { parsed: { messageSid: string; from: string; to: string; body: string; numMedia: number; mediaUrls: string[] } };
    const msg = payload.parsed;
    if (!msg) {
      await db
        .update(integrationEventsRaw)
        .set({ error: "no parsed payload", processedAt: new Date() })
        .where(eq(integrationEventsRaw.id, rawEventId));
      return { skipped: true };
    }

    const match = await step.run("match-phone", () => matchPhoneToContact(msg.from));

    const summary = `WhatsApp · ${msg.body.slice(0, 120)}${msg.body.length > 120 ? "…" : ""}`;

    await step.run("write-activity", async () => {
      const a = await recordActivity({
        channel: "whatsapp",
        direction: "inbound",
        summary,
        accountId: match?.accountId ?? null,
        contactId: match?.contactId ?? null,
      });
      await db
        .insert(messages)
        .values({
          activityId: a.id,
          provider: "twilio_whatsapp",
          providerMessageId: msg.messageSid,
          fromNumber: msg.from,
          toNumber: msg.to,
          body: msg.body,
          mediaUrls: msg.mediaUrls,
        })
        .onConflictDoNothing({ target: messages.providerMessageId });
    });

    await db
      .update(integrationEventsRaw)
      .set({ processedAt: new Date() })
      .where(eq(integrationEventsRaw.id, rawEventId));

    return { matched: Boolean(match) };
  },
);
