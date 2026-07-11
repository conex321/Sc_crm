"use client";

// Forecast view (02-UI-SPEC §6): kanban-of-month-buckets on expected_close_date
// (won deals bucket on won_at). Dragging an open deal to another month rewrites
// expected_close_date to that month's LAST day — same optimistic+rollback
// pattern as the kanban board's moveOpportunityStage. Won cards get the green
// mirror of the rotten treatment and are NOT draggable. Rotten treatment does
// not apply in forecast.

import { useEffect, useState, useTransition } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addMonths,
  differenceInCalendarMonths,
  endOfMonth,
  format,
  startOfMonth,
} from "date-fns";
import { User } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { DealActivityPopover } from "@/components/crm/deal-activity-popover";
import { DealLabelChip } from "@/components/crm/deal-label-chip";
import { updateExpectedCloseDate } from "@/app/(dashboard)/opportunities/view-actions";
import type { BoardOpportunity } from "@/lib/crm/opportunities";
import { compareDeals, sumByCurrency, type DealSort } from "@/lib/crm/deal-board-utils";
import { fmtMoney } from "@/lib/format";

type Stage = {
  id: string;
  name: string;
  position: number;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
};

const NO_DATE = "no-close-date";
const monthKey = (d: Date) => format(d, "yyyy-MM");

/** Won portion always counts in full; the open portion is weighted when asked. */
function combinedTotal(
  won: BoardOpportunity[],
  open: BoardOpportunity[],
  weighted: boolean,
  stages: Stage[],
): string {
  const totals = new Map<string, number>();
  const add = (o: BoardOpportunity, prob: number) => {
    const amt = Number(o.amount ?? 0);
    if (!amt) return;
    totals.set(o.currency, (totals.get(o.currency) ?? 0) + amt * prob);
  };
  for (const o of won) add(o, 1);
  for (const o of open) {
    add(o, weighted ? (stages.find((s) => s.id === o.stage_id)?.probability ?? 0) / 100 : 1);
  }
  if (totals.size === 0) return fmtMoney(0);
  return [...totals.entries()].map(([c, v]) => fmtMoney(v, c)).join(" + ");
}

export function ForecastBoard({
  openDeals,
  wonDeals,
  stages,
  arrange,
}: {
  openDeals: BoardOpportunity[];
  wonDeals: BoardOpportunity[];
  stages: Stage[];
  arrange: DealSort;
}) {
  const [deals, setDeals] = useState(openDeals);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  // Same verified dnd setup as the kanban board.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Board resync pattern: server refetches replace client-held state.
  useEffect(() => setDeals(openDeals), [openDeals]);

  const currentMonthStart = startOfMonth(new Date());

  // Current month + at least the next 5; extended (bounded) when open deals
  // close beyond the 6-month horizon so no deal silently disappears — the
  // spec's "6 columns visible" rides on the existing horizontal scroll.
  let monthCount = 6;
  for (const d of deals) {
    if (!d.expected_close_date) continue;
    const diff = differenceInCalendarMonths(
      startOfMonth(new Date(`${d.expected_close_date}T00:00:00`)),
      currentMonthStart,
    );
    if (diff >= monthCount) monthCount = Math.min(diff + 1, 24);
  }
  const months = Array.from({ length: monthCount }, (_, i) =>
    addMonths(currentMonthStart, i),
  );

  const openBucket = (o: BoardOpportunity): string => {
    if (!o.expected_close_date) return NO_DATE;
    const d = new Date(`${o.expected_close_date}T00:00:00`);
    if (d < currentMonthStart) return NO_DATE; // pre-current-month catch-all
    return monthKey(d);
  };
  const wonBucket = (o: BoardOpportunity): string =>
    o.won_at ? monthKey(new Date(o.won_at)) : NO_DATE;

  const sortDeals = (list: BoardOpportunity[]) => [...list].sort(compareDeals(arrange));

  const anyWeighted = stages.some((s) => !s.is_won && !s.is_lost && s.probability > 0);

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const oppId = String(e.active.id);
    const targetKey = String(e.over.id);
    const opp = deals.find((o) => o.id === oppId);
    if (!opp) return;
    if (openBucket(opp) === targetKey) return;

    const monthStart = months.find((m) => monthKey(m) === targetKey);
    if (!monthStart) return; // NO_DATE column is not a droppable target

    const iso = format(endOfMonth(monthStart), "yyyy-MM-dd");
    // Pre-drag snapshot for rollback.
    const prev = deals;
    setDeals(prev.map((o) => (o.id === oppId ? { ...o, expected_close_date: iso } : o)));

    startTransition(async () => {
      try {
        await updateExpectedCloseDate(oppId, iso);
        toast.success(`Expected close moved to ${format(monthStart, "MMM yyyy")}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to move");
        setDeals(prev);
      }
    });
  };

  const active = activeId ? deals.find((o) => o.id === activeId) : null;

  const noDateOpen = sortDeals(deals.filter((o) => openBucket(o) === NO_DATE));

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        <BucketColumn
          title="No close date"
          isCurrent={false}
          wonInBucket={[]}
          openInBucket={noDateOpen}
          stages={stages}
          anyWeighted={anyWeighted}
          onCardAction={() => router.refresh()}
        />
        {months.map((m) => {
          const key = monthKey(m);
          const wonInBucket = sortDeals(wonDeals.filter((o) => wonBucket(o) === key));
          const openInBucket = sortDeals(deals.filter((o) => openBucket(o) === key));
          return (
            <DroppableMonthColumn
              key={key}
              id={key}
              title={format(m, "MMMM yyyy")}
              isCurrent={key === monthKey(currentMonthStart)}
              wonInBucket={wonInBucket}
              openInBucket={openInBucket}
              stages={stages}
              anyWeighted={anyWeighted}
              onCardAction={() => router.refresh()}
            />
          );
        })}
      </div>
      <DragOverlay>{active ? <ForecastCard opp={active} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}

type ColumnProps = {
  title: string;
  isCurrent: boolean;
  wonInBucket: BoardOpportunity[];
  openInBucket: BoardOpportunity[];
  stages: Stage[];
  anyWeighted: boolean;
  onCardAction: () => void;
};

function DroppableMonthColumn(props: ColumnProps & { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: props.id });
  return <ColumnShell {...props} dropRef={setNodeRef} isOver={isOver} droppable />;
}

function BucketColumn(props: ColumnProps) {
  return <ColumnShell {...props} />;
}

function ColumnShell({
  title,
  isCurrent,
  wonInBucket,
  openInBucket,
  stages,
  anyWeighted,
  onCardAction,
  dropRef,
  isOver,
  droppable,
}: ColumnProps & {
  dropRef?: (node: HTMLElement | null) => void;
  isOver?: boolean;
  droppable?: boolean;
}) {
  const totalLabel = anyWeighted ? "Weighted" : "Total";
  const total = combinedTotal(wonInBucket, openInBucket, anyWeighted, stages);
  return (
    <div
      ref={dropRef}
      className={`bg-secondary flex w-72 shrink-0 flex-col rounded-lg border transition ${
        droppable && isOver ? "border-primary/50 bg-accent" : ""
      }`}
    >
      <div className="border-b px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold">{title}</span>
          {isCurrent && (
            <span className="shrink-0 text-[11px] text-[var(--pd-text-muted)]">
              · this month
            </span>
          )}
        </div>
        <div className="text-xs tabular-nums">
          <span className="text-[var(--pd-positive-strong)]">
            Won {sumByCurrency(wonInBucket)}
          </span>{" "}
          <span className="text-[var(--pd-text-secondary)]">
            · Open {sumByCurrency(openInBucket)}
          </span>
        </div>
        <div className="text-xs font-semibold tabular-nums">
          {totalLabel} {total}
        </div>
      </div>
      <div className="flex flex-col gap-2 p-2">
        {wonInBucket.map((o) => (
          <ForecastCard key={o.id} opp={o} won onDone={onCardAction} />
        ))}
        {openInBucket.map((o) => (
          <DraggableForecastCard key={o.id} opp={o} onCardAction={onCardAction} />
        ))}
        {wonInBucket.length === 0 && openInBucket.length === 0 && (
          <div className="rounded border border-dashed p-4 text-center text-[11px] text-[var(--pd-text-muted)]">
            No deals
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableForecastCard({
  opp,
  onCardAction,
}: {
  opp: BoardOpportunity;
  onCardAction: () => void;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: opp.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab ${isDragging ? "opacity-30" : ""}`}
    >
      <ForecastCard opp={opp} onDone={onCardAction} />
    </div>
  );
}

function OwnerAvatar({ owner }: { owner: { id: string; full_name: string } | null }) {
  if (!owner?.full_name) {
    return (
      <span
        className="grid size-5 shrink-0 place-items-center rounded-full border border-dashed"
        title="Unassigned"
      >
        <User className="size-3 text-[var(--pd-text-muted)]" />
      </span>
    );
  }
  const parts = owner.full_name.trim().split(/\s+/);
  const initials = (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")
  ).toUpperCase();
  return (
    <span
      className="bg-accent grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-[var(--pd-text-secondary)]"
      title={owner.full_name}
    >
      {initials}
    </span>
  );
}

function ForecastCard({
  opp,
  won,
  dragging,
  onDone,
}: {
  opp: BoardOpportunity;
  won?: boolean;
  dragging?: boolean;
  onDone?: () => void;
}) {
  return (
    <Card
      className={`shadow-pd-raised hover:shadow-pd-raised-hover ${
        dragging ? "shadow-pd-raised-hover ring-primary/40 rotate-1 ring-1" : ""
      } ${
        won
          ? "border-l-[3px] border-l-[var(--pd-positive)] bg-[var(--pd-positive-bg-light)]"
          : ""
      }`}
    >
      <CardContent className="space-y-1 p-3">
        <Link
          href={`/opportunities/${opp.id}`}
          className="line-clamp-2 text-sm font-semibold hover:underline"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {opp.name}
        </Link>
        <div className="truncate text-xs text-[var(--pd-text-secondary)]">
          {opp.account?.name ?? "—"}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold tabular-nums">
            {opp.amount ? fmtMoney(Number(opp.amount), opp.currency) : "—"}
          </span>
          <DealLabelChip label={opp.label} />
        </div>
        <div className="flex items-center justify-between pt-1">
          <DealActivityPopover opp={opp} onDone={onDone} />
          <OwnerAvatar owner={opp.owner} />
        </div>
      </CardContent>
    </Card>
  );
}
