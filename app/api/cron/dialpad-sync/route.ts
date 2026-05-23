import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  integrationEventsRaw,
  calls as callsTable,
  users,
} from "@/lib/db/schema";
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
import { matchPhoneToContact } from "@/lib/integrations/contact-matcher";
import { runAutoPipeline } from "@/lib/integrations/auto-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FILTER_USER_ID = process.env.DIALPAD_FILTER_USER_ID ?? "";
const FILTER_USER_PHONE = process.env.DIALPAD_FILTER_USER_PHONE ?? "";
const FILTER_USER_EMAIL = process.env.DIALPAD_FILTER_USER_EMAIL ?? "";

function toEpochMs(v?: string | number): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return v;
  const n = Number(v);
  if (!Number.isNaN(n)) return n;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : t;
}

function humanize(seconds?: number | null) {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function getFilterUserCrmId(): Promise<string | null> {
  if (!FILTER_USER_EMAIL) return null;
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.googleEmail}) = ${FILTER_USER_EMAIL.toLowerCase()}`)
    .limit(1);
  return rows[0]?.id ?? null;
}

async function ingestCall(c: DialpadCall, rawId: string, userId: string | null) {
  const externalPhone =
    c.direction === "inbound" ? c.external_number : c.contact?.phone ?? c.external_number;
  const startedAt = toEpochMs(c.date_started ?? c.date_connected);
  const isInternal = c.contact?.email?.endsWith("@schoolconex.com") ?? false;
  const match = externalPhone && !isInternal ? await matchPhoneToContact(externalPhone) : null;
  const dur = durationSeconds(c);
  const summary = `${c.direction === "inbound" ? "Inbound" : "Outbound"} call · ${humanize(dur)}${c.call_disposition ? ` · ${c.call_disposition}` : ""}${isInternal ? " · internal" : ""}`;

  const a = await recordActivity({
    channel: "call",
    direction: c.direction,
    summary,
    occurredAt: startedAt ? new Date(startedAt) : new Date(),
    accountId: match?.accountId ?? null,
    contactId: match?.contactId ?? null,
    userId,
  });

  await db
    .insert(callsTable)
    .values({
      activityId: a.id,
      dialpadCallId: c.call_id,
      fromNumber: c.direction === "inbound" ? c.external_number ?? null : FILTER_USER_PHONE || c.internal_number || null,
      toNumber: c.direction === "inbound" ? c.internal_number ?? null : c.external_number ?? null,
      durationSeconds: dur,
      recordingUrl: getRecordingUrl(c),
      transcriptText:
        c.transcription_text ?? flattenTranscript(await getTranscript(c.call_id).catch(() => null)),
      disposition: c.call_disposition ?? null,
    })
    .onConflictDoNothing({ target: callsTable.dialpadCallId });

  await db
    .update(integrationEventsRaw)
    .set({ processedAt: new Date() })
    .where(eq(integrationEventsRaw.id, rawId));
}

/**
 * Vercel cron entry — pulls new Dialpad calls for FILTER_USER (Rayan).
 * Watermarked on max(integration_events_raw.received_at) - 60s for clock skew.
 * Auto-cascades into runAutoPipeline so newly-arrived calls get matched to
 * fresh contacts (and vice-versa) immediately.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    if (header !== `Bearer ${secret}`) {
      return new NextResponse("unauthorized", { status: 401 });
    }
  }
  if (!process.env.DIALPAD_API_KEY) {
    return NextResponse.json({ skipped: "no-api-key" });
  }
  if (!FILTER_USER_ID) {
    return NextResponse.json({ skipped: "no-filter-user" });
  }

  try {
    const watermark = await db
      .select({ ts: sql<string | null>`max(${integrationEventsRaw.receivedAt})` })
      .from(integrationEventsRaw)
      .where(eq(integrationEventsRaw.provider, "dialpad"));
    const lastSeenMs = watermark[0]?.ts ? new Date(watermark[0].ts).getTime() : null;
    const startedAfter = lastSeenMs
      ? lastSeenMs - 60_000
      : Date.now() - 30 * 24 * 60 * 60 * 1000;

    const userId = await getFilterUserCrmId();
    let pulled = 0;
    let inserted = 0;
    for await (const c of iterateCalls({
      userId: FILTER_USER_ID,
      startedAfter,
      pageSize: 100,
    })) {
      pulled++;
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
      if (rows[0]) {
        inserted++;
        await ingestCall(c, rows[0].id, userId);
      }
    }

    const auto = await runAutoPipeline();

    return NextResponse.json({
      ok: true,
      pulled,
      inserted,
      startedAfter,
      auto,
      ranAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
