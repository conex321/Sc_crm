import "server-only";
import { db } from "@/lib/db";
import { integrationEventsRaw, emailEvents } from "@/lib/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { extractMailshakeEvent } from "@/lib/integrations/mailshake";
import { recordActivity } from "@/lib/integrations/record-activity";
import { matchEmailToContact } from "@/lib/integrations/contact-matcher";
import { slackNotifyCard } from "@/lib/integrations/slack-notify";

/**
 * Process one raw Mailshake webhook event into an activity + email_events row.
 * Extracted from the Inngest function so the webhook route can call it inline —
 * production has no Inngest keys, so inline is the only path that actually runs
 * (the cron sweeper below self-heals any that slip through).
 *
 * Idempotent at both layers: integration_events_raw is unique on
 * (provider, event_id), and email_events.provider_event_id does nothing on
 * conflict. Marks the raw row processed (or records an extract error).
 */
export async function processMailshakeRawEvent(
  rawEventId: string,
): Promise<{ processed: boolean; matched: boolean; reason?: string }> {
  const rows = await db
    .select()
    .from(integrationEventsRaw)
    .where(eq(integrationEventsRaw.id, rawEventId))
    .limit(1);
  const raw = rows[0];
  if (!raw) return { processed: false, matched: false, reason: "not-found" };
  if (raw.processedAt) return { processed: true, matched: false, reason: "already" };

  const ev = extractMailshakeEvent(raw.payload);
  if (!ev) {
    await db
      .update(integrationEventsRaw)
      .set({ error: "extractMailshakeEvent returned null", processedAt: new Date() })
      .where(eq(integrationEventsRaw.id, rawEventId));
    return { processed: true, matched: false, reason: "unrecognized" };
  }

  const match = await matchEmailToContact(ev.recipient.emailAddress);

  const direction =
    ev.type === "reply" ? "inbound" : ev.type === "send" ? "outbound" : "system";
  const summary = `Mailshake ${ev.type}${ev.subject ? ` · ${ev.subject}` : ""}`;

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

  await db
    .update(integrationEventsRaw)
    .set({ processedAt: new Date() })
    .where(eq(integrationEventsRaw.id, rawEventId));

  // A reply is the high-signal moment — ping Slack (no-ops if unconfigured).
  if (ev.type === "reply") {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    await slackNotifyCard(
      "📨 New Mailshake reply",
      [
        `From: ${ev.recipient.emailAddress}`,
        ev.subject ? `Subject: ${ev.subject}` : "",
        ev.campaign?.title ? `Campaign: ${ev.campaign.title}` : "",
      ].filter(Boolean),
      match?.accountId && base ? `${base}/accounts/${match.accountId}` : undefined,
    );
  }

  return { processed: true, matched: Boolean(match) };
}

/**
 * Sweep any Mailshake raw events that never got processed (dropped webhook,
 * inline failure). Called at the end of the daily Mailshake sync cron.
 */
export async function sweepUnprocessedMailshakeEvents(limit = 200): Promise<number> {
  const pending = await db
    .select({ id: integrationEventsRaw.id })
    .from(integrationEventsRaw)
    .where(
      and(
        eq(integrationEventsRaw.provider, "mailshake"),
        isNull(integrationEventsRaw.processedAt),
      ),
    )
    .orderBy(sql`${integrationEventsRaw.receivedAt} asc`)
    .limit(limit);

  let processed = 0;
  for (const row of pending) {
    try {
      const r = await processMailshakeRawEvent(row.id);
      if (r.processed) processed++;
    } catch {
      // leave unprocessed for the next sweep
    }
  }
  return processed;
}
