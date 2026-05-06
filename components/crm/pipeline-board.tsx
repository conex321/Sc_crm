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

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type Stage = {
  id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
};

export function PipelineBoard({
  stages,
  initialOpportunities,
}: {
  stages: Stage[];
  initialOpportunities: OpportunityWithRefs[];
}) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const byStage = (stageId: string) =>
    opportunities.filter((o) => o.stage_id === stageId);

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
              stage: stage
                ? { id: stage.id, name: stage.name, position: stage.position }
                : o.stage,
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

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            opportunities={byStage(stage.id)}
          />
        ))}
      </div>
      <DragOverlay>
        {active ? <OpportunityCard opp={active} dragging /> : null}
      </DragOverlay>
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
  const total = opportunities.reduce((acc, o) => acc + Number(o.amount ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-lg border bg-muted/20 transition ${
        isOver ? "border-primary/50 bg-muted/40" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{stage.name}</span>
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
        <div className="text-[10px] text-muted-foreground">
          {opportunities.length} · {formatter.format(total)}
        </div>
      </div>
      <div className="flex flex-col gap-2 p-2">
        {opportunities.map((o) => (
          <DraggableOpportunity key={o.id} opp={o} />
        ))}
        {opportunities.length === 0 && (
          <div className="rounded border border-dashed p-4 text-center text-[11px] text-muted-foreground">
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

function OpportunityCard({
  opp,
  dragging,
}: {
  opp: OpportunityWithRefs;
  dragging?: boolean;
}) {
  return (
    <Card
      className={`shadow-sm ${dragging ? "rotate-1 shadow-lg ring-1 ring-primary/40" : ""}`}
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
            {opp.amount ? formatter.format(Number(opp.amount)) : "—"}
          </span>
          {opp.expected_close_date && (
            <span className="text-muted-foreground">
              {format(new Date(opp.expected_close_date), "MMM d")}
            </span>
          )}
        </div>
        {opp.owner?.full_name && (
          <div className="truncate text-[10px] text-muted-foreground">
            {opp.owner.full_name}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
