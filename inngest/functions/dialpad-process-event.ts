import { inngest } from "../client";
import { db } from "@/lib/db";
import { integrationEventsRaw, calls } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { extractCallEvent } from "@/lib/integrations/dialpad";
import { matchIdentityToContact } from "@/lib/integrations/contact-matcher";
import { recordActivity } from "@/lib/integrations/record-activity";

function humanizeDuration(seconds?: number): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const dialpadProcessEvent = inngest.createFunction(
  {
    id: "dialpad-process-event",
    concurrency: 10,
    retries: 3,
    triggers: [{ event: "dialpad/event.received" }],
  },
  async ({ event, step, logger }) => {
    const rawEventId = event.data.rawEventId as string;

    const raw = await step.run("load-raw", async () => {
      const rows = await db
        .select()
        .from(integrationEventsRaw)
        .where(eq(integrationEventsRaw.id, rawEventId))
        .limit(1);
      return rows[0];
    });
    if (!raw) {
      logger.warn(`Raw event ${rawEventId} not found`);
      return { skipped: true };
    }

    const ev = extractCallEvent(raw.payload);
    if (!ev) {
      await db
        .update(integrationEventsRaw)
        .set({ error: "extractCallEvent returned null", processedAt: new Date() })
        .where(eq(integrationEventsRaw.id, rawEventId));
      return { skipped: true, reason: "unrecognized" };
    }

    // Company-wide by default. Set DIALPAD_SYNC_SCOPE=user to keep the legacy
    // single-user filter.
    const filterUserId = process.env.DIALPAD_FILTER_USER_ID;
    const syncScope = process.env.DIALPAD_SYNC_SCOPE ?? "company";
    const evUserId =
      (
        raw.payload as {
          user_id?: string | number;
          target_id?: string | number;
          target?: { id?: string | number };
        } | null
      )?.user_id ?? (raw.payload as { target?: { id?: string | number } } | null)?.target?.id;
    if (
      syncScope === "user" &&
      filterUserId &&
      evUserId != null &&
      String(evUserId) !== filterUserId
    ) {
      await db
        .update(integrationEventsRaw)
        .set({ processedAt: new Date(), error: `filtered: user_id=${evUserId}` })
        .where(eq(integrationEventsRaw.id, rawEventId));
      return { skipped: true, reason: "filtered-user" };
    }

    const externalPhone = ev.external_number ?? ev.contact?.phone;

    const match = await step.run("match-contact", () =>
      matchIdentityToContact({
        phone: externalPhone,
        email: ev.contact?.email,
        name: ev.contact?.name,
      }),
    );

    const summary = `${ev.direction === "inbound" ? "Inbound" : "Outbound"} call · ${humanizeDuration(ev.duration)}${ev.call_disposition ? ` · ${ev.call_disposition}` : ""}`;

    const activity = await step.run("write-activity", async () => {
      const a = await recordActivity({
        channel: "call",
        direction: ev.direction,
        summary,
        occurredAt: ev.start_time ? new Date(ev.start_time) : new Date(),
        accountId: match?.accountId ?? null,
        contactId: match?.contactId ?? null,
      });

      await db
        .insert(calls)
        .values({
          activityId: a.id,
          dialpadCallId: ev.call_id,
          fromNumber:
            ev.direction === "inbound"
              ? (ev.external_number ?? null)
              : (ev.internal_number ?? null),
          toNumber:
            ev.direction === "inbound"
              ? (ev.internal_number ?? null)
              : (ev.external_number ?? null),
          durationSeconds: ev.duration ?? null,
          recordingUrl: ev.recording_url ?? ev.voicemail_url ?? null,
          disposition: ev.call_disposition ?? null,
        })
        .onConflictDoNothing({ target: calls.dialpadCallId });

      return a;
    });

    await db
      .update(integrationEventsRaw)
      .set({ processedAt: new Date() })
      .where(eq(integrationEventsRaw.id, rawEventId));

    return {
      activityId: activity.id,
      matched: Boolean(match),
      accountId: match?.accountId ?? null,
    };
  },
);
