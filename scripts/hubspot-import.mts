// D-044: one-shot (re-runnable) HubSpot → CRM import. Pages through all
// HubSpot companies + contacts (+ their associations) and runs them through
// the same lib/import/engine.ts as the wizard, so the result is a normal,
// revertable import batch owned by Rayan.
//
// Idempotency / future-sync primitive: every imported account/contact gets
// external_ids.hubspot_id stamped after the engine pass; re-runs match by
// name/email exactly like any other import (and the batch lineage shows what
// each run actually did).
//
// Needs: HUBSPOT_ACCESS_TOKEN in .env.local — a HubSpot Private App token
// (Settings → Integrations → Private Apps) with scopes:
//   crm.objects.companies.read, crm.objects.contacts.read
//
// Run: tsx scripts/hubspot-import.mts [--dry]
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import type { MappedRow } from "../lib/import/columns";
import { processChunk, finalizeBatch } from "../lib/import/engine";

const dry = process.argv.includes("--dry");
const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const API = "https://api.hubapi.com";
const CHUNK = 500;

if (!TOKEN) {
  console.error(
    "HUBSPOT_ACCESS_TOKEN is not set.\n" +
      "Create a Private App in HubSpot (Settings → Integrations → Private Apps)\n" +
      "with scopes crm.objects.companies.read + crm.objects.contacts.read,\n" +
      "then add HUBSPOT_ACCESS_TOKEN=<token> to .env.local and re-run.",
  );
  process.exit(1);
}

async function hs<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

type HsPage<T> = { results: T[]; paging?: { next?: { after?: string } } };

async function pageAll<T>(basePath: string, label: string): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  do {
    const sep = basePath.includes("?") ? "&" : "?";
    const page = await hs<HsPage<T>>(
      `${basePath}${sep}limit=100${after ? `&after=${after}` : ""}`,
    );
    out.push(...page.results);
    after = page.paging?.next?.after;
    if (out.length % 1000 === 0 && out.length > 0) console.log(`  ${label}: ${out.length}…`);
  } while (after);
  console.log(`${label}: ${out.length} total`);
  return out;
}

type HsCompany = {
  id: string;
  properties: {
    name?: string;
    domain?: string;
    website?: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
    linkedin_company_page?: string;
  };
};
type HsContact = {
  id: string;
  properties: {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    mobilephone?: string;
    jobtitle?: string;
    company?: string;
    hs_linkedin_url?: string;
  };
  associations?: { companies?: { results: { id: string }[] } };
};

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const rayan = (
    await sql<{ id: string }[]>`select id::text from public.users where google_email='rayan@schoolconex.com'`
  )[0];
  if (!rayan) throw new Error("Rayan's user not found");

  console.log("Pulling HubSpot data…");
  const companies = await pageAll<HsCompany>(
    "/crm/v3/objects/companies?properties=name,domain,website,phone,address,city,country,linkedin_company_page",
    "companies",
  );
  const contacts = await pageAll<HsContact>(
    "/crm/v3/objects/contacts?properties=firstname,lastname,email,phone,mobilephone,jobtitle,company,hs_linkedin_url&associations=companies",
    "contacts",
  );

  const companyById = new Map(companies.map((c) => [c.id, c]));
  const clean = (v: unknown) => String(v ?? "").trim().slice(0, 500) || undefined;

  // One MappedRow per contact (associated company or the free-text `company`
  // property as the account), plus one row per company with no contacts so
  // empty companies still import.
  const rows: MappedRow[] = [];
  const companiesWithContact = new Set<string>();
  let rowIndex = 1;
  let skippedNoAccount = 0;

  for (const ct of contacts) {
    const assoc = ct.associations?.companies?.results?.[0]?.id;
    const comp = assoc ? companyById.get(assoc) : undefined;
    if (comp) companiesWithContact.add(comp.id);
    const accountName = clean(comp?.properties.name) ?? clean(ct.properties.company);
    if (!accountName) {
      skippedNoAccount++;
      continue;
    }
    rows.push({
      rowIndex: rowIndex++,
      account: {
        name: accountName,
        website: clean(comp?.properties.website) ?? clean(comp?.properties.domain),
        phone: clean(comp?.properties.phone),
        address: clean(
          [comp?.properties.address, comp?.properties.city].filter(Boolean).join(", "),
        ),
        country: clean(comp?.properties.country),
        source: "hubspot",
        linkedin: clean(comp?.properties.linkedin_company_page),
      },
      contact: {
        firstName: clean(ct.properties.firstname),
        lastName: clean(ct.properties.lastname),
        email: clean(ct.properties.email)?.toLowerCase(),
        phone: clean(ct.properties.phone) ?? clean(ct.properties.mobilephone),
        role: clean(ct.properties.jobtitle),
        linkedin: clean(ct.properties.hs_linkedin_url),
      },
    });
  }
  for (const comp of companies) {
    if (companiesWithContact.has(comp.id)) continue;
    const name = clean(comp.properties.name);
    if (!name) continue;
    rows.push({
      rowIndex: rowIndex++,
      account: {
        name,
        website: clean(comp.properties.website) ?? clean(comp.properties.domain),
        phone: clean(comp.properties.phone),
        address: clean([comp.properties.address, comp.properties.city].filter(Boolean).join(", ")),
        country: clean(comp.properties.country),
        source: "hubspot",
        linkedin: clean(comp.properties.linkedin_company_page),
      },
    });
  }
  console.log(
    `prepared ${rows.length} rows (${contacts.length} contacts, ${companies.length} companies, ${skippedNoAccount} contacts without any account name)`,
  );

  if (dry) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const norms = [...new Set(rows.map((r) => norm(r.account.name)))];
    const existing = await sql<{ n: string }[]>`
      select count(distinct norm_name)::text n from public.accounts
      where norm_name = any(${norms}) and deleted_at is null`;
    console.log(
      `DRY: ~${existing[0].n} account names already exist; ~${norms.length - Number(existing[0].n)} would be created`,
    );
    await sql.end();
    return;
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  // Credentials come from .env.local (gitignored) — never hardcode them.
  const email = process.env.E2E_LOGIN_EMAIL;
  const password = process.env.E2E_LOGIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Set E2E_LOGIN_EMAIL + E2E_LOGIN_PASSWORD in .env.local");
  }
  const { error: authErr } = await sb.auth.signInWithPassword({ email, password });
  if (authErr) throw new Error(`Supabase sign-in failed: ${authErr.message}`);

  const { data: batch, error: bErr } = await sb
    .from("import_batches")
    .insert({
      created_by: (await sb.auth.getUser()).data.user!.id,
      filename: `HubSpot export ${new Date().toISOString().slice(0, 10)}`,
      source: "hubspot",
      status: "running",
      mapping: { note: "API import — see scripts/hubspot-import.mts" },
      total_rows: rows.length,
    })
    .select("id")
    .single();
  if (bErr) throw new Error(bErr.message);

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const r = await processChunk(sb, {
      batchId: batch.id,
      userId: rayan.id,
      ownerId: rayan.id,
      defaultSource: "hubspot",
      rows: chunk,
    });
    console.log(
      `chunk ${i / CHUNK + 1}/${Math.ceil(rows.length / CHUNK)}: +${r.accountsCreated} accounts, +${r.contactsCreated} contacts, ${r.errors.length} errors`,
    );
  }
  const stats = await finalizeBatch(sb, batch.id);
  console.log("DONE:", JSON.stringify(stats, null, 0).slice(0, 400));

  // Stamp hubspot ids for idempotent future syncs (service-role via pg).
  console.log("stamping external_ids.hubspot_id…");
  let stampedAcc = 0;
  for (const comp of companies) {
    const name = clean(comp.properties.name);
    if (!name) continue;
    const r = await sql`
      update public.accounts
         set external_ids = external_ids || jsonb_build_object('hubspot_id', ${comp.id}::text)
       where norm_name = regexp_replace(lower(${name}), '[^a-z0-9]', '', 'g')
         and deleted_at is null and not (external_ids ? 'hubspot_id')`;
    stampedAcc += r.count;
  }
  let stampedCt = 0;
  for (const ct of contacts) {
    const email = clean(ct.properties.email)?.toLowerCase();
    if (!email) continue;
    const r = await sql`
      update public.contacts
         set external_ids = external_ids || jsonb_build_object('hubspot_id', ${ct.id}::text)
       where lower(email) = ${email} and deleted_at is null and not (external_ids ? 'hubspot_id')`;
    stampedCt += r.count;
  }
  console.log(`stamped hubspot_id on ${stampedAcc} accounts, ${stampedCt} contacts`);

  await sql`update public.import_batches set created_by = ${rayan.id}::uuid where id = ${batch.id}::uuid`;
  console.log("batch reassigned to Rayan");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
