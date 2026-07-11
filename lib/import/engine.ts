// D-044: the import engine — processes one chunk of mapped rows into
// accounts + contacts with dedupe, and records per-row lineage in
// import_batch_rows (created vs matched) so batches can be reverted safely.
//
// Deliberately NOT "server-only": the wizard's server actions call it with the
// RLS-enforced Supabase client, while the Google-Sheet / HubSpot scripts call
// it with a service-role Supabase client. All authorization therefore lives
// with the caller.
//
// Dedupe rules (same conventions as auto-pipeline.ts / the QBO importer):
//   account: accounts.norm_name (indexed generated column) — match = enrich
//            nothing, just link; miss = create owned by `ownerId`.
//   contact: (account_id, lower(email)) first, then (account_id, lower(full
//            name)); match = fill only blank fields; miss = create.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MappedRow } from "./columns";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// PostgREST .in() filters travel in the URL — batch large value lists so the
// request line stays well under URL-length limits.
const IN_BATCH = 100;
async function selectIn<T>(
  fetchPage: (slice: string[]) => Promise<T[]>,
  values: string[],
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += IN_BATCH) {
    out.push(...(await fetchPage(values.slice(i, i + IN_BATCH))));
  }
  return out;
}

export type ChunkResult = {
  processed: number;
  alreadyProcessed: number;
  accountsCreated: number;
  accountsMatched: number;
  contactsCreated: number;
  contactsUpdated: number;
  contactsMatched: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

export type ChunkOptions = {
  batchId: string;
  /** users.id recorded as created_by/updated_by on new rows. */
  userId: string;
  /** owner_user_id for created accounts; defaults to userId. */
  ownerId?: string;
  /** accounts.source when a row doesn't map one. */
  defaultSource: string;
  rows: MappedRow[];
};

function deriveNames(c: NonNullable<MappedRow["contact"]>): {
  first: string;
  last: string;
} {
  let first = (c.firstName ?? "").trim();
  let last = (c.lastName ?? "").trim();
  if (!first && !last && c.email) {
    // jane.smith@x.com -> Jane / Smith ; info@x.com -> Info / ""
    const local = c.email.split("@")[0] ?? "";
    const parts = local.split(/[._-]+/).filter(Boolean);
    const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
    first = cap(parts[0] ?? "");
    last = cap(parts.slice(1).join(" "));
  }
  return { first: first || "(unknown)", last };
}

export async function processChunk(
  sb: SupabaseClient,
  opts: ChunkOptions,
): Promise<ChunkResult> {
  const res: ChunkResult = {
    processed: 0,
    alreadyProcessed: 0,
    accountsCreated: 0,
    accountsMatched: 0,
    contactsCreated: 0,
    contactsUpdated: 0,
    contactsMatched: 0,
    skipped: 0,
    errors: [],
  };
  if (opts.rows.length === 0) return res;
  const ownerId = opts.ownerId ?? opts.userId;

  // 1. Idempotency: drop rows this batch has already processed (client retry).
  const { data: doneRows, error: doneErr } = await sb
    .from("import_batch_rows")
    .select("row_index")
    .eq("batch_id", opts.batchId)
    .in("row_index", opts.rows.map((r) => r.rowIndex));
  if (doneErr) throw new Error(doneErr.message);
  const done = new Set((doneRows ?? []).map((r) => r.row_index as number));
  const rows = opts.rows.filter((r) => !done.has(r.rowIndex));
  res.alreadyProcessed = opts.rows.length - rows.length;
  if (rows.length === 0) return res;

  // 2. Account dedupe: indexed lookups for the chunk's normalized names.
  const norms = [...new Set(rows.map((r) => norm(r.account.name)).filter(Boolean))];
  const existingAccounts = await selectIn<{ id: string; norm_name: string | null }>(
    async (slice) => {
      const { data, error } = await sb
        .from("accounts")
        .select("id, norm_name")
        .in("norm_name", slice)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    norms,
  );
  const accountByNorm = new Map<string, { id: string; created: boolean }>();
  for (const a of existingAccounts ?? []) {
    if (a.norm_name && !accountByNorm.has(a.norm_name)) {
      accountByNorm.set(a.norm_name, { id: a.id, created: false });
    }
  }

  // 3. Create missing accounts (deduped within the chunk).
  const toCreate = new Map<string, MappedRow["account"]>();
  for (const r of rows) {
    const n = norm(r.account.name);
    if (n && !accountByNorm.has(n) && !toCreate.has(n)) toCreate.set(n, r.account);
  }
  if (toCreate.size > 0) {
    const values = [...toCreate.values()].map((a) => ({
      name: a.name,
      type: a.type ?? "school",
      website: a.website ?? null,
      phone: a.phone ?? null,
      address: a.address ?? null,
      country: a.country ?? null,
      source: a.source ?? opts.defaultSource,
      email: a.email ?? null,
      external_ids: a.linkedin ? { linkedin: a.linkedin } : {},
      owner_user_id: ownerId,
      created_by: opts.userId,
      updated_by: opts.userId,
    }));
    const { data: created, error: insErr } = await sb
      .from("accounts")
      .insert(values)
      .select("id, norm_name");
    if (insErr) throw new Error(insErr.message);
    for (const a of created ?? []) {
      if (a.norm_name) accountByNorm.set(a.norm_name, { id: a.id, created: true });
    }
  }

  // 4. Contact dedupe within the involved accounts.
  const accountIds = [...new Set([...accountByNorm.values()].map((a) => a.id))];
  type ContactRow = {
    id: string;
    account_id: string;
    email: string | null;
    first_name: string;
    last_name: string;
    role: string | null;
    phone: string | null;
    whatsapp_phone: string | null;
    external_ids: Record<string, unknown> | null;
  };
  const existingContacts = await selectIn<ContactRow>(async (slice) => {
    const { data, error } = await sb
      .from("contacts")
      .select("id, account_id, email, first_name, last_name, role, phone, whatsapp_phone, external_ids")
      .in("account_id", slice)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return (data ?? []) as ContactRow[];
  }, accountIds);
  const contactByEmail = new Map<string, ContactRow>();
  const contactByName = new Map<string, ContactRow>();
  for (const ct of (existingContacts ?? []) as ContactRow[]) {
    if (ct.email) contactByEmail.set(`${ct.account_id}:${ct.email.toLowerCase()}`, ct);
    const fn = `${ct.first_name} ${ct.last_name}`.trim().toLowerCase();
    if (fn) contactByName.set(`${ct.account_id}:${fn}`, ct);
  }

  // 5. Walk rows: resolve lineage, create/update contacts.
  type Lineage = {
    batch_id: string;
    row_index: number;
    account_id: string | null;
    contact_id: string | null;
    account_action: string | null;
    contact_action: string | null;
    error: string | null;
    raw: MappedRow;
  };
  const lineage: Lineage[] = [];
  const accountActionEmitted = new Set<string>(); // count each account once per chunk

  for (const r of rows) {
    try {
      const n = norm(r.account.name);
      const acc = n ? accountByNorm.get(n) : undefined;
      if (!acc) {
        res.skipped++;
        lineage.push({
          batch_id: opts.batchId,
          row_index: r.rowIndex,
          account_id: null,
          contact_id: null,
          account_action: null,
          contact_action: null,
          error: "no usable account name",
          raw: r,
        });
        continue;
      }
      let accountAction: string;
      if (accountActionEmitted.has(acc.id)) {
        accountAction = acc.created ? "created" : "matched"; // repeat rows share the action label
      } else {
        accountAction = acc.created ? "created" : "matched";
        accountActionEmitted.add(acc.id);
        if (acc.created) res.accountsCreated++;
        else res.accountsMatched++;
      }

      let contactId: string | null = null;
      let contactAction: string | null = null;
      const c = r.contact;
      if (c) {
        const emailKey = c.email ? `${acc.id}:${c.email}` : null;
        const { first, last } = deriveNames(c);
        const nameKey = `${acc.id}:${`${first} ${last}`.trim().toLowerCase()}`;
        const existing =
          (emailKey ? contactByEmail.get(emailKey) : undefined) ??
          contactByName.get(nameKey);

        if (existing) {
          // Fill only blank fields; never overwrite curated data.
          const patch: Record<string, unknown> = {};
          if (!existing.role && c.role) patch.role = c.role;
          if (!existing.phone && c.phone) patch.phone = c.phone;
          if (!existing.whatsapp_phone && c.whatsappPhone) patch.whatsapp_phone = c.whatsappPhone;
          if (!existing.email && c.email) patch.email = c.email;
          if (c.linkedin && !(existing.external_ids ?? ({} as Record<string, unknown>)).linkedin) {
            patch.external_ids = { ...(existing.external_ids ?? {}), linkedin: c.linkedin };
          }
          if (Object.keys(patch).length > 0) {
            patch.updated_by = opts.userId;
            const { error: upErr } = await sb
              .from("contacts")
              .update(patch)
              .eq("id", existing.id);
            if (upErr) throw new Error(upErr.message);
            contactAction = "updated";
            res.contactsUpdated++;
          } else {
            contactAction = "matched";
            res.contactsMatched++;
          }
          contactId = existing.id;
        } else {
          const { data: createdC, error: insCErr } = await sb
            .from("contacts")
            .insert({
              account_id: acc.id,
              first_name: first,
              last_name: last,
              role: c.role ?? null,
              email: c.email ?? null,
              phone: c.phone ?? null,
              whatsapp_phone: c.whatsappPhone ?? null,
              external_ids: c.linkedin ? { linkedin: c.linkedin } : {},
              created_by: opts.userId,
              updated_by: opts.userId,
            })
            .select("id")
            .single();
          if (insCErr) throw new Error(insCErr.message);
          contactId = createdC.id;
          contactAction = "created";
          res.contactsCreated++;
          // register for in-chunk dedupe of later rows
          const reg: ContactRow = {
            id: createdC.id,
            account_id: acc.id,
            email: c.email ?? null,
            first_name: first,
            last_name: last,
            role: c.role ?? null,
            phone: c.phone ?? null,
            whatsapp_phone: c.whatsappPhone ?? null,
            external_ids: c.linkedin ? { linkedin: c.linkedin } : {},
          };
          if (emailKey) contactByEmail.set(emailKey, reg);
          contactByName.set(nameKey, reg);
        }
      } else {
        contactAction = "skipped";
      }

      lineage.push({
        batch_id: opts.batchId,
        row_index: r.rowIndex,
        account_id: acc.id,
        contact_id: contactId,
        account_action: accountAction,
        contact_action: contactAction,
        error: null,
        raw: r,
      });
      res.processed++;
    } catch (err) {
      res.errors.push({ row: r.rowIndex, message: (err as Error).message });
      lineage.push({
        batch_id: opts.batchId,
        row_index: r.rowIndex,
        account_id: null,
        contact_id: null,
        account_action: null,
        contact_action: null,
        error: (err as Error).message.slice(0, 300),
        raw: r,
      });
    }
  }

  // 6. Lineage (idempotency backstop: unique(batch_id,row_index) — a racing
  // retry loses cleanly). upsert ignoreDuplicates keeps retries error-free.
  if (lineage.length > 0) {
    const { error: linErr } = await sb
      .from("import_batch_rows")
      .upsert(lineage, { onConflict: "batch_id,row_index", ignoreDuplicates: true });
    if (linErr) throw new Error(linErr.message);
  }

  return res;
}

/** Recompute batch stats from lineage (retry-safe) and mark completed. */
export async function finalizeBatch(
  sb: SupabaseClient,
  batchId: string,
): Promise<{
  totalRows: number;
  accountsCreated: number;
  accountsMatched: number;
  contactsCreated: number;
  contactsUpdated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}> {
  // Paginate — PostgREST caps any single response at ~1000 rows, which would
  // silently truncate stats for large batches.
  type LineageRow = {
    row_index: number;
    account_id: string | null;
    account_action: string | null;
    contact_action: string | null;
    error: string | null;
  };
  const rows: LineageRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("import_batch_rows")
      .select("row_index, account_id, account_action, contact_action, error")
      .eq("batch_id", batchId)
      .order("row_index", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as LineageRow[]));
    if (!data || data.length < PAGE) break;
  }

  const createdAccounts = new Set<string>();
  const matchedAccounts = new Set<string>();
  let contactsCreated = 0;
  let contactsUpdated = 0;
  let skipped = 0;
  const errors: { row: number; message: string }[] = [];
  for (const r of rows) {
    if (r.account_action === "created" && r.account_id) createdAccounts.add(r.account_id);
    if (r.account_action === "matched" && r.account_id) matchedAccounts.add(r.account_id);
    if (r.contact_action === "created") contactsCreated++;
    if (r.contact_action === "updated") contactsUpdated++;
    if (!r.account_action && !r.error) skipped++;
    if (r.error) errors.push({ row: r.row_index, message: r.error });
  }
  const stats = {
    totalRows: rows.length,
    accountsCreated: createdAccounts.size,
    accountsMatched: matchedAccounts.size,
    contactsCreated,
    contactsUpdated,
    skipped,
    errors,
  };

  const { error: upErr } = await sb
    .from("import_batches")
    .update({
      status: "completed",
      total_rows: stats.totalRows,
      accounts_created: stats.accountsCreated,
      accounts_matched: stats.accountsMatched,
      contacts_created: stats.contactsCreated,
      contacts_updated: stats.contactsUpdated,
      skipped_rows: stats.skipped,
      error_rows: errors.slice(0, 100),
      completed_at: new Date().toISOString(),
    })
    .eq("id", batchId);
  if (upErr) throw new Error(upErr.message);
  return stats;
}
