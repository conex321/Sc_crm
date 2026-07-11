"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WonLostDialog } from "@/components/crm/won-lost-dialog";
import { markOpportunityWonLost } from "@/app/(dashboard)/opportunities/actions";

type Stage = { id: string; is_won: boolean; is_lost: boolean };

/**
 * Won / Lost header buttons on deal detail (02-UI-SPEC §9) — same dialog and
 * server action as the board's drop zones, so there is a single close path.
 */
export function DealCloseButtons({
  opportunityId,
  dealName,
  stages,
  status,
}: {
  opportunityId: string;
  dealName: string;
  stages: Stage[];
  status: "open" | "won" | "lost";
}) {
  const router = useRouter();
  const [variant, setVariant] = useState<"won" | "lost" | null>(null);

  if (status !== "open") return null;

  const confirm = async (reason: string) => {
    const v = variant;
    if (!v) return;
    const target = stages.find((s) => (v === "won" ? s.is_won : s.is_lost));
    if (!target) {
      toast.error("This pipeline has no won/lost stage");
      return;
    }
    try {
      await markOpportunityWonLost(opportunityId, target.id, reason);
      toast.success(v === "won" ? "Deal marked as won" : "Deal marked as lost");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to close deal");
    }
  };

  return (
    <>
      <Button size="sm" className="h-8" onClick={() => setVariant("won")}>
        Won
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="text-destructive h-8"
        onClick={() => setVariant("lost")}
      >
        Lost
      </Button>
      <WonLostDialog
        open={variant !== null}
        onOpenChange={(o) => {
          if (!o) setVariant(null);
        }}
        variant={variant ?? "won"}
        dealName={dealName}
        onConfirm={confirm}
      />
    </>
  );
}
