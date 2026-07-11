import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getDashboardData, fmtCad } from "@/lib/crm/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Inbox, Mail, PhoneCall, Users } from "lucide-react";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function daysAgo(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "today";
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboardData(user);
  const isAdmin = user.role === "admin";

  return (
    <div className="px-6 py-5">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Hi, {user.fullName.split(" ")[0]}</h1>
        <p className="text-muted-foreground text-xs">
          {isAdmin
            ? "Business overview — team-wide numbers."
            : "Your book of business and what needs you today."}
        </p>
      </div>

      {!data.gmailConnected && (
        <div className="border-pd-info-bg bg-pd-info-bg-light mb-4 flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
          <div className="text-pd-info-strong flex items-center gap-2 text-xs">
            <Mail className="size-4 shrink-0" />
            <span>
              <strong>Connect Gmail</strong> — your email threads with schools will attach to
              account timelines automatically (read-only).
            </span>
          </div>
          <Button asChild size="sm">
            <a href="/api/gmail/connect">Connect Gmail</a>
          </Button>
        </div>
      )}

      {(data.unmatchedCount > 0 || data.overdueTasks > 0) && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {data.overdueTasks > 0 && (
            <span className="border-pd-negative-bg bg-pd-negative-bg-light text-pd-negative-strong inline-flex items-center gap-1.5 rounded-full border px-3 py-1">
              <AlertCircle className="size-3.5" />
              {data.overdueTasks} overdue task{data.overdueTasks === 1 ? "" : "s"}
            </span>
          )}
          {data.unmatchedCount > 0 && (
            <Link
              href="/inbox"
              className="border-pd-warning-bg bg-pd-warning-bg-light text-pd-warning-strong hover:bg-pd-warning-bg inline-flex items-center gap-1.5 rounded-full border px-3 py-1"
            >
              <Inbox className="size-3.5" />
              {data.unmatchedCount} unmatched call{data.unmatchedCount === 1 ? "" : "s"}/emails —
              review inbox →
            </Link>
          )}
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Follow-ups due"
          value={data.followupTotal}
          sub="open leads with no touch in 7+ days"
        />
        <Kpi
          label="Open leads"
          value={data.openLeads}
          sub={`${data.engagedLast7} engaged this week`}
        />
        <Kpi
          label={isAdmin ? "Calls · last 7 days (team)" : "Your calls · last 7 days"}
          value={data.callsLast7}
          sub={`${data.callsPrior7} the week before`}
        />
        <Kpi
          label="Emails · last 7 days"
          value={data.emailsLast7}
          sub={data.gmailConnected ? "Gmail + Mailshake" : "Mailshake only — connect Gmail"}
        />
      </div>

      {isAdmin && data.customerBook && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Customers"
            value={data.customerBook.active}
            sub={`${data.customerBook.inactive} inactive · ${data.customerBook.prospect} prospects`}
          />
          <Kpi label="Invoiced · CAD" value={fmtCad(data.customerBook.invoiced)} />
          <Kpi label="Collected · CAD" value={fmtCad(data.customerBook.paid)} />
          <Kpi
            label="Outstanding · CAD"
            value={fmtCad(data.customerBook.outstanding)}
            sub="across the customer book"
          />
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-baseline justify-between">
              <CardTitle className="text-sm">Follow-up queue</CardTitle>
              <span className="text-muted-foreground text-[11px]">
                {data.followupQueue.length} of {data.followupTotal}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            {data.followupQueue.length === 0 ? (
              <div className="text-muted-foreground">
                Nothing waiting — every open lead has a recent touch 👌
              </div>
            ) : (
              data.followupQueue.map((l) => (
                <Link
                  key={l.id}
                  href={`/accounts/${l.account_id}`}
                  className="bg-muted/20 hover:bg-muted/40 flex items-center justify-between gap-2 rounded border px-2 py-1.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {l.school_name ?? l.account_name}
                    </span>
                    <span className="text-muted-foreground block truncate text-[11px]">
                      {l.full_name ?? l.email}
                    </span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-right text-[11px]">
                    <span className="block">last touch: {daysAgo(l.last_touch_at)}</span>
                    {l.last_status_change_at && (
                      <span className="block">engaged {fmtDate(l.last_status_change_at)}</span>
                    )}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-baseline justify-between">
              <CardTitle className="text-sm">Your open tasks</CardTitle>
              {data.overdueTasks > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {data.overdueTasks} overdue
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            {data.dueTasks.length === 0 ? (
              <div className="text-muted-foreground">Nothing assigned to you 👌</div>
            ) : (
              data.dueTasks.map((t) => {
                const overdue = t.due_at && new Date(t.due_at).getTime() < Date.now();
                const inner = (
                  <>
                    <span className="truncate">{t.title}</span>
                    {t.due_at && (
                      <span
                        className={`shrink-0 text-[11px] ${
                          overdue ? "text-pd-negative-strong font-medium" : "text-muted-foreground"
                        }`}
                      >
                        {fmtDate(t.due_at)}
                      </span>
                    )}
                  </>
                );
                return t.account_id ? (
                  <Link
                    key={t.activity_id}
                    href={`/accounts/${t.account_id}`}
                    className="bg-muted/20 hover:bg-muted/40 flex items-center justify-between gap-2 rounded border px-2 py-1.5"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div
                    key={t.activity_id}
                    className="bg-muted/20 flex items-center justify-between gap-2 rounded border px-2 py-1.5"
                  >
                    {inner}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-baseline justify-between">
              <CardTitle className="text-sm">
                {isAdmin ? "Pipeline (all reps)" : "Your pipeline"}
              </CardTitle>
              <span className="text-muted-foreground text-[11px]">
                {fmtCad(data.pipelineTotal)} open · {fmtCad(data.pipelineWeighted)} weighted
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            {data.pipeline.length === 0 ? (
              <div className="text-muted-foreground">
                No open opportunities yet — create one from an account&apos;s Opportunities tab, or
                the{" "}
                <Link href="/opportunities" className="underline">
                  board
                </Link>
                .
              </div>
            ) : (
              data.pipeline.map((s) => (
                <div
                  key={`${s.pipeline}·${s.stage}`}
                  className="bg-muted/20 flex items-center justify-between rounded border px-2 py-1.5"
                >
                  <span>
                    <span className="font-medium">{s.stage}</span>{" "}
                    <span className="text-muted-foreground text-[11px]">
                      · {s.pipeline} · {s.count} deal{s.count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {fmtCad(s.total)}
                    <span className="text-muted-foreground text-[11px]">
                      {" "}
                      ({s.probability}% → {fmtCad(s.weighted)})
                    </span>
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {isAdmin && data.repActivity && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Team activity · last 7 days</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              {data.repActivity.map((r) => (
                <div
                  key={r.userId}
                  className="bg-muted/20 flex items-center justify-between rounded border px-2 py-1.5"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Users className="text-muted-foreground size-3.5" />
                    {r.name}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-3 text-[11px]">
                    <span className="inline-flex items-center gap-1">
                      <PhoneCall className="size-3" /> {r.calls}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Mail className="size-3" /> {r.emails}
                    </span>
                    <span>{r.notes} notes/tasks</span>
                    <strong className="text-foreground">{r.total}</strong>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-xs font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-muted-foreground mt-0.5 text-[11px]">{sub}</div>}
      </CardContent>
    </Card>
  );
}
