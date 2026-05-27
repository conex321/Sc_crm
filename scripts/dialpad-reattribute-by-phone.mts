// Phone-fallback reattribute. For Dialpad call activities still missing
// activities.user_id after the payload-based reattribute, infer the rep by
// matching calls.from_number or calls.to_number against users.dialpad_phone.
//
// Use case: webhook-ingested calls whose raw payload lacks user_id/target.id
// — common for the historical calls ingested via the Inngest webhook path
// (before the daily cron took over).
//
// Idempotent. Run after migration 0007 + create-matthew-user.sql so the
// users.dialpad_phone column is populated.
//
// Usage: tsx scripts/dialpad-reattribute-by-phone.mts [--dry]
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

function normalize(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length > 7 ? `+${digits}` : null;
}

function lastSeven(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-7) : null;
}

async function main() {
  const reps = await sql<
    Array<{ id: string; email: string; phone: string }>
  >`
    select id::text as id, google_email as email, dialpad_phone as phone
    from public.users
    where dialpad_phone is not null
  `;
  console.error(`known rep phone mappings: ${reps.length}`);
  const phoneToUser = new Map<string, string>();
  for (const r of reps) {
    const l7 = lastSeven(normalize(r.phone));
    if (!l7) continue;
    phoneToUser.set(l7, r.id);
    console.error(`  ${r.email} → ${r.phone} (last7=${l7})`);
  }
  if (phoneToUser.size === 0) {
    console.error("no rep phone mappings — nothing to do");
    process.exit(0);
  }

  // Pull every call activity that is still missing user_id.
  const calls = await sql<
    Array<{
      activity_id: string;
      from_number: string | null;
      to_number: string | null;
    }>
  >`
    select a.id::text as activity_id, c.from_number, c.to_number
    from public.activities a
    join public.calls c on c.activity_id = a.id
    where a.channel = 'call' and a.user_id is null
  `;
  console.error(`call activities missing user_id: ${calls.length}`);

  let matched = 0;
  let ambiguous = 0;
  let unmatched = 0;
  for (const row of calls) {
    const candidates = [row.from_number, row.to_number]
      .map((p) => lastSeven(normalize(p)))
      .filter((p): p is string => Boolean(p));
    const hits = new Set<string>();
    for (const l7 of candidates) {
      const uid = phoneToUser.get(l7);
      if (uid) hits.add(uid);
    }
    if (hits.size === 0) {
      unmatched++;
      continue;
    }
    if (hits.size > 1) {
      // Internal call between two reps (both phones match different reps).
      // Conventionally we credit the FROM side as the owner — flip if needed.
      ambiguous++;
      const fromL7 = lastSeven(normalize(row.from_number));
      const fromUid = fromL7 ? phoneToUser.get(fromL7) : null;
      const pick = fromUid ?? hits.values().next().value!;
      if (!dry) {
        await sql`update public.activities set user_id = ${pick}, updated_at = now() where id = ${row.activity_id}`;
      }
      matched++;
      continue;
    }
    const pick = hits.values().next().value!;
    if (!dry) {
      await sql`update public.activities set user_id = ${pick}, updated_at = now() where id = ${row.activity_id}`;
    }
    matched++;
  }
  console.error(
    `${dry ? "[dry] " : ""}done · scanned=${calls.length} matched=${matched} ambiguous=${ambiguous} unmatched=${unmatched}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 5 }));
