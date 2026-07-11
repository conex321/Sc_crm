"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { updateStageRotDays } from "./actions";

/**
 * Compact per-stage "Rotting in (days)" editor. Empty input → null (off).
 * Renders only next to non-won/lost stage rows (page decides).
 */
export function RotDaysInput({
  stageId,
  initialRotDays,
}: {
  stageId: string;
  initialRotDays: number | null;
}) {
  const [value, setValue] = useState(initialRotDays == null ? "" : String(initialRotDays));
  const [pending, startTransition] = useTransition();

  const save = () => {
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > 365)) {
      toast.error("Rotting days must be a whole number between 1 and 365.");
      return;
    }
    if (parsed === initialRotDays) return;
    startTransition(async () => {
      try {
        await updateStageRotDays(stageId, parsed);
        toast.success(parsed === null ? "Rotting turned off" : `Rotting set to ${parsed} days`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save");
        setValue(initialRotDays == null ? "" : String(initialRotDays));
      }
    });
  };

  return (
    <span
      className="flex items-center gap-1"
      title="Rotting in (days) — deals untouched this long turn red on the board. Empty = off."
    >
      <Input
        type="number"
        min={1}
        max={365}
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label="Rotting in (days)"
        placeholder="—"
        className="h-7 w-16 text-xs"
      />
      <span className="text-[10px] text-muted-foreground">d</span>
    </span>
  );
}
