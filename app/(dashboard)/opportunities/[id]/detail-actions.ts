"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

// Inline-edit whitelist for the deal-detail left panel (02-03, DEAL-04).
// Stage/status changes are deliberately NOT allowed here — they go through
// moveOpportunityStage / markOpportunityWonLost so stageStatusPatch stays the
// single source of truth for status + won_at/lost_at stamping.
const inlinePatchSchema = z.object({
  // Fixed six-key palette (lib/crm/labels.ts); null clears the label.
  label: z.enum(["red", "yellow", "blue", "green", "purple", "gray"]).nullable().optional(),
  // yyyy-MM-dd from <input type="date">; null clears the date.
  expectedCloseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
    .nullable()
    .optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  // Editable on closed deals per DEAL-04 ("stored and editable").
  wonReason: z.string().trim().max(500).nullable().optional(),
  lostReason: z.string().trim().max(500).nullable().optional(),
});

export type OpportunityInlinePatch = z.infer<typeof inlinePatchSchema>;

export async function updateOpportunityInline(id: string, patch: OpportunityInlinePatch) {
  const user = await requireUser();
  const oppId = z.string().uuid().parse(id);
  const parsed = inlinePatchSchema.parse(patch);

  // Build the snake_case update from ONLY the provided keys — an absent key
  // must never wipe an existing column value.
  const update: Record<string, unknown> = { updated_by: user.id };
  if (parsed.label !== undefined) update.label = parsed.label;
  if (parsed.expectedCloseDate !== undefined) {
    update.expected_close_date = parsed.expectedCloseDate;
  }
  if (parsed.ownerUserId !== undefined) update.owner_user_id = parsed.ownerUserId;
  if (parsed.wonReason !== undefined) update.won_reason = parsed.wonReason || null;
  if (parsed.lostReason !== undefined) update.lost_reason = parsed.lostReason || null;
  if (Object.keys(update).length === 1) throw new Error("Nothing to update");

  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("opportunities")
    .update(update)
    .eq("id", oppId)
    .select("id");
  if (error) throw new Error(error.message);
  // RLS filtering to 0 rows would otherwise look like a successful save (D-043).
  if (!data || data.length === 0) {
    throw new Error("Opportunity not found or you don't have permission to edit it.");
  }

  revalidatePath(`/opportunities/${oppId}`);
  revalidatePath("/opportunities");
}
