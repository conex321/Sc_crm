// Re-attribute historical Dialpad calls to the correct CRM user.
//
// Until 2026-05-26, the daily company-wide Dialpad cron stamped every
// `activities.user_id` with the single env-pinned `DIALPAD_FILTER_USER_EMAIL`
// (Rayan), regardless of which rep actually owned the call. This script walks
// every call activity, re-reads the raw Dialpad payload from
// `integration_events_raw`, and rewrites `activities.user_id` based on the
// per-call `user_id` / `target.id` mapped via `users.dialpad_user_id`.
//
// Idempotent. Run after applying migration 0005 and seeding rep mappings.
//
// Usage: tsx scripts/dialpad-reattribute-calls.mts [--dry]
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";

const dry = process.argv.includes("--dry");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const sql = postgres(databaseUrl, { prepare: false, max: 1 });

type Payload = {
  call_id?: string;
  direction?: "inbound" | "outbound";
  user_id?: string | number;
  target?: { id?: string | number };
};

function pickOwner(p: Payload): string | null {
  if (!p) return null;
  const fromCall = p.direction === "inbound" ? p.target?.id : p.user_id;
  const fallback = p.user_id ?? p.target?.id ?? null;
  const id = fromCall ?? fallback;
  return id == null ? null : String(id);
}

async function main() {
  const repRows = await sql`
    select id::text as id, dialpad_user_id, google_email, full_name
    from public.users where dialpad_user_id is not null
  `;
  const map = new Map<string, { userId: string; email: string }>();
  for (const r of repRows) {
    map.set(r.dialpad_user_id as string, {
      userId: r.id as string,
      email: r.google_email as string,
    });
  }
  console.error(`known rep mappings: ${map.size}`);
  for (const [dpId, v] of map) console.error(`  ${dpId} → ${v.email} (${v.userId})`);

  const rows = await sql<
    Array<{
      activity_id: string;
      current_user_id: string | null;
      payload: Payload;
      call_id: string;
    }>
  >`
    select a.id::text as activity_id,
           a.user_id::text as current_user_id,
           r.payload,
           r.event_id as call_id
    from public.activities a
    join public.calls c on c.activity_id = a.id
    join public.integration_events_raw r on r.event_id = c.dialpad_call_id and r.provider = 'dialpad'
    where a.channel = 'call'
  `;

  let updated = 0;
  let cleared = 0;
  let unchanged = 0;
  let unmapped = 0;
  for (const row of rows) {
    const ownerId = pickOwner(row.payload as Payload);
    const target = ownerId ? map.get(ownerId)?.userId ?? null : null;
    if (ownerId && !target) {
      unmapped++;
      continue; // unknown Dialpad rep — leave as-is for now
    }
    if (target === row.current_user_id) {
      unchanged++;
      continue;
    }
    if (!dry) {
      await sql`update public.activities set user_id = ${target}, updated_at = now() where id = ${row.activity_id}`;
    }
    if (target === null) cleared++;
    else updated++;
  }
  console.error(
    `${dry ? "[dry] " : ""}done · scanned=${rows.length} updated=${updated} cleared=${cleared} unchanged=${unchanged} unmapped=${unmapped}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 5 }));
