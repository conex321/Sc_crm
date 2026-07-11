"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { accounts, contacts, importBatches, importBatchRows } from "@/lib/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

// Bulk delete / revert must bypass RLS (reps can't set deleted_at — the
// non-admin visibility check rejects the new row), so these actions use the
// Drizzle service-role client. The app-side ownership check below is therefore
// the ENTIRE authorization: only rows an import batch CREATED, and only for
// the batch's creator (or an admin).

async function requireOwnedBatch(batchId: string) {
  const user = await requireUser();
  z.string().uuid().parse(batchId);
  const rows = await db
    .select({ id: importBatches.id, createdBy: importBatches.createdBy, status: importBatches.status })
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);
  const batch = rows[0];
  if (!batch) throw new Error("Import batch not found.");
  if (batch.createdBy !== user.id && user.role !== "admin") {
    throw new Error("You can only manage imports you created.");
  }
  return { user, batch };
}

/** Soft-delete everything this batch CREATED (never matched rows). */
export async function revertImportBatch(batchId: string) {
  const { user, batch } = await requireOwnedBatch(batchId);
  if (batch.status === "reverted") throw new Error("Batch already reverted.");

  const created = await db
    .select({
      accountId: importBatchRows.accountId,
      contactId: importBatchRows.contactId,
      accountAction: importBatchRows.accountAction,
      contactAction: importBatchRows.contactAction,
    })
    .from(importBatchRows)
    .where(eq(importBatchRows.batchId, batchId));

  const contactIds = [
    ...new Set(
      created
        .filter((r) => r.contactAction === "created" && r.contactId)
        .map((r) => r.contactId as string),
    ),
  ];
  const accountIds = [
    ...new Set(
      created
        .filter((r) => r.accountAction === "created" && r.accountId)
        .map((r) => r.accountId as string),
    ),
  ];

  let deletedContacts = 0;
  let deletedAccounts = 0;
  if (contactIds.length > 0) {
    const r = await db
      .update(contacts)
      .set({ deletedAt: new Date(), updatedBy: user.id })
      .where(and(inArray(contacts.id, contactIds), isNull(contacts.deletedAt)))
      .returning({ id: contacts.id });
    deletedContacts = r.length;
  }
  if (accountIds.length > 0) {
    const r = await db
      .update(accounts)
      .set({ deletedAt: new Date(), updatedBy: user.id })
      .where(and(inArray(accounts.id, accountIds), isNull(accounts.deletedAt)))
      .returning({ id: accounts.id });
    deletedAccounts = r.length;
  }

  await db
    .update(importBatches)
    .set({ status: "reverted", revertedAt: new Date() })
    .where(eq(importBatches.id, batchId));

  revalidatePath("/accounts/imports");
  revalidatePath(`/accounts/imports/${batchId}`);
  revalidatePath("/accounts");
  return { deletedAccounts, deletedContacts };
}

const idsSchema = z.array(z.string().uuid()).min(1).max(2000);

/** Soft-delete selected accounts — only ones this batch CREATED. */
export async function bulkDeleteImportedAccounts(batchId: string, accountIds: string[]) {
  const { user } = await requireOwnedBatch(batchId);
  const ids = idsSchema.parse(accountIds);

  // Constrain to accounts this batch created — the authorization boundary.
  const allowed = await db
    .select({ accountId: importBatchRows.accountId })
    .from(importBatchRows)
    .where(
      and(
        eq(importBatchRows.batchId, batchId),
        eq(importBatchRows.accountAction, "created"),
        inArray(importBatchRows.accountId, ids),
      ),
    );
  const allowedIds = [...new Set(allowed.map((r) => r.accountId).filter(Boolean))] as string[];
  if (allowedIds.length === 0) return { deletedAccounts: 0, deletedContacts: 0 };

  const dc = await db
    .update(contacts)
    .set({ deletedAt: new Date(), updatedBy: user.id })
    .where(and(inArray(contacts.accountId, allowedIds), isNull(contacts.deletedAt)))
    .returning({ id: contacts.id });
  const da = await db
    .update(accounts)
    .set({ deletedAt: new Date(), updatedBy: user.id })
    .where(and(inArray(accounts.id, allowedIds), isNull(accounts.deletedAt)))
    .returning({ id: accounts.id });

  revalidatePath(`/accounts/imports/${batchId}`);
  revalidatePath("/accounts");
  return { deletedAccounts: da.length, deletedContacts: dc.length };
}

const bulkEditSchema = z.object({
  ownerUserId: z.string().uuid().nullable().optional(),
  source: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  type: z.enum(["school", "aspiring_founder", "district", "other"]).optional(),
});

/** Bulk-edit selected accounts of a batch (created OR matched — edits are
 *  rep-open anyway; the sb client keeps RLS in the loop). */
export async function bulkEditImportedAccounts(
  batchId: string,
  accountIds: string[],
  patch: z.infer<typeof bulkEditSchema>,
) {
  const user = await requireUser();
  z.string().uuid().parse(batchId);
  const ids = idsSchema.parse(accountIds);
  const p = bulkEditSchema.parse(patch);

  const update: Record<string, unknown> = { updated_by: user.id };
  if (p.ownerUserId !== undefined) update.owner_user_id = p.ownerUserId;
  if (p.source) update.source = p.source;
  if (p.country) update.country = p.country;
  if (p.type) update.type = p.type;
  if (Object.keys(update).length === 1) throw new Error("Nothing to change.");

  const sb = await getSupabaseServerClient();
  // Scope to this batch's rows (any action) — keeps the edit tied to the
  // import. Sub-batch the .in() filters: PostgREST carries them in the URL.
  const IN_BATCH = 100;
  const allowedSet = new Set<string>();
  for (let i = 0; i < ids.length; i += IN_BATCH) {
    const { data: allowed, error: aErr } = await sb
      .from("import_batch_rows")
      .select("account_id")
      .eq("batch_id", batchId)
      .in("account_id", ids.slice(i, i + IN_BATCH));
    if (aErr) throw new Error(aErr.message);
    for (const r of allowed ?? []) if (r.account_id) allowedSet.add(r.account_id);
  }
  const allowedIds = [...allowedSet];
  if (allowedIds.length === 0) return { updated: 0 };

  let updatedCount = 0;
  for (let i = 0; i < allowedIds.length; i += IN_BATCH) {
    const { data, error } = await sb
      .from("accounts")
      .update(update)
      .in("id", allowedIds.slice(i, i + IN_BATCH))
      .is("deleted_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    updatedCount += data?.length ?? 0;
  }

  revalidatePath(`/accounts/imports/${batchId}`);
  revalidatePath("/accounts");
  return { updated: updatedCount };
}
