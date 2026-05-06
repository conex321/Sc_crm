import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type OpportunityRow = {
  id: string;
  account_id: string;
  pipeline_id: string;
  stage_id: string;
  name: string;
  amount: string | null;
  currency: string;
  expected_close_date: string | null;
  owner_user_id: string | null;
  primary_contact_id: string | null;
  status: "open" | "won" | "lost";
  won_reason: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type OpportunityWithRefs = OpportunityRow & {
  account: { id: string; name: string } | null;
  pipeline: { id: string; name: string; service_line: string } | null;
  stage: { id: string; name: string; position: number } | null;
  owner: { id: string; full_name: string } | null;
};

const SELECT =
  "id, account_id, pipeline_id, stage_id, name, amount, currency, expected_close_date, owner_user_id, primary_contact_id, status, won_reason, lost_reason, created_at, updated_at, deleted_at, account:account_id(id, name), pipeline:pipeline_id(id, name, service_line), stage:stage_id(id, name, position), owner:owner_user_id(id, full_name)";

export async function listOpportunitiesForAccount(
  accountId: string,
): Promise<OpportunityWithRefs[]> {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("opportunities")
    .select(SELECT)
    .eq("account_id", accountId)
    .is("deleted_at", null)
    .order("status", { ascending: true })
    .order("expected_close_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OpportunityWithRefs[];
}

export async function listOpportunitiesByPipeline(
  pipelineId: string,
): Promise<OpportunityWithRefs[]> {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("opportunities")
    .select(SELECT)
    .eq("pipeline_id", pipelineId)
    .eq("status", "open")
    .is("deleted_at", null)
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OpportunityWithRefs[];
}

export async function getOpportunity(id: string): Promise<OpportunityWithRefs | null> {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("opportunities")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as OpportunityWithRefs) ?? null;
}

export async function listPipelines() {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("pipelines")
    .select("id, name, slug, service_line, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listStagesForPipeline(pipelineId: string) {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("pipeline_stages")
    .select("id, pipeline_id, name, position, probability, is_won, is_lost")
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
