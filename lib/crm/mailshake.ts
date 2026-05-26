import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Mailshake REST sync stores every campaign recipient in `mailshake_leads`,
// then overlays `/leads/list` status for recipients that entered Mailshake's
// lead pipeline. Full email event timelines live on the activity timeline.
//
// Lead status enum (observed): recipient | open | closed | ignored.
//   recipient = campaign recipient not currently in Mailshake's lead pipeline
//   open    = engaged recipient currently in your Mailshake lead pipeline
//   closed  = lead closed (deal won / followed up off-platform)
//   ignored = lead manually dismissed
export type CampaignSummary = {
  id: string;
  mailshake_id: string;
  title: string;
  is_archived: boolean;
  is_paused: boolean;
  wizard_status: string | null;
  sender_email: string | null;
  sender_name: string | null;
  url: string | null;
  mailshake_created_at: string | null;
  last_synced_at: string;
  // aggregates
  lead_count: number;
  engaged_count: number;
  closed_count: number;
  ignored_count: number;
  matched_account_count: number;
  unique_school_count: number;
};

const ENGAGED = new Set(["open"]);
const CLOSED = new Set(["closed"]);
const IGNORED = new Set(["ignored"]);

function classify(rows: { status: string }[]) {
  let engaged = 0;
  let closed = 0;
  let ignored = 0;
  for (const r of rows) {
    const s = r.status?.toLowerCase() ?? "";
    if (ENGAGED.has(s)) engaged++;
    else if (CLOSED.has(s)) closed++;
    else if (IGNORED.has(s)) ignored++;
  }
  return { engaged, closed, ignored };
}

/**
 * List campaigns with aggregate stats. Pulls all leads in batches and
 * aggregates in memory (works for current scale; ~30 campaigns × N leads).
 */
export async function listCampaignsWithStats(opts?: {
  includeArchived?: boolean;
}): Promise<CampaignSummary[]> {
  const sb = await getSupabaseServerClient();

  let q = sb
    .from("mailshake_campaigns")
    .select(
      "id, mailshake_id, title, is_archived, is_paused, wizard_status, sender_email, sender_name, url, mailshake_created_at, last_synced_at",
    )
    .order("mailshake_created_at", { ascending: false, nullsFirst: false });
  if (!opts?.includeArchived) q = q.eq("is_archived", false);
  const { data: campaigns, error } = await q;
  if (error) throw error;
  if (!campaigns || campaigns.length === 0) return [];

  // Pull all leads for these campaigns in one shot (status + campaign + matching).
  const ids = campaigns.map((c) => c.id);
  const out: CampaignSummary[] = [];
  for (const c of campaigns) {
    const { data: leads, error: lerr } = await sb
      .from("mailshake_leads")
      .select("status, account_id, school_name")
      .eq("campaign_id", c.id);
    if (lerr) throw lerr;
    const rows = leads ?? [];
    const { engaged, closed, ignored } = classify(rows);
    const matched = rows.filter((r) => r.account_id).length;
    const schools = new Set<string>();
    for (const r of rows) {
      if (r.account_id) schools.add(`acc:${r.account_id}`);
      else if (r.school_name) schools.add(`name:${r.school_name.toLowerCase()}`);
    }
    out.push({
      id: c.id,
      mailshake_id: c.mailshake_id,
      title: c.title,
      is_archived: c.is_archived,
      is_paused: c.is_paused,
      wizard_status: c.wizard_status,
      sender_email: c.sender_email,
      sender_name: c.sender_name,
      url: c.url,
      mailshake_created_at: c.mailshake_created_at,
      last_synced_at: c.last_synced_at,
      lead_count: rows.length,
      engaged_count: engaged,
      closed_count: closed,
      ignored_count: ignored,
      matched_account_count: matched,
      unique_school_count: schools.size,
    });
  }
  // Suppress unused warning for ids
  void ids;
  return out;
}

export type LeadRow = {
  id: string;
  email: string;
  full_name: string | null;
  school_name: string | null;
  account_id: string | null;
  status: string;
  is_paused: boolean;
  opened_at: string | null;
  last_status_change_at: string | null;
  annotation: string | null;
  assigned_to_email: string | null;
  account: { id: string; name: string } | null;
};

export async function getCampaignByMailshakeId(mailshakeId: string) {
  const sb = await getSupabaseServerClient();
  const { data } = await sb
    .from("mailshake_campaigns")
    .select(
      "id, mailshake_id, title, is_archived, is_paused, wizard_status, sender_email, sender_name, url, mailshake_created_at, last_synced_at",
    )
    .eq("mailshake_id", mailshakeId)
    .maybeSingle();
  return data;
}

export async function listCampaignLeads(campaignDbId: string): Promise<LeadRow[]> {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("mailshake_leads")
    .select(
      "id, email, full_name, school_name, account_id, status, is_paused, opened_at, last_status_change_at, annotation, assigned_to_email, account:account_id(id, name)",
    )
    .eq("campaign_id", campaignDbId)
    .order("last_status_change_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as LeadRow[];
}

export type SchoolBucket = {
  account_id: string | null;
  account_name: string | null;
  school_label: string;
  total: number;
  engaged: number;
  closed: number;
  ignored: number;
  recipients: Array<{ email: string; status: string; full_name: string | null }>;
};

/**
 * For a single campaign, group leads by school (account if matched, else
 * fields.account string). Returns sorted by total desc.
 */
export async function listCampaignBySchool(campaignDbId: string): Promise<SchoolBucket[]> {
  const leads = await listCampaignLeads(campaignDbId);
  const buckets = new Map<string, SchoolBucket>();
  for (const l of leads) {
    const key = l.account_id
      ? `acc:${l.account_id}`
      : l.school_name
        ? `name:${l.school_name.toLowerCase()}`
        : `email:${l.email}`;
    const label = l.account?.name ?? l.school_name ?? l.email;
    const existing =
      buckets.get(key) ??
      ({
        account_id: l.account_id,
        account_name: l.account?.name ?? null,
        school_label: label,
        total: 0,
        engaged: 0,
        closed: 0,
        ignored: 0,
        recipients: [],
      } as SchoolBucket);
    existing.total++;
    const s = l.status.toLowerCase();
    if (ENGAGED.has(s)) existing.engaged++;
    else if (CLOSED.has(s)) existing.closed++;
    else if (IGNORED.has(s)) existing.ignored++;
    existing.recipients.push({
      email: l.email,
      status: l.status,
      full_name: l.full_name,
    });
    buckets.set(key, existing);
  }
  return Array.from(buckets.values()).sort((a, b) => b.total - a.total);
}

/**
 * For a single account, list every campaign that's touched it + status counts.
 */
export type AccountCampaignActivity = {
  campaign_id: string;
  mailshake_id: string;
  title: string;
  is_paused: boolean;
  is_archived: boolean;
  url: string | null;
  total: number;
  engaged: number;
  closed: number;
  ignored: number;
  last_activity_at: string | null;
  leads: Array<{
    email: string;
    full_name: string | null;
    status: string;
    last_status_change_at: string | null;
  }>;
};

export async function listAccountCampaignActivity(
  accountId: string,
): Promise<AccountCampaignActivity[]> {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("mailshake_leads")
    .select(
      "email, full_name, status, last_status_change_at, opened_at, mailshake_campaign_id, campaign:campaign_id(id, mailshake_id, title, is_paused, is_archived, url)",
    )
    .eq("account_id", accountId)
    .order("last_status_change_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    email: string;
    full_name: string | null;
    status: string;
    last_status_change_at: string | null;
    opened_at: string | null;
    mailshake_campaign_id: string;
    campaign: {
      id: string;
      mailshake_id: string;
      title: string;
      is_paused: boolean;
      is_archived: boolean;
      url: string | null;
    } | null;
  }>;

  const groups = new Map<string, AccountCampaignActivity>();
  for (const r of rows) {
    if (!r.campaign) continue;
    const key = r.campaign.id;
    const existing =
      groups.get(key) ??
      ({
        campaign_id: r.campaign.id,
        mailshake_id: r.campaign.mailshake_id,
        title: r.campaign.title,
        is_paused: r.campaign.is_paused,
        is_archived: r.campaign.is_archived,
        url: r.campaign.url,
        total: 0,
        engaged: 0,
        closed: 0,
        ignored: 0,
        last_activity_at: null,
        leads: [],
      } as AccountCampaignActivity);
    existing.total++;
    const s = r.status.toLowerCase();
    if (ENGAGED.has(s)) existing.engaged++;
    else if (CLOSED.has(s)) existing.closed++;
    else if (IGNORED.has(s)) existing.ignored++;
    const ts = r.last_status_change_at ?? r.opened_at;
    if (ts && (!existing.last_activity_at || ts > existing.last_activity_at)) {
      existing.last_activity_at = ts;
    }
    existing.leads.push({
      email: r.email,
      full_name: r.full_name,
      status: r.status,
      last_status_change_at: r.last_status_change_at,
    });
    groups.set(key, existing);
  }
  return Array.from(groups.values()).sort((a, b) => {
    const aT = a.last_activity_at ?? "";
    const bT = b.last_activity_at ?? "";
    return bT.localeCompare(aT);
  });
}

/**
 * Top schools across all campaigns by total reply count.
 */
export type TopSchool = {
  account_id: string | null;
  account_name: string | null;
  school_label: string;
  total_leads: number;
  closed: number;
  campaigns: number;
  last_activity_at: string | null;
};

export async function listTopSchools(limit = 25): Promise<TopSchool[]> {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("mailshake_leads")
    .select(
      "account_id, school_name, status, last_status_change_at, mailshake_campaign_id, account:account_id(name)",
    )
    .limit(20000);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{
    account_id: string | null;
    school_name: string | null;
    status: string;
    last_status_change_at: string | null;
    mailshake_campaign_id: string;
    account: { name: string } | null;
  }>;

  const groups = new Map<
    string,
    {
      account_id: string | null;
      account_name: string | null;
      school_label: string;
      total: number;
      closed: number;
      campaigns: Set<string>;
      last_activity_at: string | null;
    }
  >();
  for (const r of rows) {
    const key = r.account_id
      ? `acc:${r.account_id}`
      : r.school_name
        ? `name:${r.school_name.toLowerCase()}`
        : null;
    if (!key) continue;
    const existing = groups.get(key) ?? {
      account_id: r.account_id,
      account_name: r.account?.name ?? null,
      school_label: r.account?.name ?? r.school_name ?? "(unknown)",
      total: 0,
      closed: 0,
      campaigns: new Set<string>(),
      last_activity_at: null,
    };
    existing.total++;
    const s = r.status.toLowerCase();
    if (CLOSED.has(s)) existing.closed++;
    existing.campaigns.add(r.mailshake_campaign_id);
    if (
      r.last_status_change_at &&
      (!existing.last_activity_at || r.last_status_change_at > existing.last_activity_at)
    ) {
      existing.last_activity_at = r.last_status_change_at;
    }
    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .map((g) => ({
      account_id: g.account_id,
      account_name: g.account_name,
      school_label: g.school_label,
      total_leads: g.total,
      closed: g.closed,
      campaigns: g.campaigns.size,
      last_activity_at: g.last_activity_at,
    }))
    .sort((a, b) => b.total_leads - a.total_leads || b.closed - a.closed)
    .slice(0, limit);
}
