// Shared board/list/forecast helpers. NO "server-only" — client-importable.
// `import type` from the server-only opportunities module is erased at compile
// time, so it never pulls the runtime "server-only" guard into client bundles.
import type { BoardOpportunity } from "@/lib/crm/opportunities";
import { fmtMoney } from "@/lib/format";

/** Sum a set of opps, grouping by currency, and render "CA$X + US$Y". */
export function sumByCurrency(
  opps: { amount: string | null; currency: string; stage_id: string }[],
  weighted = false,
  stages?: { id: string; probability: number }[],
): string {
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

export type DealSort = "next_activity" | "value" | "expected_close" | "owner";

/** Newest-created first — shared tiebreak for every comparator. */
function byCreatedDesc(a: BoardOpportunity, b: BoardOpportunity): number {
  return Date.parse(b.created_at) - Date.parse(a.created_at);
}

/**
 * Comparators per 02-UI-SPEC §3:
 * - next_activity: due_at asc — overdue first, undated/no-activity last,
 *   tiebreak created_at DESC (board default)
 * - value: amount desc, nulls last
 * - expected_close: asc, nulls last
 * - owner: full_name asc, unassigned last
 */
export function compareDeals(
  sort: DealSort,
): (a: BoardOpportunity, b: BoardOpportunity) => number {
  switch (sort) {
    case "next_activity":
      return (a, b) => {
        const ad = a.next_task?.due_at ? Date.parse(a.next_task.due_at) : Infinity;
        const bd = b.next_task?.due_at ? Date.parse(b.next_task.due_at) : Infinity;
        if (ad !== bd) return ad - bd;
        return byCreatedDesc(a, b);
      };
    case "value":
      return (a, b) => {
        const av = a.amount != null ? Number(a.amount) : -Infinity;
        const bv = b.amount != null ? Number(b.amount) : -Infinity;
        if (av !== bv) return bv - av;
        return byCreatedDesc(a, b);
      };
    case "expected_close":
      return (a, b) => {
        const ad = a.expected_close_date ? Date.parse(a.expected_close_date) : Infinity;
        const bd = b.expected_close_date ? Date.parse(b.expected_close_date) : Infinity;
        if (ad !== bd) return ad - bd;
        return byCreatedDesc(a, b);
      };
    case "owner":
      return (a, b) => {
        const an = a.owner?.full_name;
        const bn = b.owner?.full_name;
        if (an && bn && an !== bn) return an.localeCompare(bn);
        if (!an && bn) return 1;
        if (an && !bn) return -1;
        return byCreatedDesc(a, b);
      };
  }
}
