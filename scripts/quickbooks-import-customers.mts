// Import canonical QuickBooks/Stripe customers (.quickbooks/qbo-canonical.json,
// produced by quickbooks-build-canonical.mts) into CRM accounts + contacts (D-041).
//
// Idempotent. Match order per account:
//   1. accounts.external_ids->>'quickbooks_id'  (exact re-run match)
//   2. any overlapping stripe id in external_ids->'stripe_ids'
//   3. case-insensitive account name  (enrich an existing Mailshake account
//      instead of creating a QuickBooks duplicate)
//   else INSERT a new account.
// Existing accounts are ENRICHED (customer_status / billing / external_ids / email);
// curated phone/address/website/source are preserved (coalesce, existing wins).
// Contacts are upserted one per (account, lower(email)); existing ones are left as-is.
//
// Uses raw postgres — no Drizzle/server-only. Run: tsx scripts/quickbooks-import-customers.mts [--dry]
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const dry = process.argv.includes("--dry");
const CANON = ".quickbooks/qbo-canonical.json";

type CanonContact = { email: string; first: string | null; last: string | null; isPrimary: boolean };
type CanonAccount = {
  source: string; name: string;
  customer_status: "active" | "inactive" | "prospect";
  email: string | null; phone: string | null; address: string | null; website: string | null;
  external_ids: { quickbooks_id: string | null; quickbooks_ids: string[]; stripe_ids: string[] };
  billing_summary: Record<string, unknown> | null;
  contacts: CanonContact[];
};

// Match build-canonical's normalizer exactly (strip all non-alphanumerics) so
// punctuation/whitespace variants ("St. Mary" vs "St Mary") enrich the existing
// account instead of inserting a duplicate.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function main() {
  const { accounts: canon } = JSON.parse(readFileSync(CANON, "utf8")) as { accounts: CanonAccount[] };
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  try {
    // Snapshot existing accounts for matching (taken once, before any insert).
    const existing = await sql<
      { id: string; name: string; qbo: string | null; stripe: string[] | null }[]
    >`select id::text, name,
             external_ids->>'quickbooks_id' as qbo,
             (select array_agg(v) from jsonb_array_elements_text(coalesce(external_ids->'stripe_ids','[]'::jsonb)) v) as stripe
      from public.accounts where deleted_at is null`;
    const byQbo = new Map<string, string>();
    const byName = new Map<string, string>();
    const byStripe = new Map<string, string>();
    for (const a of existing) {
      if (a.qbo) byQbo.set(a.qbo, a.id);
      byName.set(norm(a.name), a.id);
      for (const s of a.stripe || []) byStripe.set(s, a.id);
    }

    // Existing contact emails for dedupe.
    const contactRows = await sql<{ account_id: string; email: string }[]>`
      select account_id::text, lower(email) as email
      from public.contacts where deleted_at is null and email is not null`;
    const existingContact = new Set(contactRows.map((c) => `${c.account_id}|${c.email}`));

    let inserted = 0, enriched = 0, cContacts = 0, cSkipped = 0;
    const report: string[] = [];
    // Accounts already claimed by a distinct QBO id during this run. Prevents two
    // namesake customers (e.g. the two "Michelle Zhang" records) from collapsing
    // onto one pre-existing same-name account via the byName path.
    const claimed = new Map<string, string>();

    for (const c of canon) {
      const qid = c.external_ids.quickbooks_id;
      let accountId =
        (qid && byQbo.get(qid)) ||
        c.external_ids.stripe_ids.map((s) => byStripe.get(s)).find(Boolean) ||
        byName.get(norm(c.name)) ||
        null;

      // If a name-match landed on an account another QBO customer already claimed
      // this run, don't merge distinct customers — insert a separate account.
      if (accountId && qid && (claimed.get(accountId) ?? qid) !== qid) accountId = null;

      if (accountId) {
        enriched++;
        report.push(`  [enrich] ${c.name} (${c.customer_status}) -> ${accountId.slice(0, 8)}…`);
        if (!dry) {
          await sql`
            update public.accounts set
              customer_status = ${c.customer_status}::public.customer_status,
              email           = coalesce(${c.email}, email),
              phone           = coalesce(phone, ${c.phone}),
              address         = coalesce(address, ${c.address}),
              website         = coalesce(website, ${c.website}),
              source          = coalesce(source, ${c.source}),
              external_ids    = external_ids || ${sql.json(c.external_ids)}::jsonb,
              billing_summary = coalesce(${c.billing_summary ? sql.json(c.billing_summary) : null}::jsonb, billing_summary),
              updated_at      = now()
            where id = ${accountId}::uuid`;
        }
      } else {
        inserted++;
        report.push(`  [insert] ${c.name} (${c.customer_status}) [${c.source}]`);
        if (!dry) {
          const ins = await sql<{ id: string }[]>`
            insert into public.accounts
              (name, type, source, email, customer_status, external_ids, billing_summary, phone, address, website)
            values (${c.name}, 'school', ${c.source}, ${c.email},
                    ${c.customer_status}::public.customer_status,
                    ${sql.json(c.external_ids)}::jsonb,
                    ${c.billing_summary ? sql.json(c.billing_summary) : null}::jsonb,
                    ${c.phone}, ${c.address}, ${c.website})
            returning id::text`;
          accountId = ins[0].id;
        }
        // NOTE: do NOT register this new name in byName. Two canonical rows that
        // share a name but are distinct QBO ids (e.g. the two namesake "Michelle
        // Zhang" records) must each insert their own account, not collapse into
        // the first. Re-run idempotency is guaranteed by the quickbooks_id match.
      }

      // Claim this account for its QBO id so a later namesake can't enrich onto it.
      if (accountId && qid) claimed.set(accountId, qid);

      // Contacts.
      for (const ct of c.contacts) {
        const email = ct.email.toLowerCase();
        const key = accountId ? `${accountId}|${email}` : `dry|${email}`;
        if (accountId && existingContact.has(key)) { cSkipped++; continue; }
        cContacts++;
        if (!dry && accountId) {
          const first = ct.first?.trim() || email.split("@")[0] || "(unknown)";
          const last = ct.last?.trim() || "";
          await sql`
            insert into public.contacts
              (account_id, first_name, last_name, email, is_primary, external_ids)
            values (${accountId}::uuid, ${first}, ${last}, ${email}, ${!!ct.isPrimary},
                    ${sql.json({ quickbooks_id: qid })})`;
          existingContact.add(key);
        }
      }
    }

    console.log(report.join("\n"));
    console.log(`\n${dry ? "[DRY] " : ""}accounts: ${inserted} inserted, ${enriched} enriched`);
    console.log(`${dry ? "[DRY] " : ""}contacts: ${cContacts} created, ${cSkipped} skipped (already exist)`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
