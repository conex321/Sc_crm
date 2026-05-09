import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { listCampaignsWithStats, listTopSchools } from "@/lib/crm/mailshake";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function CampaignsPage(props: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const params = await props.searchParams;
  const includeArchived = params.archived !== "0";
  const [campaigns, topSchools] = await Promise.all([
    listCampaignsWithStats({ includeArchived }),
    listTopSchools(15),
  ]);

  const totalLeads = campaigns.reduce((s, c) => s + c.lead_count, 0);
  const totalEngaged = campaigns.reduce((s, c) => s + c.engaged_count, 0);
  const totalClosed = campaigns.reduce((s, c) => s + c.closed_count, 0);
  const activeCount = campaigns.filter((c) => !c.is_paused && !c.is_archived).length;
  const webhookSet = Boolean(process.env.MAILSHAKE_WEBHOOK_SECRET);

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Mailshake campaigns</h1>
          <p className="text-xs text-muted-foreground">
            {campaigns.length} campaigns · {activeCount} active · {totalLeads} engaged
            recipients ({totalEngaged} open, {totalClosed} closed). Lead pipeline
            synced every 30 min from Mailshake API.
          </p>
        </div>
        <div className="flex rounded-md border bg-muted/20 p-1">
          <Link
            href="/campaigns?archived=0"
            className={`rounded px-3 py-1 text-xs font-medium transition ${
              !includeArchived
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Active
          </Link>
          <Link
            href="/campaigns"
            className={`rounded px-3 py-1 text-xs font-medium transition ${
              includeArchived
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </Link>
        </div>
      </div>

      {!webhookSet && (
        <div className="mb-4 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>Tip · activate real-time email events:</strong> Mailshake&apos;s REST
          API only exposes <em>lead pipeline</em> status (open / closed / ignored).
          To pull individual <strong>sent / opened / clicked / replied / bounced</strong>{" "}
          events with reply text, register the webhook URL{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">
            https://&lt;your-host&gt;/api/webhooks/mailshake
          </code>{" "}
          in Mailshake → Account → Webhooks. Replies will then appear on each account&apos;s
          Activity timeline.
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No campaigns synced yet. The 30-min sync runs automatically; trigger
          manually with <code className="text-xs">npm run mailshake:sync</code>.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Engaged</TableHead>
                <TableHead className="text-right">Open</TableHead>
                <TableHead className="text-right">Closed</TableHead>
                <TableHead className="text-right">Ignored</TableHead>
                <TableHead className="text-right">Schools</TableHead>
                <TableHead className="text-right">Matched</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="max-w-[28rem]">
                    <Link
                      href={`/campaigns/${c.mailshake_id}`}
                      className="font-medium hover:underline"
                    >
                      {c.title}
                    </Link>
                    {c.sender_email ? (
                      <div className="text-[11px] text-muted-foreground">
                        {c.sender_name ? `${c.sender_name} · ` : ""}
                        {c.sender_email}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {c.is_archived ? (
                      <Badge variant="outline" className="text-[10px]">
                        archived
                      </Badge>
                    ) : c.is_paused ? (
                      <Badge variant="secondary" className="text-[10px]">
                        paused
                      </Badge>
                    ) : (
                      <Badge className="text-[10px]">active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {c.lead_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.engaged_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.closed_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.ignored_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.unique_school_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.matched_account_count}/{c.lead_count}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtDate(c.mailshake_created_at)}
                  </TableCell>
                  <TableCell>
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Mailshake <ExternalLink className="size-3" />
                      </a>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {topSchools.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-tight">
              Top schools (by engaged recipients)
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {topSchools.length} schools · ranked by total leads in pipeline, ties
              broken by closed-deal count
            </p>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead className="text-right">Engaged</TableHead>
                  <TableHead className="text-right">Closed</TableHead>
                  <TableHead className="text-right">Campaigns</TableHead>
                  <TableHead>Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topSchools.map((s) => (
                  <TableRow key={`${s.account_id ?? "x"}:${s.school_label}`}>
                    <TableCell>
                      {s.account_id ? (
                        <Link
                          href={`/accounts/${s.account_id}`}
                          className="font-medium hover:underline"
                        >
                          {s.school_label}
                        </Link>
                      ) : (
                        <span className="font-medium text-muted-foreground">
                          {s.school_label}
                        </span>
                      )}
                      {!s.account_id && (
                        <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          unmatched
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {s.total_leads}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.closed}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.campaigns}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDate(s.last_activity_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
