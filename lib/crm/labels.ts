// Fixed six-label palette for opportunities.label (Phase 2, per 02-UI-SPEC).
// Stores the color key; chips render via --pd-label-{key}-bg/fg tokens.
// NO "server-only" import — consumed by client components.

export type DealLabel = "red" | "yellow" | "blue" | "green" | "purple" | "gray";

export const DEAL_LABELS: { key: DealLabel; name: string }[] = [
  { key: "red", name: "Hot" },
  { key: "yellow", name: "Warm" },
  { key: "blue", name: "Cold" },
  { key: "green", name: "Qualified" },
  { key: "purple", name: "Priority" },
  { key: "gray", name: "On hold" },
];

export const labelName = (key: string) => DEAL_LABELS.find((l) => l.key === key)?.name ?? key;
