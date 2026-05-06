import { inngest } from "../client";
import { db } from "@/lib/db";
import { integrationEventsRaw, emailEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { extractMailshakeEvent } from "@/lib/integrations/mailshake";
import { recordActivity } from "@/lib/integrations/record-activity";
import { matchEmailToContact } from "@/lib/integrations/contact-matcher";

export const mailshakeProcessEvent = inngest.createFunction(
  {
    id: "mailshake-process-event",
    concurrency: 10,
    retries: 3,
    triggers: [{ event: "mailshake/event.received" }],
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

    const ev = extractMailshakeEvent(raw.payload);
    if (!ev) {
      await db
        .update(integrationEventsRaw)
        .set({ error: "extractMailshakeEvent returned null", processedAt: new Date() })
        .where(eq(integrationEventsRaw.id, rawEventId));
      return { skipped: true };
    }

    const match = await step.run("match-email", () =>
      matchEmailToContact(ev.recipient.emailAddress),
    );

    const direction =
      ev.type === "reply" ? "inbound" : ev.type === "send" ? "outbound" : "system";
    const summary = `Mailshake ${ev.type}${ev.subject ? ` · ${ev.subject}` : ""}`;

    await step.run("write-activity", async () => {
      const a = await recordActivity({
        channel: "mailshake_event",
        direction,
        summary,
        occurredAt: ev.timestamp ? new Date(ev.timestamp) : new Date(),
        accountId: match?.accountId ?? null,
        contactId: match?.contactId ?? null,
      });
      await db
        .insert(emailEvents)
        .values({
          activityId: a.id,
          provider: "mailshake",
          providerEventId: ev.id,
          campaignId: ev.campaign?.id ? String(ev.campaign.id) : null,
          subject: ev.subject ?? null,
          snippet: ev.snippet ?? null,
          eventType: ev.type,
        })
        .onConflictDoNothing({ target: emailEvents.providerEventId });
    });

    await db
      .update(integrationEventsRaw)
      .set({ processedAt: new Date() })
      .where(eq(integrationEventsRaw.id, rawEventId));

    return { matched: Boolean(match) };
  },
);
