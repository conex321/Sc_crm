"use client";

// URL-param filter bar shared by all three deal views (02-UI-SPEC §8).
// Every control reads/writes searchParams via router.replace — no local
// filter state, so kanban/list/forecast all see the same filters server-side.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEAL_LABELS } from "@/lib/crm/labels";
import type { DealSort } from "@/lib/crm/deal-board-utils";

const SORT_OPTIONS: { value: DealSort; label: string }[] = [
  { value: "next_activity", label: "Next activity" },
  { value: "value", label: "Deal value" },
  { value: "expected_close", label: "Expected close date" },
  { value: "owner", label: "Owner" },
];

export function DealsFilterBar({
  users,
  view,
  pipelines,
  activePipelineSlug,
}: {
  users: { id: string; full_name: string }[];
  view: "kanban" | "list" | "forecast";
  pipelines: { id: string; name: string; slug: string }[];
  activePipelineSlug: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const owner = searchParams.get("owner") ?? "all";
  const label = searchParams.get("label") ?? "all";
  const status = searchParams.get("status"); // "won" | "lost" | null (open)
  const sort = searchParams.get("sort") ?? "next_activity";
  const arrange = searchParams.get("arrange") ?? "next_activity";

  // Any filter change resets pagination to page 1.
  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(key);
    else params.set(key, value);
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  // Pipeline links preserve view + filters (page resets — different data set).
  const pipelineHref = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("pipeline", slug);
    params.delete("page");
    return `${pathname}?${params.toString()}`;
  };

  const chipClass = (active: boolean, kind: "won" | "lost") => {
    if (!active) {
      return "border text-[var(--pd-text-secondary)] hover:text-foreground";
    }
    return kind === "won"
      ? "border border-transparent bg-[var(--pd-positive-bg)] text-[var(--pd-positive-strong)]"
      : "border border-transparent bg-[var(--pd-negative-bg)] text-[var(--pd-negative-strong)]";
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={owner}
        onValueChange={(v) => setParam("owner", v === "all" ? null : v)}
      >
        <SelectTrigger className="h-8 w-40 text-xs" aria-label="Filter by owner">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Everyone</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={label}
        onValueChange={(v) => setParam("label", v === "all" ? null : v)}
      >
        <SelectTrigger className="h-8 w-36 text-xs" aria-label="Filter by label">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All labels</SelectItem>
          {DEAL_LABELS.map((l) => (
            <SelectItem key={l.key} value={l.key}>
              <span className="flex items-center gap-2">
                <span
                  className="inline-block size-2 shrink-0 rounded-full"
                  style={{
                    background: `var(--pd-label-${l.key}-bg)`,
                    boxShadow: `inset 0 0 0 1px var(--pd-label-${l.key}-fg)`,
                  }}
                />
                {l.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Mutually exclusive won/lost chips; clicking the active chip returns to open deals. */}
      <button
        type="button"
        onClick={() => setParam("status", status === "won" ? null : "won")}
        aria-pressed={status === "won"}
        className={`h-7 rounded-full px-3 text-xs font-semibold transition ${chipClass(status === "won", "won")}`}
      >
        Won
      </button>
      <button
        type="button"
        onClick={() => setParam("status", status === "lost" ? null : "lost")}
        aria-pressed={status === "lost"}
        className={`h-7 rounded-full px-3 text-xs font-semibold transition ${chipClass(status === "lost", "lost")}`}
      >
        Lost
      </button>

      {view === "kanban" && (
        <Select value={sort} onValueChange={(v) => setParam("sort", v === "next_activity" ? null : v)}>
          <SelectTrigger className="h-8 w-44 text-xs" aria-label="Sort deals">
            <span className="text-muted-foreground">Sort:&nbsp;</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex rounded-md border bg-muted/20 p-1">
        {pipelines.map((p) => (
          <Link
            key={p.id}
            href={pipelineHref(p.slug)}
            className={`rounded px-3 py-1 text-xs font-medium transition ${
              activePipelineSlug === p.slug
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.name}
          </Link>
        ))}
      </div>

      {view === "forecast" && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0"
              aria-label="Forecast settings"
            >
              <Settings2 className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[11px] font-semibold tracking-wide text-[var(--pd-text-muted)] uppercase">
              Show by
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value="expected_close_date">
              <DropdownMenuRadioItem value="expected_close_date">
                Expected close date
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuLabel className="text-[11px] font-semibold tracking-wide text-[var(--pd-text-muted)] uppercase">
              Arrange by
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={arrange}
              onValueChange={(v) => setParam("arrange", v === "next_activity" ? null : v)}
            >
              {SORT_OPTIONS.map((o) => (
                <DropdownMenuRadioItem key={o.value} value={o.value}>
                  {o.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
