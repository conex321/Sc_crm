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
  primaryContactId: z.string().uuid().or(z.literal("")).optional(),
  ownerUserId: z.string().uuid().or(z.literal("")).optional(),
});

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
  };
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
      primary_contact_id: parsed.primaryContactId || null,
      owner_user_id: parsed.ownerUserId || user.id,
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
  const { error } = await sb
    .from("opportunities")
    .update({
      account_id: parsed.accountId,
      pipeline_id: parsed.pipelineId,
      stage_id: parsed.stageId,
      name: parsed.name,
      amount: parsed.amount ? Number(parsed.amount) : null,
      currency: parsed.currency,
      expected_close_date: parsed.expectedCloseDate || null,
      primary_contact_id: parsed.primaryContactId || null,
      owner_user_id: parsed.ownerUserId || null,
      updated_by: user.id,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/opportunities/${id}`);
  revalidatePath("/opportunities");
  redirect(`/opportunities/${id}`);
}

export async function moveOpportunityStage(opportunityId: string, stageId: string) {
  const user = await requireUser();
  const sb = await getSupabaseServerClient();

  const { data: stage, error: stageError } = await sb
    .from("pipeline_stages")
    .select("is_won, is_lost")
    .eq("id", stageId)
    .single();
  if (stageError) throw new Error(stageError.message);

  const status = stage?.is_won ? "won" : stage?.is_lost ? "lost" : "open";

  const { error } = await sb
    .from("opportunities")
    .update({ stage_id: stageId, status, updated_by: user.id })
    .eq("id", opportunityId);
  if (error) throw new Error(error.message);
  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${opportunityId}`);
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
