"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DealLabelChip } from "@/components/crm/deal-label-chip";
import { DEAL_LABELS, type DealLabel } from "@/lib/crm/labels";
import { fmtMoney } from "@/lib/format";
import {
  updateOpportunityInline,
  type OpportunityInlinePatch,
} from "@/app/(dashboard)/opportunities/[id]/detail-actions";

type SummaryOpp = {
  id: string;
  amount: string | null;
  currency: string;
  label: string | null;
  expected_close_date: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  status: "open" | "won" | "lost";
  won_reason: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
};

type PanelUser = { id: string; full_name: string };

// Tiny shared field row: uppercase caption + display value; click swaps in the
// editor when one is provided (deliberately not a generic abstraction).
function InlineField({
  label,
  display,
  editor,
}: {
  label: string;
  display: ReactNode;
  editor?: (close: () => void) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase text-[var(--pd-text-muted)]">
        {label}
      </div>
      {editing && editor ? (
        editor(() => setEditing(false))
      ) : editor ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="hover:bg-accent -mx-1 block w-full rounded-[4px] px-1 py-0.5 text-left text-sm"
        >
          {display}
        </button>
      ) : (
        <div className="py-0.5 text-sm">{display}</div>
      )}
    </div>
  );
}

/**
 * Deal detail left panel (02-UI-SPEC §9): value + weighted value on top, then
 * inline-editable Label / Expected close / Owner (+ Won/Lost reason on closed
 * deals) with optimistic saves through updateOpportunityInline.
 */
export function DealSummaryPanel({
  opp,
  users,
  weightedLabel,
  probability,
}: {
  opp: SummaryOpp;
  users: PanelUser[];
  weightedLabel: string | null;
  probability: number | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Optimistic overrides — cleared whenever the server sends fresh data.
  const [local, setLocal] = useState<Partial<SummaryOpp>>({});
  useEffect(() => setLocal({}), [opp.updated_at]);
  const view: SummaryOpp = { ...opp, ...local };

  const save = (patch: OpportunityInlinePatch, optimistic: Partial<SummaryOpp>) => {
    setLocal((l) => ({ ...l, ...optimistic }));
    startTransition(async () => {
      try {
        await updateOpportunityInline(opp.id, patch);
        router.refresh();
      } catch (err) {
        // Revert just the keys this save touched.
        setLocal((l) => {
          const next = { ...l };
          for (const k of Object.keys(optimistic)) delete next[k as keyof SummaryOpp];
          return next;
        });
        toast.error(err instanceof Error ? err.message : "Failed to save");
      }
    });
  };

  const dash = <span className="text-[var(--pd-text-muted)]">—</span>;

  return (
    <div className="bg-card h-fit rounded-lg border">
      <div className="p-4">
        <div className="text-[21px] font-normal tabular-nums">
          {view.amount != null ? fmtMoney(Number(view.amount), view.currency) : "—"}
        </div>
        {weightedLabel && (
          <div className="mt-0.5 text-xs text-[var(--pd-text-muted)]">{weightedLabel}</div>
        )}
      </div>
      <div className="space-y-3 border-t p-4">
        <InlineField
          label="Label"
          display={
            view.label ? (
              <DealLabelChip label={view.label} />
            ) : (
              <span className="text-[var(--pd-text-muted)]">No label</span>
            )
          }
          editor={(close) => (
            <Select
              defaultValue={view.label ?? "none"}
              defaultOpen
              onOpenChange={(o) => {
                if (!o) close();
              }}
              onValueChange={(v) => {
                const label = v === "none" ? null : (v as DealLabel);
                save({ label }, { label });
                close();
              }}
            >
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No label</SelectItem>
                {DEAL_LABELS.map((l) => (
                  <SelectItem key={l.key} value={l.key}>
                    <span
                      className="mr-1.5 inline-block size-2 rounded-full"
                      style={{
                        background: `var(--pd-label-${l.key}-bg)`,
                        // Tailwind ring color can't interpolate var names — inline.
                        boxShadow: `0 0 0 1px var(--pd-label-${l.key}-fg)`,
                      }}
                    />
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <InlineField
          label="Probability"
          display={probability != null ? `${probability}%` : dash}
        />
        <InlineField
          label="Expected close date"
          display={
            view.expected_close_date
              ? format(new Date(`${view.expected_close_date}T00:00:00`), "MMM d, yyyy")
              : dash
          }
          editor={(close) => (
            <Input
              type="date"
              autoFocus
              defaultValue={view.expected_close_date ?? ""}
              className="h-8"
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== (view.expected_close_date ?? "")) {
                  save({ expectedCloseDate: v || null }, { expected_close_date: v || null });
                }
                close();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") close();
              }}
            />
          )}
        />
        <InlineField
          label="Owner"
          display={view.owner_name ?? <span className="text-[var(--pd-text-muted)]">Unassigned</span>}
          editor={(close) => (
            <Select
              defaultValue={view.owner_user_id ?? "unassigned"}
              defaultOpen
              onOpenChange={(o) => {
                if (!o) close();
              }}
              onValueChange={(v) => {
                const ownerUserId = v === "unassigned" ? null : v;
                save(
                  { ownerUserId },
                  {
                    owner_user_id: ownerUserId,
                    owner_name: users.find((u) => u.id === v)?.full_name ?? null,
                  },
                );
                close();
              }}
            >
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {view.status === "won" && (
          <InlineField
            label="Won reason"
            display={view.won_reason || dash}
            editor={(close) => (
              <Input
                autoFocus
                defaultValue={view.won_reason ?? ""}
                maxLength={500}
                className="h-8"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (view.won_reason ?? "")) {
                    save({ wonReason: v || null }, { won_reason: v || null });
                  }
                  close();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") close();
                }}
              />
            )}
          />
        )}
        {view.status === "lost" && (
          <InlineField
            label="Lost reason"
            display={view.lost_reason || dash}
            editor={(close) => (
              <Input
                autoFocus
                defaultValue={view.lost_reason ?? ""}
                maxLength={500}
                className="h-8"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (view.lost_reason ?? "")) {
                    save({ lostReason: v || null }, { lost_reason: v || null });
                  }
                  close();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") close();
                }}
              />
            )}
          />
        )}
        <InlineField label="Source" display={dash} />
      </div>
      <div className="space-y-1 border-t p-4 text-xs text-[var(--pd-text-muted)]">
        <div>Created {format(new Date(view.created_at), "MMM d, yyyy")}</div>
        <div>Updated {format(new Date(view.updated_at), "MMM d, yyyy")}</div>
      </div>
    </div>
  );
}
