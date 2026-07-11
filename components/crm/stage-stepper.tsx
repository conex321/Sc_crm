"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { moveOpportunityStage } from "@/app/(dashboard)/opportunities/actions";

type Stage = {
  id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
};

// Chevron shapes: middle segments get an arrow tip on the right and a notch on
// the left; first/last drop the outer cut so the strip's rounded corners show.
function chevronClip(i: number, n: number): string | undefined {
  if (n <= 1) return undefined;
  if (i === 0) {
    return "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)";
  }
  if (i === n - 1) {
    return "polygon(0 0, 100% 0, 100% 100%, 0 100%, 8px 50%)";
  }
  return "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)";
}

/**
 * Full-width clickable stage strip (02-UI-SPEC §9). Open stages only —
 * won/lost transitions go through the header buttons' reason dialog.
 */
export function StageStepper({
  opportunityId,
  stages,
  currentStageId,
  disabled = false,
}: {
  opportunityId: string;
  stages: Stage[];
  currentStageId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const openStages = stages
    .filter((s) => !s.is_won && !s.is_lost)
    .sort((a, b) => a.position - b.position);
  const currentIdx = openStages.findIndex((s) => s.id === currentStageId);

  const moveTo = (stageId: string) => {
    startTransition(async () => {
      try {
        await moveOpportunityStage(opportunityId, stageId);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to move stage");
      }
    });
  };

  return (
    <div
      className={cn(
        "flex h-8 w-full gap-[2px] overflow-hidden rounded-[4px]",
        disabled && "opacity-60",
      )}
      role="group"
      aria-label="Deal stage"
    >
      {openStages.map((s, i) => {
        const reached = currentIdx >= 0 && i <= currentIdx;
        const isCurrent = s.id === currentStageId;
        return (
          <button
            key={s.id}
            type="button"
            disabled={disabled || pending || isCurrent}
            aria-current={isCurrent ? "step" : undefined}
            title={s.name}
            onClick={() => moveTo(s.id)}
            className={cn(
              "min-w-0 flex-1 truncate px-3 text-[12px] font-semibold transition-colors",
              reached
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-[var(--pd-text-secondary)]",
              disabled || isCurrent ? "cursor-default" : "cursor-pointer",
              !disabled && !isCurrent && !reached && "hover:bg-accent",
            )}
            style={{ clipPath: chevronClip(i, openStages.length) }}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
