import { Badge } from "@/components/ui/badge";
import type { CustomerStatus } from "@/lib/crm/accounts";

const meta: Record<CustomerStatus, { label: string; className: string }> = {
  active: {
    label: "Customer",
    className: "border-transparent bg-pd-label-green-bg text-pd-label-green-fg",
  },
  inactive: {
    label: "Inactive",
    className: "border-transparent bg-pd-label-yellow-bg text-pd-label-yellow-fg",
  },
  prospect: {
    label: "Prospect",
    className: "border-transparent bg-pd-label-gray-bg text-pd-label-gray-fg",
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
