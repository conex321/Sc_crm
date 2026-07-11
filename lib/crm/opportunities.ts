import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  compareDeals,
  sumByCurrency,
  type DealSort,
} from "@/lib/crm/deal-board-utils";

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

export type ListSort = DealSort | "title" | "stage" | "created" | "updated" | "account";

// Ascending-semantics comparators for the list view; "desc" is applied by the
// caller inverting argument order. Shared DealSort keys reuse compareDeals.
function listComparator(
  sort: ListSort,
): (a: BoardOpportunity, b: BoardOpportunity) => number {
  switch (sort) {
    case "next_activity":
    case "expected_close":
    case "owner":
      return compareDeals(sort);
    case "value":
      // List semantics: ascending amount (compareDeals("value") is the
      // board's fixed value-desc ordering — not reusable for asc/desc toggles).
      return (a, b) => {
        const av = a.amount != null ? Number(a.amount) : Infinity; // nulls last
        const bv = b.amount != null ? Number(b.amount) : Infinity;
        if (av === bv) return 0;
        return av - bv;
      };
    case "title":
      return (a, b) => a.name.localeCompare(b.name);
    case "stage":
      return (a, b) => {
        const ap = a.stage?.position ?? Infinity;
        const bp = b.stage?.position ?? Infinity;
        if (ap === bp) return 0;
        return ap - bp;
      };
    case "created":
      return (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at);
    case "updated":
      return (a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at);
    case "account":
      return (a, b) => {
        const an = a.account?.name;
        const bn = b.account?.name;
        if (an && bn) return an.localeCompare(bn);
        if (!an && bn) return 1; // nulls last
        if (an && !bn) return -1;
        return 0;
      };
  }
}

const LIST_PAGE_SIZE = 50;
const LIST_FETCH_CAP = 500;

/**
 * List-view loader (02-02 documented decision — do NOT "optimize" into .in()
 * traps): fetch up to 500 matching deals in ONE bounded query (same cap as the
 * board), merge next-task rows from the pipeline-filtered view (one query,
 * never per-row), sort in server JS, then slice the requested 50-row page.
 * This keeps pagination correct for EVERY sort key — including next-activity
 * and cross-table columns PostgREST cannot order by — while rendering only 50
 * rows. When more than 500 rows match, `capped` is true and the footer says so.
 */
export async function listDealsForListView(
  pipelineId: string,
  filters: DealFilters,
  sort: ListSort,
  dir: "asc" | "desc",
  page: number,
): Promise<{
  rows: BoardOpportunity[];
  total: number;
  capped: boolean;
  openSum: string;
  weightedOpenSum: string;
}> {
  const sb = await getSupabaseServerClient();
  const status = filters.status ?? "open";

  let query = sb
    .from("opportunities")
    .select(SELECT, { count: "exact" })
    .eq("pipeline_id", pipelineId)
    .eq("status", status)
    .is("deleted_at", null);
  if (filters.ownerId) query = query.eq("owner_user_id", filters.ownerId);
  if (filters.label) query = query.eq("label", filters.label);

  const [oppsRes, nextTasksRes, stages] = await Promise.all([
    query.range(0, LIST_FETCH_CAP - 1),
    status === "open"
      ? sb
          .from("opportunity_next_task")
          .select("opportunity_id, activity_id, title, due_at")
          .eq("pipeline_id", pipelineId)
          .limit(1000)
      : Promise.resolve({ data: [] as NextTask[], error: null }),
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

  const merged: BoardOpportunity[] = opps.map((o) => {
    const rotDays = rotDaysByStage.get(o.stage_id);
    const is_rotten =
      o.status === "open" &&
      rotDays != null &&
      now - Date.parse(o.updated_at) > rotDays * 86_400_000;
    return { ...o, next_task: nextTaskByOpp.get(o.id) ?? null, is_rotten };
  });

  const cmp = listComparator(sort);
  const sorted = [...merged].sort((a, b) => (dir === "desc" ? cmp(b, a) : cmp(a, b)));

  const total = oppsRes.count ?? merged.length;
  const openDeals = merged.filter((o) => o.status === "open");
  return {
    rows: sorted.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE),
    total,
    capped: total >= LIST_FETCH_CAP,
    openSum: sumByCurrency(openDeals),
    weightedOpenSum: sumByCurrency(openDeals, true, stages),
  };
}

/**
 * Won deals for the forecast view, bucketed client-side by won_at.
 * Owner/label filters apply so all three views honor the shared filter bar.
 */
export async function listWonOpportunitiesSince(
  pipelineId: string,
  sinceIso: string,
  filters: Pick<DealFilters, "ownerId" | "label"> = {},
): Promise<BoardOpportunity[]> {
  const sb = await getSupabaseServerClient();
  let query = sb
    .from("opportunities")
    .select(SELECT)
    .eq("pipeline_id", pipelineId)
    .eq("status", "won")
    .is("deleted_at", null)
    .gte("won_at", sinceIso);
  if (filters.ownerId) query = query.eq("owner_user_id", filters.ownerId);
  if (filters.label) query = query.eq("label", filters.label);
  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as OpportunityWithRefs[]).map((o) => ({
    ...o,
    next_task: null,
    is_rotten: false,
  }));
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
