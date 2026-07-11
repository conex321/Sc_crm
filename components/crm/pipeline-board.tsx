"use client";

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
import { AlertTriangle, User } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { DealActivityPopover } from "@/components/crm/deal-activity-popover";
import { DealLabelChip } from "@/components/crm/deal-label-chip";
import { WonLostDialog } from "@/components/crm/won-lost-dialog";
import {
  markOpportunityWonLost,
  moveOpportunityStage,
} from "@/app/(dashboard)/opportunities/actions";
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

export function PipelineBoard({
  stages,
  initialOpportunities,
  sort = "next_activity",
  readOnly,
}: {
  stages: Stage[];
  initialOpportunities: BoardOpportunity[];
  sort?: DealSort; // driven by ?sort= (page parses + whitelists)
  // Closed-deals mode (?status=won|lost): board renders those deals read-only
  // in their final stage — no dragging, no drop zones. The value carries which
  // closed status is showing so empty boards still render the right column(s).
  readOnly?: "won" | "lost";
}) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<{
    oppId: string;
    name: string;
    variant: "won" | "lost";
  } | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Resync fix: server refetches (router.refresh after popover/dialog
  // mutations) must replace client-held board state — revalidatePath alone
  // never updates a mounted client component's useState.
  useEffect(() => setOpportunities(initialOpportunities), [initialOpportunities]);

  const refresh = () => router.refresh();

  // Open board: won/lost stages leave the board (closed deals are reached via
  // the won/lost filter chips). Read-only closed board: columns are the stages
  // flagged for that status PLUS any stage that actually holds matching deals
  // (legacy rows closed without a stage move).
  const boardStages = readOnly
    ? stages.filter(
        (s) =>
          (readOnly === "won" ? s.is_won : s.is_lost) ||
          opportunities.some((o) => o.stage_id === s.id),
      )
    : stages.filter((s) => !s.is_won && !s.is_lost);

  const byStage = (stageId: string) =>
    opportunities.filter((o) => o.stage_id === stageId).sort(compareDeals(sort));

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const oppId = String(e.active.id);
    const overId = String(e.over.id);
    const opp = opportunities.find((o) => o.id === oppId);
    if (!opp) return;

    // Won/Lost drop zones: no optimistic move — the reason dialog decides.
    // Cancel/ESC just closes; the card was never moved, so it snaps back.
    if (overId === "dropzone:won" || overId === "dropzone:lost") {
      setPendingClose({
        oppId,
        name: opp.name,
        variant: overId === "dropzone:won" ? "won" : "lost",
      });
      return;
    }

    if (opp.stage_id === overId) return;

    const stage = stages.find((s) => s.id === overId);
    // Pre-drag snapshot for rollback (NOT the stale initialOpportunities closure).
    const prev = opportunities;
    setOpportunities(
      prev.map((o) =>
        o.id === oppId
          ? {
              ...o,
              stage_id: overId,
              stage: stage ? { id: stage.id, name: stage.name, position: stage.position } : o.stage,
              status: stage?.is_won ? "won" : stage?.is_lost ? "lost" : "open",
            }
          : o,
      ),
    );

    startTransition(async () => {
      try {
        await moveOpportunityStage(oppId, overId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to move");
        setOpportunities(prev);
      }
    });
  };

  const confirmClose = async (reason: string) => {
    if (!pendingClose) return;
    const { oppId, variant } = pendingClose;
    const targetStage = stages.find((s) => (variant === "won" ? s.is_won : s.is_lost));
    if (!targetStage) {
      toast.error(`This pipeline has no ${variant} stage.`);
      setPendingClose(null);
      return;
    }
    try {
      await markOpportunityWonLost(oppId, targetStage.id, reason);
      setOpportunities((prevOpps) => prevOpps.filter((o) => o.id !== oppId));
      toast.success(variant === "won" ? "Deal marked as won" : "Deal marked as lost");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to close deal");
    } finally {
      setPendingClose(null);
    }
  };

  const active = activeId ? opportunities.find((o) => o.id === activeId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {boardStages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            opportunities={byStage(stage.id)}
            onCardAction={refresh}
            readOnly={Boolean(readOnly)}
          />
        ))}
      </div>
      {activeId && !readOnly && (
        <div className="fixed inset-x-6 bottom-4 z-40 flex gap-3">
          <CloseDropZone variant="won" />
          <CloseDropZone variant="lost" />
        </div>
      )}
      <DragOverlay>{active ? <OpportunityCard opp={active} dragging /> : null}</DragOverlay>
      {pendingClose && (
        <WonLostDialog
          open
          onOpenChange={(o) => {
            if (!o) setPendingClose(null);
          }}
          variant={pendingClose.variant}
          dealName={pendingClose.name}
          onConfirm={confirmClose}
        />
      )}
    </DndContext>
  );
}

function CloseDropZone({ variant }: { variant: "won" | "lost" }) {
  const { setNodeRef, isOver } = useDroppable({ id: `dropzone:${variant}` });
  const base =
    variant === "won"
      ? "border-[var(--pd-positive)] text-[var(--pd-positive-strong)]"
      : "border-[var(--pd-negative)] text-[var(--pd-negative-strong)]";
  const bg =
    variant === "won"
      ? isOver
        ? "bg-[var(--pd-positive-bg)]"
        : "bg-[var(--pd-positive-bg-light)]"
      : isOver
        ? "bg-[var(--pd-negative-bg)]"
        : "bg-[var(--pd-negative-bg-light)]";
  return (
    <div
      ref={setNodeRef}
      className={`flex h-16 flex-1 items-center justify-center rounded-lg border-2 border-dashed text-sm font-semibold transition ${base} ${bg} ${
        isOver ? "scale-[1.01]" : ""
      }`}
    >
      {variant === "won" ? "Won" : "Lost"}
    </div>
  );
}

function StageColumn({
  stage,
  opportunities,
  onCardAction,
  readOnly,
}: {
  stage: Stage;
  opportunities: BoardOpportunity[];
  onCardAction: () => void;
  readOnly?: boolean;
}) {
  // Hook is called unconditionally (rules of hooks); in read-only mode nothing
  // is draggable, so this droppable never activates.
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled: readOnly });
  const rottenCount = opportunities.filter((o) => o.is_rotten).length;

  return (
    <div
      ref={setNodeRef}
      className={`bg-secondary flex w-72 shrink-0 flex-col rounded-lg border transition ${
        isOver ? "border-primary/50 bg-accent" : ""
      }`}
    >
      <div className="border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{stage.name}</span>
          {stage.probability > 0 &&
            stage.probability < 100 &&
            !stage.is_won &&
            !stage.is_lost && (
              <span className="text-xs text-[var(--pd-text-muted)]">{stage.probability}%</span>
            )}
        </div>
        <div className="text-xs text-[var(--pd-text-secondary)] tabular-nums">
          {opportunities.length} deals · {sumByCurrency(opportunities)}
          {rottenCount > 0 && (
            <span className="text-[var(--pd-negative-strong)]">
              {" "}
              · <AlertTriangle className="inline size-3 align-[-1px]" /> {rottenCount} rotten
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2 p-2">
        {opportunities.map((o) =>
          readOnly ? (
            <OpportunityCard key={o.id} opp={o} onDone={onCardAction} />
          ) : (
            <DraggableOpportunity key={o.id} opp={o} onCardAction={onCardAction} />
          ),
        )}
        {opportunities.length === 0 && (
          <div className="rounded border border-dashed p-4 text-center text-[11px] text-[var(--pd-text-muted)]">
            No deals
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableOpportunity({
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
      <OpportunityCard opp={opp} onDone={onCardAction} />
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

function OpportunityCard({
  opp,
  dragging,
  onDone,
}: {
  opp: BoardOpportunity;
  dragging?: boolean;
  onDone?: () => void;
}) {
  // Rotten treatment on the card itself so DragOverlay inherits it.
  const rottenDays = opp.is_rotten
    ? Math.floor((Date.now() - Date.parse(opp.updated_at)) / 86_400_000)
    : 0;

  return (
    <Card
      className={`shadow-pd-raised hover:shadow-pd-raised-hover ${
        dragging ? "shadow-pd-raised-hover ring-primary/40 rotate-1 ring-1" : ""
      } ${
        opp.is_rotten
          ? "border-l-[3px] border-l-[var(--pd-negative)] bg-[var(--pd-negative-bg-light)]"
          : ""
      }`}
      title={opp.is_rotten ? `Rotten — no activity for ${rottenDays} days` : undefined}
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
