import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  getCampaignByMailshakeId,
  listCampaignBySchool,
} from "@/lib/crm/mailshake";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "replied" || s === "won" || s === "interested")
    return <Badge className="text-[10px]">{status}</Badge>;
  if (s === "lost" || s === "not_interested" || s === "bounced")
    return (
      <Badge variant="destructive" className="text-[10px]">
        {status}
      </Badge>
    );
  if (s === "clicked")
    return (
      <Badge variant="secondary" className="text-[10px]">
        {status}
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px]">
      {status}
    </Badge>
  );
}

export default async function CampaignDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const campaign = await getCampaignByMailshakeId(params.id);
  if (!campaign) notFound();
  const buckets = await listCampaignBySchool(campaign.id);

  const totals = buckets.reduce(
    (acc, b) => ({
      total: acc.total + b.total,
      engaged: acc.engaged + b.engaged,
      closed: acc.closed + b.closed,
      ignored: acc.ignored + b.ignored,
    }),
    { total: 0, engaged: 0, closed: 0, ignored: 0 },
  );

  const matchedSchools = buckets.filter((b) => b.account_id).length;

  return (
    <div className="px-6 py-5">
      <div className="mb-3 text-xs">
        <Link
          href="/campaigns"
          className="text-muted-foreground hover:text-foreground"
        >
          ← Campaigns
        </Link>
      </div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{campaign.title}</h1>
            {campaign.is_archived ? (
              <Badge variant="outline" className="text-[10px]">
                archived
              </Badge>
            ) : campaign.is_paused ? (
              <Badge variant="secondary" className="text-[10px]">
                paused
              </Badge>
            ) : (
              <Badge className="text-[10px]">active</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {campaign.sender_name ? `${campaign.sender_name} · ` : ""}
            {campaign.sender_email ?? "no sender"} · Mailshake id {campaign.mailshake_id}
          </p>
        </div>
        {campaign.url && (
          <a
            href={campaign.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
          >
            Open in Mailshake <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Engaged recipients" value={totals.total} bold />
        <Stat label="Open in pipeline" value={totals.engaged} />
        <Stat label="Closed" value={totals.closed} />
        <Stat label="Ignored" value={totals.ignored} />
      </div>
      <p className="mb-4 text-[11px] text-muted-foreground">
        Counts reflect Mailshake&apos;s lead-pipeline status (open / closed / ignored).
        Per-event metrics (sent · opened · clicked · replied · bounced) require
        webhook activation — see /campaigns banner.
      </p>

      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-tight">
          Schools touched ({buckets.length})
        </h2>
        <p className="text-[11px] text-muted-foreground">
          {matchedSchools}/{buckets.length} matched to CRM accounts
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>School / recipient</TableHead>
              <TableHead className="text-right">Recipients</TableHead>
              <TableHead className="text-right">Open</TableHead>
              <TableHead className="text-right">Closed</TableHead>
              <TableHead className="text-right">Ignored</TableHead>
              <TableHead>Statuses</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buckets.map((b, i) => (
              <TableRow key={i}>
                <TableCell className="max-w-[24rem]">
                  {b.account_id ? (
                    <Link
                      href={`/accounts/${b.account_id}`}
                      className="font-medium hover:underline"
                    >
                      {b.school_label}
                    </Link>
                  ) : (
                    <span className="font-medium">
                      {b.school_label}
                      <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        unmatched
                      </span>
                    </span>
                  )}
                  {b.recipients.length > 1 && (
                    <div className="text-[10px] text-muted-foreground">
                      {b.recipients
                        .slice(0, 3)
                        .map((r) => r.email)
                        .join(", ")}
                      {b.recipients.length > 3 ? ` +${b.recipients.length - 3} more` : ""}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {b.total}
                </TableCell>
                <TableCell className="text-right tabular-nums">{b.engaged}</TableCell>
                <TableCell className="text-right tabular-nums">{b.closed}</TableCell>
                <TableCell className="text-right tabular-nums">{b.ignored}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {Array.from(new Set(b.recipients.map((r) => r.status))).map((s) => (
                      <span key={s}>{statusBadge(s)}</span>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  bold,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`tabular-nums ${bold ? "text-2xl font-semibold" : "text-xl"}`}>
        {value}
      </div>
    </div>
  );
}
