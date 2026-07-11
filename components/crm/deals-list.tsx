"use client";

// Paginated, sortable deals list view (02-UI-SPEC §5). 50 rows/page — the
// server slices pages from a bounded ≤500-row sorted set; this component
// NEVER renders an unbounded row set. Bulk actions follow the D-044 pattern
// (import-batch-rows-table.tsx): current-page selection Set, "keep" sentinels,
// only-changed-fields-apply.

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DealLabelChip } from "@/components/crm/deal-label-chip";
import {
  bulkSoftDeleteOpportunities,
  bulkUpdateOpportunities,
} from "@/app/(dashboard)/opportunities/view-actions";
import type { BoardOpportunity, ListSort } from "@/lib/crm/opportunities";
import { DEAL_LABELS } from "@/lib/crm/labels";
import { fmtMoney } from "@/lib/format";

const PAGE_SIZE = 50;
const COLUMNS_STORAGE_KEY = "deals-list-columns";

type Stage = {
  id: string;
  name: string;
  position: number;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
};

type ColumnKey =
  | "title"
  | "account"
  | "value"
  | "label"
  | "stage"
  | "next_activity"
  | "expected_close"
  | "owner"
  | "status"
  | "created"
  | "updated"
  | "reason"
  | "currency"
  | "probability"
  | "source";

// `sort` present = sortable header (spec: all except ☑ and Label; the extra
// optional columns without a ListSort key render plain headers).
const COLUMNS: { key: ColumnKey; label: string; sort?: ListSort }[] = [
  { key: "title", label: "Title", sort: "title" },
  { key: "account", label: "Organization", sort: "account" },
  { key: "value", label: "Value", sort: "value" },
  { key: "label", label: "Label" },
  { key: "stage", label: "Stage", sort: "stage" },
  { key: "next_activity", label: "Next activity", sort: "next_activity" },
  { key: "expected_close", label: "Expected close", sort: "expected_close" },
  { key: "owner", label: "Owner", sort: "owner" },
  { key: "status", label: "Status" },
  { key: "created", label: "Created", sort: "created" },
  { key: "updated", label: "Updated", sort: "updated" },
  { key: "reason", label: "Won/Lost reason" },
  { key: "currency", label: "Currency" },
  { key: "probability", label: "Probability" },
  { key: "source", label: "Source" },
];

const DEFAULT_COLUMNS: ColumnKey[] = [
  "title",
  "account",
  "value",
  "label",
  "stage",
  "next_activity",
  "expected_close",
  "owner",
];

const COLUMN_KEYS = new Set(COLUMNS.map((c) => c.key as string));

type ActivityState = "overdue" | "today" | "future" | "none";

function activityState(nextTask: BoardOpportunity["next_task"]): ActivityState {
  if (!nextTask) return "none";
  if (!nextTask.due_at) return "future";
  const due = new Date(nextTask.due_at);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (due < startOfToday) return "overdue";
  if (due < startOfTomorrow) return "today";
  return "future";
}

const ACTIVITY_DATE_COLOR: Record<Exclude<ActivityState, "none">, string> = {
  overdue: "text-[var(--pd-negative-strong)]",
  today: "text-[var(--pd-positive-strong)]",
  future: "text-[var(--pd-text-secondary)]",
};

export function DealsList({
  rows,
  total,
  capped,
  page,
  sort,
  dir,
  users,
  stages,
  isAdmin,
  newDealHref,
  hasFilters,
}: {
  rows: BoardOpportunity[];
  total: number;
  capped: boolean;
  page: number;
  sort: ListSort;
  dir: "asc" | "desc";
  users: { id: string; full_name: string }[];
  stages: Stage[];
  isAdmin: boolean;
  newDealHref: string;
  hasFilters: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [edit, setEdit] = useState({ owner: "keep", label: "keep", stage: "keep" });

  // SSR renders defaults; localStorage read happens post-mount to avoid a
  // hydration mismatch.
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((k) => typeof k === "string" && COLUMN_KEYS.has(k))
      ) {
        setVisibleColumns(parsed as ColumnKey[]);
      }
    } catch {
      // Corrupt storage — keep defaults.
    }
  }, []);

  const setColumns = (cols: ColumnKey[]) => {
    setVisibleColumns(cols);
    try {
      window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(cols));
    } catch {
      // Storage unavailable — selection lives for the session only.
    }
  };

  // Selections are per current page; navigating pages/filters clears them.
  useEffect(() => setSelected(new Set()), [rows]);

  const probabilityByStage = new Map(stages.map((s) => [s.id, s.probability]));
  const openStages = stages.filter((s) => !s.is_won && !s.is_lost);
  const shown = COLUMNS.filter((c) => visibleColumns.includes(c.key));

  const navigate = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const headerSort = (key: ListSort) => {
    navigate((params) => {
      if (sort === key) {
        params.set("dir", dir === "asc" ? "desc" : "asc");
      } else {
        params.set("sort", key);
        params.delete("dir");
      }
      params.delete("page");
    });
  };

  const pageHref = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const runBulkEdit = () => {
    const patch: Parameters<typeof bulkUpdateOpportunities>[1] = {};
    if (edit.owner !== "keep") patch.ownerUserId = edit.owner === "none" ? null : edit.owner;
    if (edit.label !== "keep") {
      patch.label =
        edit.label === "none"
          ? null
          : (edit.label as "red" | "yellow" | "blue" | "green" | "purple" | "gray");
    }
    if (edit.stage !== "keep") patch.stageId = edit.stage;
    if (Object.keys(patch).length === 0) {
      toast.error("Pick at least one change.");
      return;
    }
    startTransition(async () => {
      try {
        const r = await bulkUpdateOpportunities([...selected], patch);
        toast.success(`Updated ${r.updated} deal${r.updated === 1 ? "" : "s"}.`);
        setEditOpen(false);
        setEdit({ owner: "keep", label: "keep", stage: "keep" });
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk edit failed");
      }
    });
  };

  const runBulkDelete = () => {
    startTransition(async () => {
      try {
        const r = await bulkSoftDeleteOpportunities([...selected]);
        toast.success(`Deleted ${r.deleted} deal${r.deleted === 1 ? "" : "s"}.`);
        setDeleteOpen(false);
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      }
    });
  };

  if (rows.length === 0 && !hasFilters && page === 1) {
    return (
      <div className="rounded-md border border-dashed p-10 text-center">
        <div className="text-sm font-semibold">No deals yet</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Create your first deal to start tracking your pipeline.
        </p>
        <Button asChild size="sm" className="mt-4 h-8">
          <Link href={newDealHref}>
            <Plus className="size-4" /> Deal
          </Link>
        </Button>
      </div>
    );
  }

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const hasPrev = page > 1;
  const hasNext = page * PAGE_SIZE < Math.min(total, 500);

  const cellFor = (key: ColumnKey, o: BoardOpportunity) => {
    switch (key) {
      case "title":
        return (
          <Link
            href={`/opportunities/${o.id}`}
            className="text-sm font-semibold hover:underline"
          >
            {o.name}
          </Link>
        );
      case "account":
        return o.account ? (
          <Link
            href={`/accounts/${o.account.id}`}
            className="text-sm text-[var(--pd-link)] hover:text-[var(--pd-link-hover)] hover:underline"
          >
            {o.account.name}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      case "value":
        return (
          <span className="text-sm tabular-nums">
            {o.amount ? fmtMoney(Number(o.amount), o.currency) : "—"}
          </span>
        );
      case "label":
        return o.label ? (
          <DealLabelChip label={o.label} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      case "stage":
        return (
          <span className="text-xs text-[var(--pd-text-secondary)]">
            {o.stage?.name ?? "—"}
          </span>
        );
      case "next_activity": {
        const state = activityState(o.next_task);
        if (state === "none") {
          return (
            <AlertTriangle
              className="size-3.5 text-[var(--pd-warning)]"
              aria-label="No activity scheduled"
            />
          );
        }
        if (!o.next_task?.due_at) {
          return <span className="text-xs text-[var(--pd-text-secondary)]">Scheduled</span>;
        }
        return (
          <span className={`text-xs ${ACTIVITY_DATE_COLOR[state]}`}>
            {format(new Date(o.next_task.due_at), "MMM d, yyyy")}
          </span>
        );
      }
      case "expected_close":
        return (
          <span className="text-xs text-[var(--pd-text-secondary)]">
            {o.expected_close_date
              ? format(new Date(`${o.expected_close_date}T00:00:00`), "MMM d, yyyy")
              : "—"}
          </span>
        );
      case "owner":
        return (
          <span className="text-xs text-[var(--pd-text-secondary)]">
            {o.owner?.full_name ?? "—"}
          </span>
        );
      case "status":
        return <span className="text-xs capitalize">{o.status}</span>;
      case "created":
        return (
          <span className="text-xs text-[var(--pd-text-secondary)]">
            {format(new Date(o.created_at), "MMM d, yyyy")}
          </span>
        );
      case "updated":
        return (
          <span className="text-xs text-[var(--pd-text-secondary)]">
            {format(new Date(o.updated_at), "MMM d, yyyy")}
          </span>
        );
      case "reason":
        return (
          <span className="text-xs text-[var(--pd-text-secondary)]">
            {o.won_reason ?? o.lost_reason ?? "—"}
          </span>
        );
      case "currency":
        return <span className="text-xs">{o.currency}</span>;
      case "probability": {
        const p = probabilityByStage.get(o.stage_id);
        return (
          <span className="text-xs tabular-nums">{p != null ? `${p}%` : "—"}</span>
        );
      }
      case "source":
        // No source column on opportunities until Phase 3 leads land.
        return <span className="text-xs text-muted-foreground">—</span>;
    }
  };

  return (
    <div className="space-y-2">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--pd-text-muted)]">
            {selected.size} selected
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-3.5" /> Bulk edit
            </Button>
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={pending}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-3.5" /> Delete selected
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              {shown.map((c) => (
                <TableHead
                  key={c.key}
                  className={c.key === "value" ? "text-right" : undefined}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => headerSort(c.sort!)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {c.label}
                      {sort === c.sort &&
                        (dir === "asc" ? (
                          <ArrowUp className="size-3 text-[var(--pd-text-secondary)]" />
                        ) : (
                          <ArrowDown className="size-3 text-[var(--pd-text-secondary)]" />
                        ))}
                    </button>
                  ) : (
                    c.label
                  )}
                </TableHead>
              ))}
              <TableHead className="w-10 text-right">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-7 p-0"
                      aria-label="Choose columns"
                    >
                      <Settings2 className="size-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56" align="end">
                    <div className="space-y-0.5">
                      {COLUMNS.map((c) => (
                        <label
                          key={c.key}
                          className="flex h-8 cursor-pointer items-center gap-2 rounded px-1 text-sm hover:bg-accent"
                        >
                          <input
                            type="checkbox"
                            checked={visibleColumns.includes(c.key)}
                            onChange={(e) =>
                              setColumns(
                                e.target.checked
                                  ? COLUMNS.map((x) => x.key).filter(
                                      (k) => visibleColumns.includes(k) || k === c.key,
                                    )
                                  : visibleColumns.filter((k) => k !== c.key),
                              )
                            }
                          />
                          {c.label}
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 border-t pt-2">
                      <button
                        type="button"
                        onClick={() => setColumns(DEFAULT_COLUMNS)}
                        className="text-xs text-[var(--pd-link)] hover:text-[var(--pd-link-hover)] hover:underline"
                      >
                        Reset to default
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((o) => (
              <TableRow
                key={o.id}
                className={selected.has(o.id) ? "bg-[var(--pd-info-bg-light)]" : undefined}
              >
                <TableCell className="py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(o.id)}
                    onChange={() => toggle(o.id)}
                    aria-label={`Select ${o.name}`}
                  />
                </TableCell>
                {shown.map((c) => (
                  <TableCell
                    key={c.key}
                    className={`py-2 ${c.key === "value" ? "text-right" : ""}`}
                  >
                    {cellFor(c.key, o)}
                  </TableCell>
                ))}
                <TableCell className="py-2" />
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={shown.length + 2}
                  className="p-6 text-center text-sm text-muted-foreground"
                >
                  No deals match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t px-3 py-2">
          <span className="text-xs text-[var(--pd-text-muted)] tabular-nums">
            {from}–{to} of {total}
            {capped ? " (first 500 shown)" : ""}
          </span>
          <div className="flex gap-2">
            {hasPrev ? (
              <Button asChild size="sm" variant="outline">
                <Link href={pageHref(page - 1)}>Previous</Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled>
                Previous
              </Button>
            )}
            {hasNext ? (
              <Button asChild size="sm" variant="outline">
                <Link href={pageHref(page + 1)}>Next</Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk edit {selected.size} deals</DialogTitle>
            <DialogDescription>Only the fields you change are applied.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label>Owner</Label>
              <Select
                value={edit.owner}
                onValueChange={(v) => setEdit((e) => ({ ...e, owner: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">— Keep current —</SelectItem>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Label</Label>
              <Select
                value={edit.label}
                onValueChange={(v) => setEdit((e) => ({ ...e, label: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">— Keep current —</SelectItem>
                  <SelectItem value="none">No label</SelectItem>
                  {DEAL_LABELS.map((l) => (
                    <SelectItem key={l.key} value={l.key}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Stage</Label>
              <Select
                value={edit.stage}
                onValueChange={(v) => setEdit((e) => ({ ...e, stage: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">— Keep current —</SelectItem>
                  {openStages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={runBulkEdit} disabled={pending}>
              {pending ? "Applying…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {selected.size} deals</DialogTitle>
            <DialogDescription>
              This can&apos;t be undone from the list view.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={runBulkDelete} disabled={pending}>
              {pending ? "Deleting…" : `Delete ${selected.size} deals`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
