import "server-only";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

const PROVIDER = "google_gmail";

function callbackUrl(origin?: string) {
  const base = origin ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/auth/gmail-callback`;
}

export function getGmailOAuthClient(opts?: { origin?: string }) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not set in .env.local",
    );
  }
  return new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri: callbackUrl(opts?.origin),
  });
}

export function buildGmailAuthorizationUrl(state: string, origin?: string): string {
  const client = getGmailOAuthClient({ origin });
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: SCOPES,
    state,
  });
}

export async function exchangeGmailCodeForTokens(
  code: string,
  origin?: string,
): Promise<{
  access_token: string;
  refresh_token: string | null;
  expiry_date: number | null;
  scope?: string;
}> {
  const client = getGmailOAuthClient({ origin });
  const { tokens } = await client.getToken(code);
  return {
    access_token: tokens.access_token ?? "",
    refresh_token: tokens.refresh_token ?? null,
    expiry_date: tokens.expiry_date ?? null,
    scope: tokens.scope,
  };
}

export async function saveGmailTokens(
  userId: string,
  tokens: {
    access_token: string;
    refresh_token: string | null;
    expiry_date: number | null;
    scope?: string;
  },
  metadata?: { email?: string },
) {
  const sb = await getSupabaseServerClient();
  const scopes = tokens.scope ? tokens.scope.split(/\s+/) : SCOPES;
  const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null;
  const { error } = await sb.from("integration_credentials").upsert(
    {
      user_id: userId,
      provider: PROVIDER,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scopes,
      expires_at: expiresAt,
      metadata: metadata ?? {},
      created_by: userId,
      updated_by: userId,
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error(error.message);
}

export async function getGmailTokensForUser(userId: string) {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("integration_credentials")
    .select("access_token, refresh_token, expires_at, scopes, metadata")
    .eq("user_id", userId)
    .eq("provider", PROVIDER)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function getAuthedGmailClient(userId: string, origin?: string) {
  const tokens = await getGmailTokensForUser(userId);
  if (!tokens) throw new Error("Gmail not connected for this user");
  const client = getGmailOAuthClient({ origin });
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? undefined,
    expiry_date: tokens.expires_at ? new Date(tokens.expires_at).getTime() : undefined,
  });
  if (tokens.expires_at && new Date(tokens.expires_at).getTime() < Date.now() + 60_000) {
    const { credentials } = await client.refreshAccessToken();
    await saveGmailTokens(userId, {
      access_token: credentials.access_token ?? tokens.access_token,
      refresh_token: credentials.refresh_token ?? tokens.refresh_token,
      expiry_date: credentials.expiry_date ?? null,
      scope: credentials.scope,
    });
  }
  return google.gmail({ version: "v1", auth: client });
}

export type GmailMessage = {
  id: string;
  threadId: string;
  internalDate: number;
  from: string | null;
  to: string[];
  cc: string[];
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
};

function decodeBase64Url(s: string): string {
  try {
    return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

type GmailPart = {
  mimeType?: string | null;
  body?: { data?: string | null; size?: number | null } | null;
  parts?: GmailPart[];
};

function extractBody(part: GmailPart | null | undefined): {
  text: string | null;
  html: string | null;
} {
  if (!part) return { text: null, html: null };
  let text: string | null = null;
  let html: string | null = null;
  const walk = (p: GmailPart) => {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data && !text) {
      text = decodeBase64Url(p.body.data);
    } else if (p.mimeType === "text/html" && p.body?.data && !html) {
      html = decodeBase64Url(p.body.data);
    }
    if (Array.isArray(p.parts)) for (const sub of p.parts) walk(sub);
  };
  walk(part);
  return { text, html };
}

function parseAddressList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  // Quick split — preserves the bracketed email if present
  return raw
    .split(",")
    .map((s) => {
      const m = s.match(/<([^>]+)>/);
      return (m ? m[1] : s).trim();
    })
    .filter(Boolean);
}

export async function listMessageIdsSince(
  userId: string,
  afterMs: number,
  origin?: string,
): Promise<string[]> {
  const gm = await getAuthedGmailClient(userId, origin);
  const afterSec = Math.floor(afterMs / 1000);
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gm.users.messages.list({
      userId: "me",
      q: `after:${afterSec}`,
      maxResults: 100,
      pageToken,
    });
    for (const m of res.data.messages ?? []) if (m.id) ids.push(m.id);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return ids;
}

export async function getMessage(
  userId: string,
  messageId: string,
  origin?: string,
): Promise<GmailMessage | null> {
  const gm = await getAuthedGmailClient(userId, origin);
  const res = await gm.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  const msg = res.data;
  if (!msg.id) return null;
  const headers = Object.fromEntries(
    (msg.payload?.headers ?? []).map((h) => [
      (h.name ?? "").toLowerCase(),
      h.value ?? "",
    ]),
  );
  const { text, html } = extractBody(msg.payload as GmailPart);
  return {
    id: msg.id,
    threadId: msg.threadId ?? msg.id,
    internalDate: Number(msg.internalDate ?? 0),
    from: parseAddressList(headers["from"])[0] ?? null,
    to: parseAddressList(headers["to"]),
    cc: parseAddressList(headers["cc"]),
    subject: headers["subject"] ?? null,
    snippet: msg.snippet ?? null,
    bodyText: text,
    bodyHtml: html,
  };
}

export async function getGmailProfile(userId: string, origin?: string) {
  const gm = await getAuthedGmailClient(userId, origin);
  const res = await gm.users.getProfile({ userId: "me" });
  return res.data;
}
