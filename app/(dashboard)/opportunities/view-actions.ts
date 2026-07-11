"use server";

// Server actions for the list/forecast deal views (02-02). Deliberately a
// separate file from actions.ts — plan 03 owns edits to the other action files.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireRole, requireUser } from "@/lib/auth/session";

// Bulk actions operate on current-page selections (≤50 ids). Hard guard at
// 100 — .in() lists beyond that are a known PostgREST failure mode.
const idsSchema = z.array(z.string().uuid()).min(1).max(100);

const bulkPatchSchema = z.object({
  // undefined = keep current (only-changed-fields-apply); null = clear.
  ownerUserId: z.string().uuid().nullable().optional(),
  label: z
    .enum(["red", "yellow", "blue", "green", "purple", "gray"])
    .nullable()
    .optional(),
  stageId: z.string().uuid().optional(),
});

export async function bulkUpdateOpportunities(
  ids: string[],
  patch: { ownerUserId?: string | null; label?: string | null; stageId?: string },
): Promise<{ updated: number }> {
  const user = await requireUser();
  const parsedIds = idsSchema.parse(ids);
  const parsed = bulkPatchSchema.parse(patch);

  const sb = await getSupabaseServerClient();
  const update: Record<string, unknown> = { updated_by: user.id };
  if (parsed.ownerUserId !== undefined) update.owner_user_id = parsed.ownerUserId;
  if (parsed.label !== undefined) update.label = parsed.label;

  if (parsed.stageId !== undefined) {
    // stageStatusPatch semantics for bulk: targets are restricted to OPEN
    // stages server-side — won/lost transitions must go through the reason
    // dialog (they need per-deal reasons + timestamps). Moving any deal to an
    // open stage derives status "open" with cleared timestamps.
    const { data: stage, error: stageError } = await sb
      .from("pipeline_stages")
      .select("id, is_won, is_lost")
      .eq("id", parsed.stageId)
      .single();
    if (stageError) throw new Error(stageError.message);
    if (stage.is_won || stage.is_lost) {
      throw new Error(
        "Won/lost stages can't be bulk targets — close deals through the reason dialog.",
      );
    }
    update.stage_id = parsed.stageId;
    update.status = "open";
    update.won_at = null;
    update.lost_at = null;
  }

  if (Object.keys(update).length === 1) {
    throw new Error("Pick at least one change.");
  }

  const { data, error } = await sb
    .from("opportunities")
    .update(update)
    .in("id", parsedIds)
    .select("id");
  if (error) throw new Error(error.message);
  // RLS may filter some rows (rep editing others' deals) — only 0 is an error.
  if (!data || data.length === 0) {
    throw new Error("No deals were updated — you may not have permission.");
  }
  revalidatePath("/opportunities");
  return { updated: data.length };
}

export async function bulkSoftDeleteOpportunities(
  ids: string[],
): Promise<{ deleted: number }> {
  // Reps cannot soft-delete under RLS — admin-only, enforced server-side too.
  const user = await requireRole(["admin"]);
  const parsedIds = idsSchema.parse(ids);

  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("opportunities")
    .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
    .in("id", parsedIds)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("No deals were deleted — you may not have permission.");
  }
  revalidatePath("/opportunities");
  return { deleted: data.length };
}

const expectedCloseSchema = z.object({
  opportunityId: z.string().uuid(),
  isoDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (yyyy-MM-dd)"),
});

export async function updateExpectedCloseDate(
  opportunityId: string,
  isoDate: string,
): Promise<void> {
  const user = await requireUser();
  const parsed = expectedCloseSchema.parse({ opportunityId, isoDate });

  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("opportunities")
    .update({ expected_close_date: parsed.isoDate, updated_by: user.id })
    .eq("id", parsed.opportunityId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Opportunity not found or you don't have permission to edit it.");
  }
  revalidatePath("/opportunities");
}
