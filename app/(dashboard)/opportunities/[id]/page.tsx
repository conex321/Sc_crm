import { notFound } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Pencil } from "lucide-react";
import { format, isToday, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getOpportunity, listStagesForPipeline } from "@/lib/crm/opportunities";
import { listActivitiesForOpportunity, type TimelineActivity } from "@/lib/crm/activities";
import { toggleTaskComplete } from "@/app/(dashboard)/activities/actions";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { NoteComposer } from "@/components/crm/note-composer";
import { TaskComposer } from "@/components/crm/task-composer";
import { LineItemsEditor, type LineItem } from "@/components/crm/line-items-editor";
import { SendInvoiceButton } from "@/components/crm/send-invoice-button";
import { StageStepper } from "@/components/crm/stage-stepper";
import { DealCloseButtons } from "@/components/crm/deal-close-buttons";
import { DealSummaryPanel } from "@/components/crm/deal-summary-panel";
import { requireUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type Stage = {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
  rot_days: number | null;
};

type DueState = "overdue" | "today" | "future" | "none";

const DUE_CLASS: Record<DueState, string> = {
  overdue: "text-[var(--pd-negative-strong)]",
  today: "text-[var(--pd-positive-strong)]",
  future: "text-[var(--pd-text-secondary)]",
  none: "text-[var(--pd-text-muted)]",
};

function dueState(dueAt: string | null): DueState {
  if (!dueAt) return "none";
  const d = new Date(dueAt);
  if (isToday(d)) return "today";
  return startOfDay(d) < startOfDay(new Date()) ? "overdue" : "future";
}

function WidgetRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase text-[var(--pd-text-muted)]">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

const Dash = () => <span className="text-[var(--pd-text-muted)]">—</span>;

function TaskRow({
  activity,
  opportunityId,
}: {
  activity: TimelineActivity;
  opportunityId: string;
}) {
  const done = Boolean(activity.task?.completed_at);
  const state = dueState(activity.task?.due_at ?? null);
  return (
    <div className="bg-card flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <div className="min-w-0">
        <div
          className={cn(
            "truncate text-sm",
            done && "text-[var(--pd-text-muted)] line-through",
          )}
        >
          {activity.task?.title ?? activity.summary}
        </div>
        <div className={cn("text-xs", done ? "text-[var(--pd-text-muted)]" : DUE_CLASS[state])}>
          {done && activity.task?.completed_at
            ? `Done ${format(new Date(activity.task.completed_at), "MMM d, yyyy")}`
            : activity.task?.due_at
              ? `Due ${format(new Date(activity.task.due_at), "MMM d, yyyy")}`
              : "No due date"}
        </div>
      </div>
      <form action={toggleTaskComplete.bind(null, activity.id, `/opportunities/${opportunityId}`)}>
        <Button variant={done ? "ghost" : "outline"} size="sm" type="submit">
          {done ? "Reopen" : "Mark done"}
        </Button>
      </form>
    </div>
  );
}

export default async function OpportunityDetailPage(props: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await props.params;
  const opp = await getOpportunity(id);
  if (!opp) notFound();
  const sb = await getSupabaseServerClient();
  const [
    activities,
    lineItemsRes,
    productsRes,
    packagesRes,
    stagesRaw,
    contactRes,
    accountRes,
    nextTaskRes,
    usersRes,
  ] = await Promise.all([
    listActivitiesForOpportunity(id, 50),
    sb
      .from("opportunity_line_items")
      .select(
        "id, opportunity_id, product_id, package_id, quantity, unit_price, discount_pct, position, product:products(name, sku), pkg:packages(name)",
      )
      .eq("opportunity_id", id)
      .order("position"),
    sb.from("products").select("id, sku, name, list_price").eq("is_active", true).order("name"),
    sb.from("packages").select("id, name, list_price").eq("is_active", true).order("name"),
    listStagesForPipeline(opp.pipeline_id),
    opp.primary_contact_id
      ? sb
          .from("contacts")
          .select("id, first_name, last_name, email, phone")
          .eq("id", opp.primary_contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from("accounts").select("id, name, country, type").eq("id", opp.account_id).maybeSingle(),
    sb
      .from("opportunity_next_task")
      .select("activity_id, title, due_at")
      .eq("opportunity_id", id)
      .maybeSingle(),
    sb.from("users").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  const lineItems: LineItem[] = (lineItemsRes.data ?? []).map((li) => ({
    id: li.id,
    product_id: li.product_id,
    package_id: li.package_id,
    quantity: li.quantity,
    unit_price: li.unit_price,
    discount_pct: li.discount_pct,
    product: Array.isArray(li.product) ? li.product[0] : li.product,
    pkg: Array.isArray(li.pkg) ? li.pkg[0] : li.pkg,
  }));

  const stages = (stagesRaw ?? []) as Stage[];
  const contact = (contactRes?.data ?? null) as {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  const account = (accountRes?.data ?? null) as {
    id: string;
    name: string;
    country: string | null;
    type: string | null;
  } | null;
  const nextTask = (nextTaskRes?.data ?? null) as {
    activity_id: string;
    title: string;
    due_at: string | null;
  } | null;
  const users = (usersRes.data ?? []) as { id: string; full_name: string }[];

  // Server-side derivations for the panels.
  const stage = stages.find((s) => s.id === opp.stage_id);
  const probability = opp.status === "open" && stage?.probability ? stage.probability : null;
  const weightedLabel =
    probability != null && opp.amount
      ? `${fmtMoney((Number(opp.amount) * probability) / 100, opp.currency)} weighted`
      : null;
  const now = Date.now();
  const isRotten =
    opp.status === "open" &&
    stage?.rot_days != null &&
    now - Date.parse(opp.updated_at) > stage.rot_days * 86_400_000;
  const rottenDays = Math.floor((now - Date.parse(opp.updated_at)) / 86_400_000);

  const notes = activities.filter((a) => a.channel === "note");
  const tasks = activities.filter((a) => a.channel === "task");
  const openTasks = [...tasks.filter((a) => !a.task?.completed_at)].sort((a, b) => {
    const ad = a.task?.due_at ? Date.parse(a.task.due_at) : Infinity;
    const bd = b.task?.due_at ? Date.parse(b.task.due_at) : Infinity;
    return ad - bd;
  });
  const doneTasks = tasks.filter((a) => a.task?.completed_at);

  const nextState = nextTask ? dueState(nextTask.due_at) : "none";

  return (
    <div className="px-6 py-5">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-[var(--pd-text-secondary)]">
            {account && (
              <Link href={`/accounts/${account.id}`} className="hover:underline">
                {account.name}
              </Link>
            )}
            {" · "}
            {opp.pipeline?.name}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <h1 className="truncate text-[21px] font-normal">{opp.name}</h1>
            {opp.status === "won" && (
              <span
                title={opp.won_reason ?? undefined}
                className="inline-flex h-5 shrink-0 items-center rounded-full bg-[var(--pd-positive-bg)] px-2 text-[11px] font-semibold text-[var(--pd-positive-strong)]"
              >
                Won
              </span>
            )}
            {opp.status === "lost" && (
              <span
                title={opp.lost_reason ?? undefined}
                className="inline-flex h-5 shrink-0 items-center rounded-full bg-[var(--pd-negative-bg)] px-2 text-[11px] font-semibold text-[var(--pd-negative-strong)]"
              >
                Lost
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DealCloseButtons
            opportunityId={opp.id}
            dealName={opp.name}
            stages={stages}
            status={opp.status}
          />
          <SendInvoiceButton opportunityId={opp.id} />
          <Button asChild variant="outline" size="sm">
            <Link href={`/opportunities/${opp.id}/edit`}>
              <Pencil className="size-3.5" /> Edit
            </Link>
          </Button>
        </div>
      </div>

      {/* Stage stepper */}
      <div className="mb-4">
        <StageStepper
          opportunityId={opp.id}
          stages={stages}
          currentStageId={opp.stage_id}
          disabled={opp.status !== "open"}
        />
      </div>

      {/* 3-panel grid */}
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_288px]">
        {/* Left — summary/fields */}
        <DealSummaryPanel
          opp={{
            id: opp.id,
            amount: opp.amount,
            currency: opp.currency,
            label: opp.label,
            expected_close_date: opp.expected_close_date,
            owner_user_id: opp.owner_user_id,
            owner_name: opp.owner?.full_name ?? null,
            status: opp.status,
            won_reason: opp.won_reason,
            lost_reason: opp.lost_reason,
            created_at: opp.created_at,
            updated_at: opp.updated_at,
          }}
          users={users}
          weightedLabel={weightedLabel}
          probability={probability}
        />

        {/* Center — tabs + line items */}
        <div className="min-w-0 space-y-4">
          <Tabs defaultValue="notes">
            <TabsList>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>
            <TabsContent value="notes">
              <NoteComposer accountId={opp.account_id} opportunityId={opp.id} />
              <div className="mt-3 space-y-2">
                {notes.map((a) => (
                  <div key={a.id} className="bg-card rounded-lg border p-3 text-sm">
                    <div className="whitespace-pre-wrap">{a.note?.body ?? a.summary}</div>
                    <div className="mt-1.5 text-xs text-[var(--pd-text-muted)]">
                      {a.user?.full_name ?? "System"} ·{" "}
                      {format(new Date(a.occurred_at), "MMM d, yyyy")}
                    </div>
                  </div>
                ))}
                {notes.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-[var(--pd-text-muted)]">
                    No notes yet
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="activity">
              <TaskComposer
                accountId={opp.account_id}
                opportunityId={opp.id}
                currentUserId={user.id}
              />
              <div className="mt-3 space-y-2">
                {openTasks.map((a) => (
                  <TaskRow key={a.id} activity={a} opportunityId={opp.id} />
                ))}
                {doneTasks.map((a) => (
                  <TaskRow key={a.id} activity={a} opportunityId={opp.id} />
                ))}
                {tasks.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-[var(--pd-text-muted)]">
                    No activities yet
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="timeline">
              <ActivityTimeline activities={activities} />
            </TabsContent>
          </Tabs>
          <LineItemsEditor
            opportunityId={opp.id}
            lineItems={lineItems}
            products={productsRes.data ?? []}
            packages={packagesRes.data ?? []}
          />
        </div>

        {/* Right — widgets */}
        <div className="space-y-4">
          <div className="bg-card rounded-lg border p-4">
            <div className="mb-2 text-sm font-semibold">Person</div>
            {contact ? (
              <div className="space-y-1 text-sm">
                <Link
                  href={`/accounts/${opp.account_id}`}
                  className="block truncate font-medium hover:underline"
                >
                  {contact.first_name} {contact.last_name}
                </Link>
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="block truncate text-[var(--pd-link)] hover:underline"
                  >
                    {contact.email}
                  </a>
                ) : (
                  <div>
                    <Dash />
                  </div>
                )}
                <div>{contact.phone || <Dash />}</div>
              </div>
            ) : (
              <div className="text-xs text-[var(--pd-text-muted)]">
                No contact linked{" "}
                <Link
                  href={`/opportunities/${opp.id}/edit`}
                  className="text-[var(--pd-link)] hover:underline"
                >
                  Link contact
                </Link>
              </div>
            )}
          </div>

          <div className="bg-card rounded-lg border p-4">
            <div className="mb-2 text-sm font-semibold">Organization</div>
            <div className="space-y-2">
              <WidgetRow label="Name">
                {account ? (
                  <Link href={`/accounts/${account.id}`} className="hover:underline">
                    {account.name}
                  </Link>
                ) : (
                  <Dash />
                )}
              </WidgetRow>
              <WidgetRow label="Country">{account?.country || <Dash />}</WidgetRow>
              <WidgetRow label="Type">
                {account?.type ? <span className="capitalize">{account.type}</span> : <Dash />}
              </WidgetRow>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-4">
            <div className="mb-2 text-sm font-semibold">Details</div>
            <div className="space-y-2">
              <WidgetRow label="Status">
                <span className="capitalize">{opp.status}</span>
              </WidgetRow>
              <WidgetRow label="Pipeline / Stage">
                {opp.pipeline?.name} / {opp.stage?.name}
              </WidgetRow>
              <WidgetRow label="Currency">{opp.currency}</WidgetRow>
              <WidgetRow label="Next activity">
                {nextTask ? (
                  <span className="flex items-center gap-1.5">
                    <span className="truncate">{nextTask.title}</span>
                    {nextTask.due_at && (
                      <span className={cn("shrink-0 text-xs", DUE_CLASS[nextState])}>
                        {format(new Date(nextTask.due_at), "MMM d")}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-[var(--pd-warning)]">
                    <AlertTriangle className="size-3.5 shrink-0" /> No activity scheduled
                  </span>
                )}
              </WidgetRow>
              {isRotten && (
                <div className="flex items-center gap-1.5 text-xs text-[var(--pd-negative-strong)]">
                  <AlertTriangle className="size-3.5 shrink-0" /> Rotten for {rottenDays} days
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
