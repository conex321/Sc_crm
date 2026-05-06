import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import type { OpportunityWithRefs } from "@/lib/crm/opportunities";

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function OpportunityList({
  accountId,
  opportunities,
}: {
  accountId: string;
  opportunities: OpportunityWithRefs[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button asChild size="sm">
          <Link href={`/opportunities/new?accountId=${accountId}`}>
            <Plus className="size-3.5" /> New opportunity
          </Link>
        </Button>
      </div>
      {opportunities.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
          No opportunities yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full">
            <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Pipeline</th>
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Close date</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((o) => (
                <tr
                  key={o.id}
                  className="border-t hover:bg-muted/30 [&_td]:px-3 [&_td]:py-2"
                >
                  <td>
                    <Link
                      href={`/opportunities/${o.id}`}
                      className="font-medium hover:underline"
                    >
                      {o.name}
                    </Link>
                  </td>
                  <td className="text-muted-foreground">{o.pipeline?.name ?? "—"}</td>
                  <td>
                    <Badge variant="secondary" className="text-[10px]">
                      {o.stage?.name ?? "—"}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground">
                    {o.amount ? formatter.format(Number(o.amount)) : "—"}
                  </td>
                  <td className="text-muted-foreground">
                    {o.expected_close_date
                      ? format(new Date(o.expected_close_date), "MMM d, yyyy")
                      : "—"}
                  </td>
                  <td>
                    <Badge
                      variant={
                        o.status === "won"
                          ? "default"
                          : o.status === "lost"
                            ? "destructive"
                            : "outline"
                      }
                      className="text-[10px] capitalize"
                    >
                      {o.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
