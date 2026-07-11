"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// SelectItem values are the display strings — non-empty, sentinel rule (D-043) satisfied.
const LOST_REASONS = [
  "No budget",
  "Lost to competitor",
  "Went cold — no response",
  "Bad timing",
  "Not a fit",
  "Other",
] as const;

/**
 * Mark as won / Mark as lost reason dialog (02-UI-SPEC §7).
 * Caller owns the toast + snap-back; `onConfirm` is awaited in a transition.
 */
export function WonLostDialog({
  open,
  onOpenChange,
  variant,
  dealName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  variant: "won" | "lost";
  dealName: string;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [wonReason, setWonReason] = useState("");
  const [lostChoice, setLostChoice] = useState<string | undefined>(undefined);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setWonReason("");
    setLostChoice(undefined);
    setComment("");
  };

  const finalReason =
    variant === "won"
      ? wonReason.trim()
      : lostChoice === "Other"
        ? comment.trim()
        : (lostChoice ?? "");

  const confirmDisabled =
    pending ||
    (variant === "lost" && (!lostChoice || (lostChoice === "Other" && !comment.trim())));

  const confirm = () => {
    startTransition(async () => {
      await onConfirm(finalReason);
      reset();
      onOpenChange(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{variant === "won" ? "Mark as won" : "Mark as lost"}</DialogTitle>
          <DialogDescription>{dealName}</DialogDescription>
        </DialogHeader>

        {variant === "won" ? (
          <div className="space-y-1.5">
            <Label htmlFor="won-reason" className="text-xs">
              Won reason
            </Label>
            <Input
              id="won-reason"
              value={wonReason}
              onChange={(e) => setWonReason(e.target.value)}
              placeholder="e.g. Best fit for their program"
              maxLength={500}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Lost reason</Label>
              <Select value={lostChoice} onValueChange={setLostChoice}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {LOST_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {lostChoice === "Other" && (
              <div className="space-y-1.5">
                <Label htmlFor="lost-comment" className="text-xs">
                  Comment
                </Label>
                <Textarea
                  id="lost-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="What happened?"
                  maxLength={500}
                  rows={3}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {variant === "won" ? (
            <Button disabled={confirmDisabled} onClick={confirm}>
              Mark as won
            </Button>
          ) : (
            <Button variant="destructive" disabled={confirmDisabled} onClick={confirm}>
              Mark as lost
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
