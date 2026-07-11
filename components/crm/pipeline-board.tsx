"use client";

import { useState, useTransition } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import { moveOpportunityStage } from "@/app/(dashboard)/opportunities/actions";
import type { OpportunityWithRefs } from "@/lib/crm/opportunities";
import { fmtMoney } from "@/lib/format";

/** Sum a set of opps, grouping by currency, and render "CA$X + US$Y". */
function sumByCurrency(opps: OpportunityWithRefs[], weighted = false, stages?: Stage[]): string {
  const totals = new Map<string, number>();
  for (const o of opps) {
    const amt = Number(o.amount ?? 0);
    if (!amt) continue;
    const prob = weighted ? (stages?.find((s) => s.id === o.stage_id)?.probability ?? 0) / 100 : 1;
    totals.set(o.currency, (totals.get(o.currency) ?? 0) + amt * prob);
  }
  if (totals.size === 0) return fmtMoney(0);
  return [...totals.entries()].map(([c, v]) => fmtMoney(v, c)).join(" + ");
}

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
  currentUserId,
}: {
  stages: Stage[];
  initialOpportunities: OpportunityWithRefs[];
  currentUserId: string;
}) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const visible = mineOnly
    ? opportunities.filter((o) => o.owner_user_id === currentUserId)
    : opportunities;
  const byStage = (stageId: string) => visible.filter((o) => o.stage_id === stageId);
  const mineCount = opportunities.filter((o) => o.owner_user_id === currentUserId).length;

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const oppId = String(e.active.id);
    const newStageId = String(e.over.id);
    const opp = opportunities.find((o) => o.id === oppId);
    if (!opp || opp.stage_id === newStageId) return;

    const stage = stages.find((s) => s.id === newStageId);
    setOpportunities((prev) =>
      prev.map((o) =>
        o.id === oppId
          ? {
              ...o,
              stage_id: newStageId,
              stage: stage ? { id: stage.id, name: stage.name, position: stage.position } : o.stage,
              status: stage?.is_won ? "won" : stage?.is_lost ? "lost" : "open",
            }
          : o,
      ),
    );

    startTransition(async () => {
      try {
        await moveOpportunityStage(oppId, newStageId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to move");
        setOpportunities(initialOpportunities);
      }
    });
  };

  const active = activeId ? opportunities.find((o) => o.id === activeId) : null;
  const openVisible = visible.filter((o) => o.status === "open");

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-muted-foreground text-xs">
          <span className="text-foreground font-medium">{sumByCurrency(openVisible)}</span> open ·{" "}
          <span className="text-foreground font-medium">
            {sumByCurrency(openVisible, true, stages)}
          </span>{" "}
          weighted forecast
        </div>
        <button
          type="button"
          onClick={() => setMineOnly((v) => !v)}
          className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
            mineOnly
              ? "bg-background shadow-sm"
              : "bg-muted/20 text-muted-foreground hover:text-foreground"
          }`}
        >
          {mineOnly ? "Showing mine" : "Mine only"} ({mineCount})
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <StageColumn key={stage.id} stage={stage} opportunities={byStage(stage.id)} />
        ))}
      </div>
      <DragOverlay>{active ? <OpportunityCard opp={active} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}

function StageColumn({
  stage,
  opportunities,
}: {
  stage: Stage;
  opportunities: OpportunityWithRefs[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={`bg-secondary flex w-72 shrink-0 flex-col rounded-lg border transition ${
        isOver ? "border-primary/50 bg-accent" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{stage.name}</span>
          {stage.probability > 0 && !stage.is_won && !stage.is_lost && (
            <span className="text-muted-foreground text-[10px]">{stage.probability}%</span>
          )}
          {stage.is_won && (
            <Badge variant="default" className="text-[10px]">
              won
            </Badge>
          )}
          {stage.is_lost && (
            <Badge variant="destructive" className="text-[10px]">
              lost
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground text-[10px]">
          {opportunities.length} · {sumByCurrency(opportunities)}
        </div>
      </div>
      <div className="flex flex-col gap-2 p-2">
        {opportunities.map((o) => (
          <DraggableOpportunity key={o.id} opp={o} />
        ))}
        {opportunities.length === 0 && (
          <div className="text-muted-foreground rounded border border-dashed p-4 text-center text-[11px]">
            Empty
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableOpportunity({ opp }: { opp: OpportunityWithRefs }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: opp.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab ${isDragging ? "opacity-30" : ""}`}
    >
      <OpportunityCard opp={opp} />
    </div>
  );
}

function OpportunityCard({ opp, dragging }: { opp: OpportunityWithRefs; dragging?: boolean }) {
  return (
    <Card
      className={`shadow-pd-raised hover:shadow-pd-raised-hover ${dragging ? "shadow-pd-raised-hover ring-primary/40 rotate-1 ring-1" : ""}`}
    >
      <CardContent className="space-y-1 p-3 text-xs">
        <Link
          href={`/opportunities/${opp.id}`}
          className="line-clamp-2 font-medium hover:underline"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {opp.name}
        </Link>
        <div className="text-muted-foreground">{opp.account?.name ?? "—"}</div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium">
            {opp.amount ? fmtMoney(Number(opp.amount), opp.currency) : "—"}
          </span>
          {opp.expected_close_date && (
            <span className="text-muted-foreground">
              {format(new Date(opp.expected_close_date), "MMM d")}
            </span>
          )}
        </div>
        {opp.owner?.full_name && (
          <div className="text-muted-foreground truncate text-[10px]">{opp.owner.full_name}</div>
        )}
      </CardContent>
    </Card>
  );
}
