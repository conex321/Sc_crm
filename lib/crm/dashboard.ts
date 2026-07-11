import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/lib/auth/session";

// All queries run on the RLS-enforced Supabase client: reps automatically see
// only their own activities/leads (migration 0008); admins see everything.
// Accounts/opportunities RLS is open to all authenticated users, so "mine"
// scoping for reps is applied explicitly via owner filters.

export type FollowupLead = {
  id: string;
  email: string;
  full_name: string | null;
  school_name: string | null;
  account_id: string;
  account_name: string;
  last_status_change_at: string | null;
  last_touch_at: string | null;
};

export type DueTask = {
  activity_id: string;
  title: string;
  due_at: string | null;
  account_id: string | null;
};

export type StageSlice = {
  pipeline: string;
  stage: string;
  position: number;
  probability: number;
  count: number;
  total: number;
  weighted: number;
};

export type RepActivityRow = {
  userId: string;
  name: string;
  calls: number;
  emails: number;
  notes: number;
  total: number;
};

export type CustomerBook = {
  active: number;
  inactive: number;
  prospect: number;
  invoiced: number;
  paid: number;
  outstanding: number;
};

export type DashboardData = {
  // "My day"
  followupQueue: FollowupLead[];
  followupTotal: number;
  openLeads: number;
  engagedLast7: number;
  callsLast7: number;
  callsPrior7: number;
  emailsLast7: number;
  dueTasks: DueTask[];
  overdueTasks: number;
  unmatchedCount: number;
  gmailConnected: boolean;
  // Pipeline (rep: own opps; admin: all)
  pipeline: StageSlice[];
  pipelineTotal: number;
  pipelineWeighted: number;
  // Admin-only extras (null for reps)
  customerBook: CustomerBook | null;
  repActivity: RepActivityRow[] | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getDashboardData(user: SessionUser): Promise<DashboardData> {
  const sb = await getSupabaseServerClient();
  const isAdmin = user.role === "admin";
  const now = Date.now();
  const last7 = new Date(now - 7 * DAY_MS).toISOString();
  const prior7 = new Date(now - 14 * DAY_MS).toISOString();
  const staleCutoff = last7;
  const nowIso = new Date(now).toISOString();

  // Follow-up queue: open leads whose account has had no call/email in 7+
  // days (or ever). RLS on the underlying tables already scopes reps.
  let followupQ = sb
    .from("followup_leads")
    .select(
      "id, email, full_name, school_name, account_id, account_name, last_status_change_at, last_touch_at",
      { count: "exact" },
    )
    .or(`last_touch_at.is.null,last_touch_at.lt.${staleCutoff}`)
    .order("last_status_change_at", { ascending: false, nullsFirst: false })
    .order("last_touch_at", { ascending: true, nullsFirst: false })
    .limit(8);
  if (!isAdmin) {
    followupQ = followupQ.or(`assigned_user_id.eq.${user.id},owner_user_id.eq.${user.id}`);
  }

  const callsBase = () => {
    let q = sb
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("channel", "call");
    if (!isAdmin) q = q.eq("user_id", user.id);
    return q;
  };

  let emailsQ = sb
    .from("activities")
    .select("id", { count: "exact", head: true })
    .in("channel", ["email_inbound", "email_outbound", "mailshake_event"])
    .gte("occurred_at", last7);
  if (!isAdmin) emailsQ = emailsQ.eq("user_id", user.id);

  const [
    followupRes,
    openLeadsRes,
    engagedRes,
    callsLast7Res,
    callsPrior7Res,
    emailsRes,
    dueTasksRes,
    overdueRes,
    unmatchedRes,
    gmailRes,
    oppsRes,
  ] = await Promise.all([
    followupQ,
    sb.from("mailshake_leads").select("id", { count: "exact", head: true }).eq("status", "open"),
    sb
      .from("mailshake_leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .gte("last_status_change_at", last7),
    callsBase().gte("occurred_at", last7),
    callsBase().gte("occurred_at", prior7).lt("occurred_at", last7),
    emailsQ,
    sb
      .from("tasks")
      .select("activity_id, title, due_at, activity:activity_id(account_id)")
      .eq("assigned_user_id", user.id)
      .is("completed_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(8),
    sb
      .from("tasks")
      .select("activity_id", { count: "exact", head: true })
      .eq("assigned_user_id", user.id)
      .is("completed_at", null)
      .lt("due_at", nowIso),
    sb
      .from("activities")
      .select("id", { count: "exact", head: true })
      .is("account_id", null)
      .in("channel", ["call", "email_inbound", "email_outbound", "mailshake_event", "whatsapp"]),
    sb
      .from("integration_credentials")
      .select("provider")
      .eq("user_id", user.id)
      .eq("provider", "google_gmail"),
    (() => {
      let q = sb
        .from("opportunities")
        .select("amount, stage:stage_id(name, position, probability), pipeline:pipeline_id(name)")
        .eq("status", "open")
        .is("deleted_at", null);
      if (!isAdmin) q = q.eq("owner_user_id", user.id);
      return q;
    })(),
  ]);

  // Pipeline grouping (open opps only; tiny row counts, aggregate in JS)
  type OppRow = {
    amount: number | string | null;
    stage: { name: string; position: number; probability: number } | null;
    pipeline: { name: string } | null;
  };
  const slices = new Map<string, StageSlice>();
  for (const raw of (oppsRes.data ?? []) as unknown as OppRow[]) {
    const stage = raw.stage;
    const pipeline = raw.pipeline;
    if (!stage || !pipeline) continue;
    const key = `${pipeline.name}·${stage.name}`;
    const amount = Number(raw.amount ?? 0);
    const s =
      slices.get(key) ??
      ({
        pipeline: pipeline.name,
        stage: stage.name,
        position: stage.position,
        probability: stage.probability,
        count: 0,
        total: 0,
        weighted: 0,
      } satisfies StageSlice);
    s.count += 1;
    s.total += amount;
    s.weighted += (amount * (stage.probability ?? 0)) / 100;
    slices.set(key, s);
  }
  const pipeline = [...slices.values()].sort(
    (a, b) => a.pipeline.localeCompare(b.pipeline) || a.position - b.position,
  );
  const pipelineTotal = pipeline.reduce((s, x) => s + x.total, 0);
  const pipelineWeighted = pipeline.reduce((s, x) => s + x.weighted, 0);

  // Admin extras
  let customerBook: CustomerBook | null = null;
  let repActivity: RepActivityRow[] | null = null;
  if (isAdmin) {
    const [bookRes, repsRes, weekActsRes] = await Promise.all([
      sb
        .from("accounts")
        .select("customer_status, billing_summary")
        .not("customer_status", "is", null)
        .is("deleted_at", null),
      sb.from("users").select("id, full_name").eq("is_active", true),
      sb
        .from("activities")
        .select("user_id, channel")
        .gte("occurred_at", last7)
        .not("user_id", "is", null),
    ]);

    const book: CustomerBook = {
      active: 0,
      inactive: 0,
      prospect: 0,
      invoiced: 0,
      paid: 0,
      outstanding: 0,
    };
    for (const row of bookRes.data ?? []) {
      const st = row.customer_status as "active" | "inactive" | "prospect" | null;
      if (st) book[st] += 1;
      const b = row.billing_summary as {
        invoiced?: number;
        paid?: number;
        outstanding?: number;
      } | null;
      if (b) {
        book.invoiced += b.invoiced ?? 0;
        book.paid += b.paid ?? 0;
        book.outstanding += b.outstanding ?? 0;
      }
    }
    customerBook = book;

    const byUser = new Map<
      string,
      { calls: number; emails: number; notes: number; total: number }
    >();
    for (const a of weekActsRes.data ?? []) {
      if (!a.user_id) continue;
      const agg = byUser.get(a.user_id) ?? { calls: 0, emails: 0, notes: 0, total: 0 };
      agg.total += 1;
      if (a.channel === "call") agg.calls += 1;
      else if (
        a.channel === "email_inbound" ||
        a.channel === "email_outbound" ||
        a.channel === "mailshake_event"
      )
        agg.emails += 1;
      else if (a.channel === "note" || a.channel === "task") agg.notes += 1;
      byUser.set(a.user_id, agg);
    }
    repActivity = (repsRes.data ?? [])
      .map((u) => ({
        userId: u.id,
        name: u.full_name,
        ...(byUser.get(u.id) ?? { calls: 0, emails: 0, notes: 0, total: 0 }),
      }))
      .sort((a, b) => b.total - a.total);
  }

  type TaskRow = {
    activity_id: string;
    title: string;
    due_at: string | null;
    activity: { account_id: string | null } | null;
  };

  return {
    followupQueue: (followupRes.data ?? []) as FollowupLead[],
    followupTotal: followupRes.count ?? 0,
    openLeads: openLeadsRes.count ?? 0,
    engagedLast7: engagedRes.count ?? 0,
    callsLast7: callsLast7Res.count ?? 0,
    callsPrior7: callsPrior7Res.count ?? 0,
    emailsLast7: emailsRes.count ?? 0,
    dueTasks: ((dueTasksRes.data ?? []) as unknown as TaskRow[]).map((t) => ({
      activity_id: t.activity_id,
      title: t.title,
      due_at: t.due_at,
      account_id: t.activity?.account_id ?? null,
    })),
    overdueTasks: overdueRes.count ?? 0,
    unmatchedCount: unmatchedRes.count ?? 0,
    gmailConnected: (gmailRes.data ?? []).length > 0,
    pipeline,
    pipelineTotal,
    pipelineWeighted,
    customerBook,
    repActivity,
  };
}

// Shared house formatter lives in lib/format.ts; re-exported so existing
// imports (dashboard/page.tsx) keep working.
export { fmtCad } from "@/lib/format";
