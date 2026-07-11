"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { AlertTriangle, Calendar, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createTask, toggleTaskComplete } from "@/app/(dashboard)/activities/actions";
import type { BoardOpportunity } from "@/lib/crm/opportunities";

type ActivityState = "overdue" | "today" | "future" | "none";

function getActivityState(nextTask: BoardOpportunity["next_task"]): ActivityState {
  if (!nextTask) return "none";
  if (!nextTask.due_at) return "future"; // undated open task → plain "scheduled"
  const due = new Date(nextTask.due_at);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (due < startOfToday) return "overdue";
  if (due < startOfTomorrow) return "today";
  return "future";
}

const STATE_META: Record<
  ActivityState,
  { Icon: typeof Calendar; iconColor: string; ariaLabel: string }
> = {
  overdue: {
    Icon: CalendarClock,
    iconColor: "text-[var(--pd-negative)]",
    ariaLabel: "Overdue activity",
  },
  today: {
    Icon: Calendar,
    iconColor: "text-[var(--pd-positive)]",
    ariaLabel: "Activity due today",
  },
  future: {
    Icon: Calendar,
    iconColor: "text-[var(--pd-text-secondary)]",
    ariaLabel: "Scheduled activity",
  },
  none: {
    Icon: AlertTriangle,
    iconColor: "text-[var(--pd-warning)]",
    ariaLabel: "No activity scheduled",
  },
};

const DUE_TEXT_COLOR: Record<Exclude<ActivityState, "none">, string> = {
  overdue: "text-[var(--pd-negative-strong)]",
  today: "text-[var(--pd-positive-strong)]",
  future: "text-[var(--pd-text-secondary)]",
};

/**
 * Card activity icon + complete-or-schedule popover (02-UI-SPEC §1).
 * Reuses the existing task server actions unchanged.
 */
export function DealActivityPopover({
  opp,
  redirectTo = "/opportunities",
  onDone,
}: {
  opp: BoardOpportunity;
  redirectTo?: string;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [subject, setSubject] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [pending, startTransition] = useTransition();

  const state = getActivityState(opp.next_task);
  const { Icon, iconColor, ariaLabel } = STATE_META[state];

  const close = () => {
    setOpen(false);
    setShowSchedule(false);
    setSubject("");
    setDueAt("");
  };

  const markDone = () => {
    const activityId = opp.next_task?.activity_id;
    if (!activityId) return;
    startTransition(async () => {
      try {
        await toggleTaskComplete(activityId, redirectTo);
        close();
        onDone?.();
        toast.success("Activity marked as done");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to complete activity");
      }
    });
  };

  const schedule = () => {
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("opportunityId", opp.id);
        fd.set("accountId", opp.account_id);
        fd.set("title", subject.trim());
        fd.set("dueAt", dueAt);
        await createTask(fd);
        close();
        onDone?.();
        toast.success("Activity scheduled");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to schedule activity");
      }
    });
  };

  const scheduleForm = (
    <div className="space-y-2">
      <Input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Follow up call…"
        aria-label="Activity subject"
        className="h-8"
      />
      <Input
        type="datetime-local"
        value={dueAt}
        onChange={(e) => setDueAt(e.target.value)}
        aria-label="Due date"
        className="h-8"
      />
      <Button size="sm" className="h-8 w-full" disabled={pending} onClick={schedule}>
        Schedule activity
      </Button>
    </div>
  );

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o) setOpen(true);
          else close();
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            // dnd-kit guard — same trick as the card title link.
            onPointerDown={(e) => e.stopPropagation()}
            className="hover:bg-accent grid size-6 shrink-0 place-items-center rounded-[4px]"
          >
            <Icon className={`size-4 ${iconColor}`} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          {opp.next_task ? (
            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold">{opp.next_task.title}</div>
                {opp.next_task.due_at && state !== "none" && (
                  <div className={`text-xs ${DUE_TEXT_COLOR[state]}`}>
                    {format(new Date(opp.next_task.due_at), "MMM d, yyyy h:mm a")}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" className="h-8" disabled={pending} onClick={markDone}>
                  Mark as done
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={pending}
                  onClick={() => setShowSchedule((v) => !v)}
                >
                  Schedule next
                </Button>
              </div>
              {showSchedule && scheduleForm}
            </div>
          ) : (
            scheduleForm
          )}
        </PopoverContent>
      </Popover>
      {state !== "none" && opp.next_task?.due_at && (
        <span
          className={`truncate text-[11px] ${
            state === "overdue" ? "text-[var(--pd-negative-strong)]" : "text-[var(--pd-text-muted)]"
          }`}
        >
          {format(new Date(opp.next_task.due_at), "MMM d")}
        </span>
      )}
    </div>
  );
}
