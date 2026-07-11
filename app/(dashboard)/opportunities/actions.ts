"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

const opportunitySchema = z.object({
  accountId: z.string().uuid(),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  amount: z.string().optional(),
  currency: z.string().trim().min(3).max(3).default("USD"),
  expectedCloseDate: z.string().optional(),
  // "none"/"unassigned" are the form's sentinels for no selection (Radix
  // Select can't represent an empty-string item value).
  primaryContactId: z.string().uuid().or(z.enum(["", "none"])).optional(),
  ownerUserId: z.string().uuid().or(z.enum(["", "unassigned"])).optional(),
  // Fixed six-key palette (lib/crm/labels.ts); "none"/"" sentinel → null.
  label: z
    .enum(["red", "yellow", "blue", "green", "purple", "gray"])
    .or(z.enum(["", "none"]))
    .optional(),
});

function idOrNull(v: string | undefined): string | null {
  return v && v !== "none" && v !== "unassigned" ? v : null;
}

function fromForm(form: FormData) {
  return {
    accountId: String(form.get("accountId") ?? ""),
    pipelineId: String(form.get("pipelineId") ?? ""),
    stageId: String(form.get("stageId") ?? ""),
    name: String(form.get("name") ?? ""),
    amount: String(form.get("amount") ?? ""),
    currency: String(form.get("currency") ?? "USD"),
    expectedCloseDate: String(form.get("expectedCloseDate") ?? ""),
    primaryContactId: String(form.get("primaryContactId") ?? ""),
    ownerUserId: String(form.get("ownerUserId") ?? ""),
    // Absent key → undefined so forms that don't render a label control
    // (e.g. today's edit form) never wipe an existing label.
    label: form.get("label") == null ? undefined : String(form.get("label")),
  };
}

type Sb = Awaited<ReturnType<typeof getSupabaseServerClient>>;

// Derives status + won_at/lost_at from the target stage's is_won/is_lost flags.
// Single source of truth used by updateOpportunity, moveOpportunityStage, and
// markOpportunityWonLost — fixes the bug where updateOpportunity wrote stage_id
// without recomputing status. Timestamps are only (re)stamped when the status
// actually transitions; re-saving an already-won deal keeps its original won_at.
async function stageStatusPatch(sb: Sb, stageId: string, opportunityId: string) {
  const [stageRes, currentRes] = await Promise.all([
    sb.from("pipeline_stages").select("is_won, is_lost").eq("id", stageId).single(),
    sb
      .from("opportunities")
      .select("status, won_at, lost_at")
      .eq("id", opportunityId)
      .single(),
  ]);
  if (stageRes.error) throw new Error(stageRes.error.message);
  if (currentRes.error) throw new Error(currentRes.error.message);

  const status = stageRes.data?.is_won ? "won" : stageRes.data?.is_lost ? "lost" : "open";
  if (currentRes.data?.status === status) {
    // No transition — preserve existing timestamps untouched.
    return {
      status,
      won_at: currentRes.data.won_at as string | null,
      lost_at: currentRes.data.lost_at as string | null,
    } as const;
  }
  const now = new Date().toISOString();
  return {
    status,
    won_at: status === "won" ? now : null, // clearing on reopen keeps re-open → re-win honest
    lost_at: status === "lost" ? now : null,
  } as const;
}

export async function createOpportunity(form: FormData) {
  const user = await requireUser();
  const parsed = opportunitySchema.parse(fromForm(form));

  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("opportunities")
    .insert({
      account_id: parsed.accountId,
      pipeline_id: parsed.pipelineId,
      stage_id: parsed.stageId,
      name: parsed.name,
      amount: parsed.amount ? Number(parsed.amount) : null,
      currency: parsed.currency,
      expected_close_date: parsed.expectedCloseDate || null,
      primary_contact_id: idOrNull(parsed.primaryContactId),
      owner_user_id: idOrNull(parsed.ownerUserId) ?? user.id,
      ...(parsed.label !== undefined ? { label: idOrNull(parsed.label) } : {}),
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/opportunities");
  revalidatePath(`/accounts/${parsed.accountId}`);
  redirect(`/opportunities/${data.id}`);
}

export async function updateOpportunity(id: string, form: FormData) {
  const user = await requireUser();
  const parsed = opportunitySchema.parse(fromForm(form));
  const sb = await getSupabaseServerClient();
  // BUG FIX: previously wrote stage_id without recomputing status — editing a
  // deal into a won/lost stage left it status "open" with no timestamps.
  const patch = await stageStatusPatch(sb, parsed.stageId, id);
  const { data, error } = await sb
    .from("opportunities")
    .update({
      account_id: parsed.accountId,
      pipeline_id: parsed.pipelineId,
      stage_id: parsed.stageId,
      name: parsed.name,
      amount: parsed.amount ? Number(parsed.amount) : null,
      currency: parsed.currency,
      expected_close_date: parsed.expectedCloseDate || null,
      primary_contact_id: idOrNull(parsed.primaryContactId),
      owner_user_id: idOrNull(parsed.ownerUserId),
      ...(parsed.label !== undefined ? { label: idOrNull(parsed.label) } : {}),
      ...patch,
      updated_by: user.id,
    })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  // RLS filtering to 0 rows would otherwise look like a successful save.
  if (!data || data.length === 0) {
    throw new Error("Opportunity not found or you don't have permission to edit it.");
  }
  revalidatePath(`/opportunities/${id}`);
  revalidatePath("/opportunities");
  redirect(`/opportunities/${id}`);
}

export async function moveOpportunityStage(opportunityId: string, stageId: string) {
  const user = await requireUser();
  const sb = await getSupabaseServerClient();

  const patch = await stageStatusPatch(sb, stageId, opportunityId);

  const { data, error } = await sb
    .from("opportunities")
    .update({ stage_id: stageId, ...patch, updated_by: user.id })
    .eq("id", opportunityId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Opportunity not found or you don't have permission to move it.");
  }
  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${opportunityId}`);
}

const wonLostSchema = z.object({
  opportunityId: z.string().uuid(),
  stageId: z.string().uuid(),
  // Dialog enforces won-optional / lost-required client-side; server accepts
  // an empty string for won.
  reason: z.string().trim().max(500),
});

export async function markOpportunityWonLost(
  opportunityId: string,
  stageId: string,
  reason: string,
) {
  const user = await requireUser();
  const parsed = wonLostSchema.parse({ opportunityId, stageId, reason });
  const sb = await getSupabaseServerClient();

  const patch = await stageStatusPatch(sb, parsed.stageId, parsed.opportunityId);

  const { data, error } = await sb
    .from("opportunities")
    .update({
      stage_id: parsed.stageId,
      ...patch,
      // Write only the reason column matching the outcome.
      ...(patch.status === "won" ? { won_reason: parsed.reason || null } : {}),
      ...(patch.status === "lost" ? { lost_reason: parsed.reason } : {}),
      updated_by: user.id,
    })
    .eq("id", parsed.opportunityId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Opportunity not found or you don't have permission to close it.");
  }
  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${parsed.opportunityId}`);
}

export async function softDeleteOpportunity(id: string) {
  const user = await requireUser();
  const sb = await getSupabaseServerClient();
  const { error } = await sb
    .from("opportunities")
    .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/opportunities");
}
