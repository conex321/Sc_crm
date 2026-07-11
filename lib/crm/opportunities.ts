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
  label: string | null;
  won_at: string | null;
  lost_at: string | null;
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
  "id, account_id, pipeline_id, stage_id, name, amount, currency, expected_close_date, owner_user_id, primary_contact_id, status, won_reason, lost_reason, label, won_at, lost_at, created_at, updated_at, deleted_at, account:account_id(id, name), pipeline:pipeline_id(id, name, service_line), stage:stage_id(id, name, position), owner:owner_user_id(id, full_name)";

export type NextTask = {
  opportunity_id: string;
  activity_id: string;
  title: string;
  due_at: string | null;
};

export type BoardOpportunity = OpportunityWithRefs & {
  next_task: { activity_id: string; title: string; due_at: string | null } | null;
  is_rotten: boolean;
};

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

/**
 * URL-driven filters shared by all three deal views (02-02). Applied
 * server-side so kanban column counts/sums stay truthful under filters.
 */
export type DealFilters = {
  ownerId?: string | null;
  label?: string | null;
  status?: "open" | "won" | "lost";
};

export async function listOpportunitiesByPipeline(
  pipelineId: string,
  filters: DealFilters = {},
): Promise<BoardOpportunity[]> {
  const sb = await getSupabaseServerClient();
  const status = filters.status ?? "open";

  const buildQuery = () => {
    let q = sb
      .from("opportunities")
      .select(SELECT)
      .eq("pipeline_id", pipelineId)
      .eq("status", status)
      .is("deleted_at", null);
    if (filters.ownerId) q = q.eq("owner_user_id", filters.ownerId);
    if (filters.label) q = q.eq("label", filters.label);
    return q.limit(500);
  };

  if (status !== "open") {
    // Closed-deals mode (won/lost chips): the next-task view only contains
    // open deals, so skip the merge entirely — closed deals have no next
    // activity and never rot.
    const { data, error } = await buildQuery();
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as OpportunityWithRefs[]).map((o) => ({
      ...o,
      next_task: null,
      is_rotten: false,
    }));
  }

  // Next-task fetch filters the security_invoker view by pipeline_id only —
  // NO .in() ID lists (breaks past ~100 ids). ≤500 open deals keeps the view
  // rows bounded well under the 1,000-row cap.
  // NOTE: reps may not see other reps' tasks through the view (activities RLS
  // applies as the querying rep) — those chips render as the "none" warning
  // state. Expected per D-038, not a bug.
  const [oppsRes, nextTasksRes, stages] = await Promise.all([
    buildQuery(),
    sb
      .from("opportunity_next_task")
      .select("opportunity_id, activity_id, title, due_at")
      .eq("pipeline_id", pipelineId)
      .limit(1000),
    listStagesForPipeline(pipelineId),
  ]);
  if (oppsRes.error) throw new Error(oppsRes.error.message);
  if (nextTasksRes.error) throw new Error(nextTasksRes.error.message);

  const opps = (oppsRes.data ?? []) as unknown as OpportunityWithRefs[];
  const nextTasks = (nextTasksRes.data ?? []) as unknown as NextTask[];

  const nextTaskByOpp = new Map(
    nextTasks.map((t) => [
      t.opportunity_id,
      { activity_id: t.activity_id, title: t.title, due_at: t.due_at },
    ]),
  );
  const rotDaysByStage = new Map<string, number | null>(
    stages.map((s: { id: string; rot_days: number | null }) => [s.id, s.rot_days]),
  );
  const now = Date.now();

  return opps.map((o) => {
    const rotDays = rotDaysByStage.get(o.stage_id);
    const is_rotten =
      o.status === "open" &&
      rotDays != null &&
      now - Date.parse(o.updated_at) > rotDays * 86_400_000;
    return { ...o, next_task: nextTaskByOpp.get(o.id) ?? null, is_rotten };
  });
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
    .select("id, pipeline_id, name, position, probability, is_won, is_lost, rot_days")
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
