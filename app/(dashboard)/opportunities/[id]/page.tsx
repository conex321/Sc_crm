import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil } from "lucide-react";
import { format } from "date-fns";
import { getOpportunity } from "@/lib/crm/opportunities";
import { listActivitiesForOpportunity } from "@/lib/crm/activities";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { NoteComposer } from "@/components/crm/note-composer";
import { TaskComposer } from "@/components/crm/task-composer";
import { requireUser } from "@/lib/auth/session";

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default async function OpportunityDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await props.params;
  const opp = await getOpportunity(id);
  if (!opp) notFound();
  const activities = await listActivitiesForOpportunity(id, 50);

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground">
            {opp.account?.name && (
              <Link href={`/accounts/${opp.account_id}`} className="hover:underline">
                {opp.account.name}
              </Link>
            )}
            {" · "}
            {opp.pipeline?.name}
          </div>
          <h1 className="mt-0.5 text-lg font-semibold tracking-tight">{opp.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{opp.stage?.name}</Badge>
            <Badge
              variant={
                opp.status === "won"
                  ? "default"
                  : opp.status === "lost"
                    ? "destructive"
                    : "outline"
              }
              className="capitalize"
            >
              {opp.status}
            </Badge>
            <span className="text-muted-foreground">
              {opp.amount
                ? `${formatter.format(Number(opp.amount))} · ${opp.currency}`
                : "—"}
            </span>
            {opp.expected_close_date && (
              <span className="text-muted-foreground">
                Close · {format(new Date(opp.expected_close_date), "MMM d, yyyy")}
              </span>
            )}
            {opp.owner?.full_name && (
              <span className="text-muted-foreground">
                Owner · {opp.owner.full_name}
              </span>
            )}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/opportunities/${opp.id}/edit`}>
            <Pencil className="size-3.5" /> Edit
          </Link>
        </Button>
      </div>

      <Card className="mb-5">
        <CardContent className="p-4 text-xs text-muted-foreground">
          Created {format(new Date(opp.created_at), "PP")} · Updated{" "}
          {format(new Date(opp.updated_at), "PP")}
        </CardContent>
      </Card>

      <h2 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
        Activity
      </h2>
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <NoteComposer
          accountId={opp.account_id}
          opportunityId={opp.id}
        />
        <TaskComposer
          accountId={opp.account_id}
          opportunityId={opp.id}
          currentUserId={user.id}
        />
      </div>
      <ActivityTimeline activities={activities} />
    </div>
  );
}
