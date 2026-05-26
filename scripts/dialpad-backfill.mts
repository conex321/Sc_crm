// Manual backfill: pull company-wide Dialpad calls and ingest them
// straight into Postgres (writing parent activities + calls child rows).
// Run: tsx scripts/dialpad-backfill.mts [days=30]
//
// Requires a Dialpad COMPANY ADMIN api key in DIALPAD_API_KEY (the
// personal/user-tier token cannot read /api/v2/call).
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";

const token = process.env.DIALPAD_API_KEY;
const userId = process.env.DIALPAD_FILTER_USER_ID;
const databaseUrl = process.env.DATABASE_URL;
const userPhone = process.env.DIALPAD_FILTER_USER_PHONE ?? "";
const scope = process.env.DIALPAD_SYNC_SCOPE ?? "company";
const days = Number(process.argv[2] ?? 30);

if (!token || !databaseUrl || (scope === "user" && !userId)) {
  console.error(
    "Need DIALPAD_API_KEY, DATABASE_URL, and DIALPAD_FILTER_USER_ID when DIALPAD_SYNC_SCOPE=user",
  );
  process.exit(1);
}

const sql = postgres(databaseUrl, { prepare: false, max: 1 });

type DialpadCall = {
  call_id: string;
  direction: "inbound" | "outbound";
  date_started?: string | number;
  date_connected?: string | number;
  /** milliseconds */
  duration?: number;
  user_id?: string | number;
  external_number?: string;
  internal_number?: string;
  target?: { id?: string | number; phone?: string; email?: string };
  contact?: { phone?: string; email?: string };
  recording_details?: Array<{ url?: string }>;
  recording_url?: string[];
  voicemail_url?: string;
  transcription_text?: string;
  call_disposition?: string;
  state?: string;
};

function pickDialpadOwnerId(c: DialpadCall): string | null {
  const fromCall = c.direction === "inbound" ? c.target?.id : c.user_id;
  const fallback = c.user_id ?? c.target?.id ?? null;
  const id = fromCall ?? fallback;
  return id == null ? null : String(id);
}

let dialpadUserMap: Map<string, string> | null = null;
async function getDialpadUserMap(): Promise<Map<string, string>> {
  if (dialpadUserMap) return dialpadUserMap;
  const rows = await sql`
    select id::text as id, dialpad_user_id from public.users
    where dialpad_user_id is not null
  `;
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.dialpad_user_id as string, r.id as string);
  dialpadUserMap = map;
  return map;
}

let fallbackUserIdCache: string | null | undefined = undefined;
async function getFallbackUserId(): Promise<string | null> {
  if (fallbackUserIdCache !== undefined) return fallbackUserIdCache;
  const filterEmail = process.env.DIALPAD_FILTER_USER_EMAIL ?? "";
  if (!filterEmail) {
    fallbackUserIdCache = null;
    return null;
  }
  const rows = await sql`
    select id::text as id from public.users
    where lower(google_email) = ${filterEmail.toLowerCase()}
    limit 1
  `;
  fallbackUserIdCache = (rows[0]?.id as string | undefined) ?? null;
  return fallbackUserIdCache;
}

function recordingUrl(c: DialpadCall): string | null {
  const detail = c.recording_details?.find((r) => r?.url);
  if (detail?.url) return detail.url;
  if (c.recording_url?.[0]) return c.recording_url[0];
  return c.voicemail_url ?? null;
}

function durationSeconds(c: DialpadCall): number | null {
  if (c.duration == null) return null;
  return Math.round(c.duration / 1000);
}

function humanizeDuration(seconds?: number | null) {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function toDate(v?: string | number): Date {
  if (v == null) return new Date();
  if (typeof v === "number") return new Date(v);
  const n = Number(v);
  if (!Number.isNaN(n)) return new Date(n);
  return new Date(v);
}

function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length > 7 ? `+${digits}` : null;
}

async function matchPhone(phone: string): Promise<{ accountId: string; contactId: string } | null> {
  const e164 = normalizePhone(phone);
  if (!e164) return null;
  const last7 = e164.replace(/\D/g, "").slice(-7);
  const rows = await sql`
    select id as contact_id, account_id from public.contacts
    where deleted_at is null
      and (phone = ${e164} or whatsapp_phone = ${e164}
           or phone like ${"%" + last7} or whatsapp_phone like ${"%" + last7})
    limit 1
  `;
  if (rows.length === 0) return null;
  return { accountId: rows[0].account_id, contactId: rows[0].contact_id };
}

async function ingest(c: DialpadCall): Promise<"new" | "duplicate"> {
  // 1. Idempotent insert into integration_events_raw
  const rawRows = await sql`
    insert into public.integration_events_raw (provider, event_id, event_type, payload)
    values ('dialpad', ${c.call_id}, ${c.state ?? "call"}, ${JSON.stringify(c)}::jsonb)
    on conflict (provider, event_id) do nothing
    returning id
  `;
  if (rawRows.length === 0) return "duplicate";

  // 2. Match contact by external phone (skip internal-to-internal calls — same company)
  const externalPhone =
    c.direction === "inbound" ? c.external_number : (c.contact?.phone ?? c.external_number);
  const isInternal = c.contact?.email?.endsWith("@schoolconex.com") ?? false;
  const match = externalPhone && !isInternal ? await matchPhone(externalPhone) : null;

  // 3. Insert parent activity
  const durSec = durationSeconds(c);
  const summary = `${c.direction === "inbound" ? "Inbound" : "Outbound"} call · ${humanizeDuration(durSec)}${c.call_disposition ? ` · ${c.call_disposition}` : ""}${isInternal ? " · internal" : ""}`;
  const occurredAt = toDate(c.date_started ?? c.date_connected);
  const ownerMap = await getDialpadUserMap();
  const fallbackUserId = await getFallbackUserId();
  const ownerId = pickDialpadOwnerId(c);
  const resolvedUserId = (ownerId && ownerMap.get(ownerId)) || fallbackUserId;
  const activityRows = await sql`
    insert into public.activities (channel, direction, summary, occurred_at, account_id, contact_id, user_id)
    values ('call', ${c.direction}, ${summary}, ${occurredAt}, ${match?.accountId ?? null}, ${match?.contactId ?? null}, ${resolvedUserId})
    returning id
  `;
  const activityId = activityRows[0].id as string;

  // 4. Insert calls child row
  await sql`
    insert into public.calls (
      activity_id, dialpad_call_id, from_number, to_number,
      duration_seconds, recording_url, transcript_text, disposition
    ) values (
      ${activityId},
      ${c.call_id},
      ${c.direction === "inbound" ? (c.external_number ?? c.contact?.phone ?? null) : (c.internal_number ?? c.target?.phone ?? (userPhone || null))},
      ${c.direction === "inbound" ? (c.internal_number ?? c.target?.phone ?? null) : (c.external_number ?? c.contact?.phone ?? null)},
      ${durSec},
      ${recordingUrl(c)},
      ${c.transcription_text ?? null},
      ${c.call_disposition ?? null}
    )
    on conflict (dialpad_call_id) do nothing
  `;

  // 5. Mark raw event processed
  await sql`
    update public.integration_events_raw set processed_at = now() where id = ${rawRows[0].id}
  `;

  return "new";
}

async function main() {
  const startedAfter = Date.now() - days * 24 * 60 * 60 * 1000;
  console.error(
    `Pulling Dialpad ${scope === "user" ? `user ${userId}` : "company"} calls since ${new Date(startedAfter).toISOString()}…`,
  );

  let cursor: string | undefined;
  let pulled = 0;
  let inserted = 0;
  let duplicates = 0;
  let pages = 0;

  do {
    const params = new URLSearchParams({
      started_after: String(startedAfter),
      limit: "50",
    });
    if (scope === "user") params.set("user_id", String(userId));
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`https://dialpad.com/api/v2/call?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Dialpad API error ${res.status}: ${body.slice(0, 800)}`);
      console.error(
        "If 401: your token isn't a company-admin key. Generate one at " +
          "Company Settings → Authentication → API Keys (must be created by an admin).",
      );
      process.exit(1);
    }
    const body = (await res.json()) as { items?: DialpadCall[]; cursor?: string };
    pages += 1;
    for (const c of body.items ?? []) {
      pulled += 1;
      const result = await ingest(c);
      if (result === "new") inserted += 1;
      else duplicates += 1;
    }
    cursor = body.cursor;
  } while (cursor);

  console.error(
    `Done · pages=${pages} pulled=${pulled} inserted=${inserted} duplicates=${duplicates}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 5 }));
