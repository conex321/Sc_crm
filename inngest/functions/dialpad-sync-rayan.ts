import { inngest } from "../client";
import { db } from "@/lib/db";
import { integrationEventsRaw, calls, users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  iterateCalls,
  durationSeconds,
  getRecordingUrl,
  getTranscript,
  flattenTranscript,
  type DialpadCall,
} from "@/lib/integrations/dialpad-client";
import { recordActivity } from "@/lib/integrations/record-activity";
import { matchIdentityToContact } from "@/lib/integrations/contact-matcher";

const FILTER_USER_ID = process.env.DIALPAD_FILTER_USER_ID ?? "";
const FILTER_USER_PHONE = process.env.DIALPAD_FILTER_USER_PHONE ?? "";
const FILTER_USER_EMAIL = process.env.DIALPAD_FILTER_USER_EMAIL ?? "";

let cachedFilterUserCrmId: string | null | undefined;
async function getFilterUserCrmId(): Promise<string | null> {
  if (cachedFilterUserCrmId !== undefined) return cachedFilterUserCrmId;
  if (!FILTER_USER_EMAIL) {
    cachedFilterUserCrmId = null;
    return null;
  }
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.googleEmail}) = ${FILTER_USER_EMAIL.toLowerCase()}`)
    .limit(1);
  cachedFilterUserCrmId = rows[0]?.id ?? null;
  return cachedFilterUserCrmId;
}

function humanizeDuration(seconds?: number | null) {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function toEpochMs(v?: string | number): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return v;
  const n = Number(v);
  if (!Number.isNaN(n)) return n;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : t;
}

async function ingestCall(c: DialpadCall, rawId: string) {
  const externalPhone = c.direction === "inbound" ? c.external_number : c.contact?.phone ?? c.external_number;
  const startedAt = toEpochMs(c.date_started ?? c.date_connected);
  const isInternal = c.contact?.email?.endsWith("@schoolconex.com") ?? false;

  const match = isInternal
    ? null
    : await matchIdentityToContact({
        phone: externalPhone,
        email: c.contact?.email,
        name: c.contact?.name,
      });

  const dur = durationSeconds(c);
  const summary = `${c.direction === "inbound" ? "Inbound" : "Outbound"} call · ${humanizeDuration(dur)}${c.call_disposition ? ` · ${c.call_disposition}` : ""}${isInternal ? " · internal" : ""}`;

  const filterUserId = await getFilterUserCrmId();
  const a = await recordActivity({
    channel: "call",
    direction: c.direction,
    summary,
    occurredAt: startedAt ? new Date(startedAt) : new Date(),
    accountId: match?.accountId ?? null,
    contactId: match?.contactId ?? null,
    userId: filterUserId,
  });

  await db
    .insert(calls)
    .values({
      activityId: a.id,
      dialpadCallId: c.call_id,
      fromNumber: c.direction === "inbound" ? c.external_number ?? null : FILTER_USER_PHONE || c.internal_number || null,
      toNumber: c.direction === "inbound" ? c.internal_number ?? null : c.external_number ?? null,
      durationSeconds: dur,
      recordingUrl: getRecordingUrl(c),
      transcriptText:
        c.transcription_text ??
        flattenTranscript(await getTranscript(c.call_id).catch(() => null)),
      disposition: c.call_disposition ?? null,
    })
    .onConflictDoNothing({ target: calls.dialpadCallId });

  await db
    .update(integrationEventsRaw)
    .set({ processedAt: new Date() })
    .where(eq(integrationEventsRaw.id, rawId));
}

/**
 * Phase 3 polling: every 10 minutes, pull new calls for the configured
 * Dialpad user (Rayan) since the last successfully-processed call.
 *
 * Idempotent on (provider='dialpad', event_id=call_id) via the unique
 * index on integration_events_raw.
 */
export const dialpadSyncRayan = inngest.createFunction(
  {
    id: "dialpad-sync-rayan",
    concurrency: 1,
    retries: 2,
    triggers: [{ cron: "*/10 * * * *" }],
  },
  async ({ step, logger }) => {
    if (!FILTER_USER_ID) {
      logger.info("DIALPAD_FILTER_USER_ID not set; skipping");
      return { skipped: "no-filter-user" };
    }

    const { lastSeenMs } = await step.run("find-last-seen", async () => {
      const rows = await db
        .select({ ts: sql<string | null>`max(${integrationEventsRaw.receivedAt})` })
        .from(integrationEventsRaw)
        .where(eq(integrationEventsRaw.provider, "dialpad"));
      const raw = rows[0]?.ts ?? null;
      const ms = raw ? new Date(raw).getTime() : null;
      return { lastSeenMs: ms };
    });

    const startedAfter = lastSeenMs
      ? lastSeenMs - 60_000 // 1-min overlap to defeat clock skew
      : Date.now() - 30 * 24 * 60 * 60 * 1000; // first run: last 30 days

    let pulled = 0;
    let inserted = 0;
    for await (const c of iterateCalls({
      userId: FILTER_USER_ID,
      startedAfter,
      pageSize: 100,
    })) {
      pulled += 1;
      const ins = await step.run(`raw-${c.call_id}`, async () => {
        const rows = await db
          .insert(integrationEventsRaw)
          .values({
            provider: "dialpad",
            eventId: c.call_id,
            eventType: c.state ?? "call",
            payload: c as object,
          })
          .onConflictDoNothing({
            target: [integrationEventsRaw.provider, integrationEventsRaw.eventId],
          })
          .returning({ id: integrationEventsRaw.id });
        return rows[0] ?? null;
      });

      if (ins) {
        inserted += 1;
        await step.run(`ingest-${c.call_id}`, () => ingestCall(c, ins.id));
      }
    }

    logger.info(`pulled=${pulled} new=${inserted}`);
    return { pulled, inserted, startedAfter };
  },
);
