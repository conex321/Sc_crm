import { Badge } from "@/components/ui/badge";
import type { CustomerStatus } from "@/lib/crm/accounts";

const meta: Record<
  CustomerStatus,
  { label: string; className: string }
> = {
  active: {
    label: "Customer",
    className:
      "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  inactive: {
    label: "Inactive",
    className:
      "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  prospect: {
    label: "Prospect",
    className:
      "border-transparent bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
};

export function CustomerStatusBadge({ status }: { status: CustomerStatus | null }) {
  if (!status) return null;
  const m = meta[status];
  return (
    <Badge variant="outline" className={`font-normal ${m.className}`}>
      {m.label}
    </Badge>
  );
}
