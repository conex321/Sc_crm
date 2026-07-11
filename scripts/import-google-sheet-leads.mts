// D-044: import the "International OSSD Leads" Google Sheet into the CRM via
// the same engine the /accounts/import wizard uses — one import batch per tab,
// visible + revertable in /accounts/imports, owned by Rayan.
//
// Auth model: no Supabase service-role key exists anywhere (verified empty in
// Vercel too), so the engine runs on an anon client signed in as the demo
// admin (email/password — the e2e pattern), which satisfies RLS. Afterwards
// the batches' created_by is flipped to Rayan via the direct Postgres
// connection so they appear in HIS import history.
//
// Sheet access: gws-sc CLI (matthew@schoolconex.com keyring auth).
// Run: tsx scripts/import-google-sheet-leads.mts [--dry] [--tabs "A,B"]
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { applyMapping, type ColumnMapping } from "../lib/import/columns";
import { processChunk, finalizeBatch } from "../lib/import/engine";

const SPREADSHEET_ID = "1afjlWeMW4x_kdksf6cxoqXpc98KOF4FAauFnPlnYedg";
const DEFAULT_TABS = ["Kuwait (Validated)", "China (Validated)", "Saudi (Validated)"];
const CHUNK = 500;

const dry = process.argv.includes("--dry");
const tabsArg = process.argv.indexOf("--tabs");
const TABS = tabsArg > -1 ? process.argv[tabsArg + 1].split(",").map((s) => s.trim()) : DEFAULT_TABS;

// Explicit column mapping for the OSSD sheet tabs (headers are near-identical
// across the three Validated tabs). "Email" is the school's general inbox in
// this sheet, so it maps to the ACCOUNT email, not the contact.
// Duplicate headers get suffixed _2, _3 … by rowsToObjects below.
const SHEET_MAPPING: ColumnMapping = {
  "Type": "account_type",
  "Organization Type": "account_type",
  "School": "account_name",
  "Number": "account_phone",
  "Website": "website",
  "Country": "country",
  "Email": "account_email",
  "Contact Title": "contact_role",
  "Contact First Name": "contact_first_name",
  "Contact Last Name": "contact_last_name",
  "Contact Full Name": "contact_full_name",
  "Contact LinkedIn": "contact_linkedin",
  "Company Linkedin": "account_linkedin",
};

function fetchTab(tab: string): { headers: string[]; rows: Record<string, unknown>[] } {
  const params = JSON.stringify({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${tab}'!A1:AC3000`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  // gws-sc is a bash wrapper (~/bin/gws-sc) — invoke through bash with POSIX
  // single-quote escaping (the range itself contains single quotes).
  const shQuoted = `'${params.replace(/'/g, `'\\''`)}'`;
  const out = execFileSync(
    "bash",
    ["-c", `gws-sc sheets spreadsheets values get --params ${shQuoted}`],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  const json = JSON.parse(out.slice(out.indexOf("{")));
  const values: unknown[][] = json.values ?? [];
  if (values.length < 2) return { headers: [], rows: [] };

  // Suffix duplicate headers (Number, Country appear twice in some tabs).
  const seen = new Map<string, number>();
  const headers = (values[0] as unknown[]).map((h) => {
    const base = String(h ?? "").trim();
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });

  const rows = values.slice(1).map((r) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = r[i] ?? "";
    });
    return obj;
  });
  return { headers, rows };
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  const rayan = (
    await sql<{ id: string }[]>`select id::text from public.users where google_email = 'rayan@schoolconex.com'`
  )[0];
  if (!rayan) throw new Error("Rayan's user not found");

  // Signed-in Supabase session (RLS path) — demo admin, e2e credentials.
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  if (!dry) {
    // Credentials come from .env.local (gitignored) — never hardcode them.
    const email = process.env.E2E_LOGIN_EMAIL;
    const password = process.env.E2E_LOGIN_PASSWORD;
    if (!email || !password) {
      throw new Error("Set E2E_LOGIN_EMAIL + E2E_LOGIN_PASSWORD in .env.local");
    }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`Supabase sign-in failed: ${error.message}`);
  }

  const batchIds: string[] = [];
  for (const tab of TABS) {
    console.log(`\n=== ${tab} ===`);
    const { headers, rows } = fetchTab(tab);
    console.log(`fetched ${rows.length} data rows (${headers.length} cols)`);
    const { mapped, droppedNoName } = applyMapping(rows, SHEET_MAPPING);
    console.log(`usable rows: ${mapped.length} (dropped ${droppedNoName} with no school name)`);
    if (mapped.length === 0) continue;

    if (dry) {
      const norms = [...new Set(mapped.map((m) => norm(m.account.name)))];
      const existing = await sql<{ n: string }[]>`
        select count(distinct norm_name)::text n from public.accounts
        where norm_name = any(${norms}) and deleted_at is null`;
      const matched = Number(existing[0].n);
      const withContact = mapped.filter((m) => m.contact).length;
      console.log(
        `DRY: would match ~${matched} existing accounts, create ~${norms.length - matched} new; ${withContact} rows carry a contact`,
      );
      continue;
    }

    const { data: batch, error: bErr } = await sb
      .from("import_batches")
      .insert({
        created_by: (await sb.auth.getUser()).data.user!.id,
        filename: `OSSD Sheet · ${tab}`,
        source: "google_sheet",
        status: "running",
        mapping: SHEET_MAPPING,
        total_rows: mapped.length,
      })
      .select("id")
      .single();
    if (bErr) throw new Error(bErr.message);
    batchIds.push(batch.id);

    for (let i = 0; i < mapped.length; i += CHUNK) {
      const chunk = mapped.slice(i, i + CHUNK);
      const r = await processChunk(sb, {
        batchId: batch.id,
        userId: rayan.id, // audit stamps on created accounts/contacts
        ownerId: rayan.id,
        defaultSource: "google_sheet",
        rows: chunk,
      });
      console.log(
        `  chunk ${i / CHUNK + 1}: +${r.accountsCreated} accounts, ~${r.accountsMatched} matched, +${r.contactsCreated} contacts, ${r.errors.length} errors`,
      );
    }
    const stats = await finalizeBatch(sb, batch.id);
    console.log(
      `DONE ${tab}: ${stats.accountsCreated} new / ${stats.accountsMatched} matched accounts, ${stats.contactsCreated} new contacts, ${stats.contactsUpdated} enriched, ${stats.errors.length} errors`,
    );
  }

  if (!dry && batchIds.length > 0) {
    // Hand the batches to Rayan so they live in HIS import history.
    await sql`update public.import_batches set created_by = ${rayan.id}::uuid where id = any(${batchIds}::uuid[])`;
    console.log(`\nbatches reassigned to Rayan: ${batchIds.length}`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
