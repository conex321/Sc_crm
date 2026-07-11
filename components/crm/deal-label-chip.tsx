// Server-safe (no "use client") — renders a static pill.
import type { CSSProperties } from "react";
import { labelName } from "@/lib/crm/labels";

// Tailwind can't interpolate var names — explicit per-key style map over the
// fixed six-key palette (Phase 1 --pd-label-* tokens).
const LABEL_STYLES: Record<string, CSSProperties> = {
  red: { background: "var(--pd-label-red-bg)", color: "var(--pd-label-red-fg)" },
  yellow: { background: "var(--pd-label-yellow-bg)", color: "var(--pd-label-yellow-fg)" },
  blue: { background: "var(--pd-label-blue-bg)", color: "var(--pd-label-blue-fg)" },
  green: { background: "var(--pd-label-green-bg)", color: "var(--pd-label-green-fg)" },
  purple: { background: "var(--pd-label-purple-bg)", color: "var(--pd-label-purple-fg)" },
  gray: { background: "var(--pd-label-gray-bg)", color: "var(--pd-label-gray-fg)" },
};

export function DealLabelChip({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold"
      style={LABEL_STYLES[label] ?? LABEL_STYLES.gray}
    >
      {labelName(label)}
    </span>
  );
}
