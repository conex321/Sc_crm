import "server-only";
import crypto from "node:crypto";

const API_BASE = "https://api.mailshake.com/2017-04-01";

function authHeader() {
  const key = process.env.MAILSHAKE_API_KEY;
  if (!key) throw new Error("MAILSHAKE_API_KEY not set");
  return { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` };
}

export type MailshakeRecipient = {
  emailAddress: string;
  firstName?: string;
  lastName?: string;
  campaignID?: number;
  fields?: Record<string, string>;
};

/**
 * Add a recipient to a Mailshake campaign.
 * Docs: https://api.mailshake.com/recipients/add
 */
export async function addRecipientToCampaign(opts: {
  campaignId: string | number;
  email: string;
  firstName?: string;
  lastName?: string;
  fields?: Record<string, string>;
}): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE}/recipients/add`, {
    method: "POST",
    headers: { ...authHeader(), "content-type": "application/json" },
    body: JSON.stringify({
      campaignID: Number(opts.campaignId),
      addresses: [
        {
          emailAddress: opts.email,
          firstName: opts.firstName,
          lastName: opts.lastName,
          fields: opts.fields,
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mailshake API error ${res.status}: ${text}`);
  }
  const body = (await res.json()) as { results?: { recipient?: { id?: number } }[] };
  const id = body?.results?.[0]?.recipient?.id ?? 0;
  return { id };
}

export type MailshakeCampaignSummary = {
  id: number;
  title: string;
  created?: string;
  isArchived?: boolean;
  isPaused?: boolean;
  wizardStatus?: string;
  url?: string;
  sender?: { emailAddress?: string; fromName?: string };
  messages?: Array<{ id: number; type: string; subject: string }>;
};

async function paginate<T>(initialPath: string, maxPages = 100): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${API_BASE}${initialPath}`;
  const seenTokens = new Set<string>();
  let pages = 0;
  while (url && pages < maxPages) {
    const currentUrl: string = url;
    const res = await fetch(currentUrl, { headers: { ...authHeader() } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Mailshake ${currentUrl}: ${res.status} ${text.slice(0, 200)}`);
    }
    const body = (await res.json()) as { results?: T[]; nextToken?: string };
    if (body.results) out.push(...body.results);
    pages++;
    if (body.nextToken && !seenTokens.has(body.nextToken)) {
      seenTokens.add(body.nextToken);
      const sep = currentUrl.includes("?") ? "&" : "?";
      const base = currentUrl.replace(/([?&])nextToken=[^&]*/, "").replace(/[?&]$/, "");
      url = `${base}${sep}nextToken=${encodeURIComponent(body.nextToken)}`;
    } else {
      url = null;
    }
  }
  return out;
}

export async function listCampaigns(): Promise<MailshakeCampaignSummary[]> {
  return paginate<MailshakeCampaignSummary>(`/campaigns/list?perPage=100`);
}

export type MailshakeLeadRow = {
  id: number;
  created?: string;
  openedDate?: string;
  lastStatusChangeDate?: string | null;
  annotation?: string | null;
  status: string;
  recipient: {
    id: number;
    emailAddress: string;
    fullName?: string;
    isPaused?: boolean;
    fields?: Record<string, string>;
  };
  campaign: { id: number; title?: string };
  assignedTo?: { id: number; emailAddress?: string; fullName?: string } | null;
};

/**
 * Iterate every lead for a campaign (paginated). A "lead" in Mailshake is any
 * recipient that has triggered a tracked event (open / click / reply / etc.).
 */
export async function listLeads(campaignId: number | string): Promise<MailshakeLeadRow[]> {
  return paginate<MailshakeLeadRow>(`/leads/list?campaignID=${campaignId}&perPage=100`);
}

/**
 * Verify a Mailshake webhook signature (Mailshake supports HMAC-SHA256
 * over the raw body using the configured webhook secret).
 */
export function verifyMailshakeSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.MAILSHAKE_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signatureHeader) return false;
  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(signatureHeader.replace(/^sha256=/, ""), "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export type MailshakeWebhookEvent = {
  id: string;
  type: "open" | "click" | "reply" | "bounce" | "send" | "delivered" | string;
  recipient: { emailAddress: string; firstName?: string; lastName?: string };
  campaign?: { id: number; title?: string };
  timestamp?: string;
  subject?: string;
  snippet?: string;
};

export function extractMailshakeEvent(payload: unknown): MailshakeWebhookEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const id = (p.id ?? p.eventId) as string | undefined;
  const type = p.type as string | undefined;
  const recipient = p.recipient as MailshakeWebhookEvent["recipient"] | undefined;
  if (!id || !type || !recipient?.emailAddress) return null;
  return {
    id,
    type: type as MailshakeWebhookEvent["type"],
    recipient,
    campaign: p.campaign as MailshakeWebhookEvent["campaign"] | undefined,
    timestamp: p.timestamp as string | undefined,
    subject: p.subject as string | undefined,
    snippet: p.snippet as string | undefined,
  };
}
