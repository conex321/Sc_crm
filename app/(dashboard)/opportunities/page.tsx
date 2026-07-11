import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChartNoAxesColumn, Columns3, List, Plus } from "lucide-react";
import {
  listPipelines,
  listStagesForPipeline,
  listOpportunitiesByPipeline,
  type DealFilters,
} from "@/lib/crm/opportunities";
import { PipelineBoard } from "@/components/crm/pipeline-board";
import { DealsFilterBar } from "@/components/crm/deals-filter-bar";
import { requireUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { sumByCurrency, type DealSort } from "@/lib/crm/deal-board-utils";
import { DEAL_LABELS } from "@/lib/crm/labels";

const VIEWS = ["kanban", "list", "forecast"] as const;
type View = (typeof VIEWS)[number];

const DEAL_SORTS: readonly DealSort[] = ["next_activity", "value", "expected_close", "owner"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABEL_KEYS = DEAL_LABELS.map((l) => l.key as string);

type SearchParams = {
  pipeline?: string;
  view?: string;
  owner?: string;
  label?: string;
  status?: string;
  sort?: string;
  dir?: string;
  arrange?: string;
  page?: string;
};

const VIEW_SWITCH: { view: View; label: string; Icon: typeof Columns3 }[] = [
  { view: "kanban", label: "Kanban view", Icon: Columns3 },
  { view: "list", label: "List view", Icon: List },
  { view: "forecast", label: "Forecast view", Icon: ChartNoAxesColumn },
];

export default async function OpportunitiesPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await props.searchParams;
  await requireUser();
  const pipelines = await listPipelines();

  const activePipeline =
    pipelines.find((p) => p.slug === params.pipeline) ?? pipelines[0];

  if (!activePipeline) {
    return (
      <div className="px-6 py-5">
        <h1 className="text-lg font-semibold tracking-tight">Deals</h1>
        <div className="mt-6 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No pipelines yet. Ask an admin to create one in{" "}
          <Link href="/settings/pipelines" className="underline">
            Settings → Pipelines
          </Link>
          .
        </div>
      </div>
    );
  }

  // --- Parse + sanitize URL params (whitelist enums; ignore garbage) ---
  const view: View = (VIEWS as readonly string[]).includes(params.view ?? "")
    ? (params.view as View)
    : "kanban";
  const owner = params.owner && UUID_RE.test(params.owner) ? params.owner : undefined;
  const label = params.label && LABEL_KEYS.includes(params.label) ? params.label : undefined;
  const status =
    params.status === "won" || params.status === "lost" ? params.status : undefined;
  const sort: DealSort = (DEAL_SORTS as readonly string[]).includes(params.sort ?? "")
    ? (params.sort as DealSort)
    : "next_activity";
  const arrange: DealSort = (DEAL_SORTS as readonly string[]).includes(params.arrange ?? "")
    ? (params.arrange as DealSort)
    : "next_activity";

  const filters: DealFilters = { ownerId: owner, label, status };

  const sb = await getSupabaseServerClient();
  const [stages, usersRes] = await Promise.all([
    listStagesForPipeline(activePipeline.id),
    sb.from("users").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);
  if (usersRes.error) throw new Error(usersRes.error.message);
  const users = usersRes.data ?? [];

  // View switcher links preserve pipeline + filters; pagination resets.
  const viewHref = (v: View) => {
    const q = new URLSearchParams();
    if (params.pipeline) q.set("pipeline", params.pipeline);
    if (v !== "kanban") q.set("view", v);
    if (owner) q.set("owner", owner);
    if (label) q.set("label", label);
    if (status) q.set("status", status);
    if (params.sort) q.set("sort", params.sort);
    if (params.arrange) q.set("arrange", params.arrange);
    const qs = q.toString();
    return qs ? `/opportunities?${qs}` : "/opportunities";
  };

  // --- Per-view data + summary line (over the loaded open deals) ---
  let body: React.ReactNode = null;
  let openSum = sumByCurrency([]);
  let weightedSum = sumByCurrency([]);

  if (view === "kanban") {
    const deals = await listOpportunitiesByPipeline(activePipeline.id, filters);
    const openDeals = deals.filter((d) => d.status === "open");
    openSum = sumByCurrency(openDeals);
    weightedSum = sumByCurrency(openDeals, true, stages);
    body = (
      <PipelineBoard
        stages={stages}
        initialOpportunities={deals}
        sort={sort}
        readOnly={status}
      />
    );
  } else if (view === "list") {
    // Task 2 wires the list view here.
    body = null;
  } else {
    // Task 3 wires the forecast view here.
    void arrange;
    body = null;
  }

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild size="sm" className="h-8">
            <Link href={`/opportunities/new?pipeline=${activePipeline.slug}`}>
              <Plus className="size-4" /> Deal
            </Link>
          </Button>
          <div className="inline-flex overflow-hidden rounded-[4px] border bg-card divide-x">
            {VIEW_SWITCH.map(({ view: v, label: ariaLabel, Icon }) => (
              <Link
                key={v}
                href={viewHref(v)}
                aria-label={ariaLabel}
                title={ariaLabel}
                className={`grid h-8 w-9 place-items-center transition ${
                  view === v
                    ? "bg-accent text-foreground"
                    : "text-[var(--pd-text-secondary)] hover:bg-secondary"
                }`}
              >
                <Icon className="size-4" />
              </Link>
            ))}
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Deals</h1>
            <p className="text-xs text-muted-foreground tabular-nums">
              <span className="font-medium text-foreground">{openSum}</span> open ·{" "}
              <span className="font-medium text-foreground">{weightedSum}</span> weighted
              forecast
            </p>
          </div>
        </div>
        <DealsFilterBar
          users={users}
          view={view}
          pipelines={pipelines}
          activePipelineSlug={activePipeline.slug}
        />
      </div>

      {body}
    </div>
  );
}
