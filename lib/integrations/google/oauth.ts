import "server-only";
import { OAuth2Client } from "google-auth-library";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
];

function callbackUrl(origin?: string) {
  const base =
    origin ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/auth/google-drive-callback`;
}

export function getDriveOAuthClient(opts?: { origin?: string }) {
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

export function buildAuthorizationUrl(state: string, origin?: string): string {
  const client = getDriveOAuthClient({ origin });
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: SCOPES,
    state,
  });
}

export async function exchangeCodeForTokens(
  code: string,
  origin?: string,
): Promise<{
  access_token: string;
  refresh_token: string | null;
  expiry_date: number | null;
  scope?: string;
}> {
  const client = getDriveOAuthClient({ origin });
  const { tokens } = await client.getToken(code);
  return {
    access_token: tokens.access_token ?? "",
    refresh_token: tokens.refresh_token ?? null,
    expiry_date: tokens.expiry_date ?? null,
    scope: tokens.scope,
  };
}

export async function saveDriveTokens(
  userId: string,
  tokens: {
    access_token: string;
    refresh_token: string | null;
    expiry_date: number | null;
    scope?: string;
  },
) {
  const sb = await getSupabaseServerClient();
  const scopes = tokens.scope ? tokens.scope.split(/\s+/) : SCOPES;
  const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null;
  const { error } = await sb.from("integration_credentials").upsert(
    {
      user_id: userId,
      provider: "google_drive",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scopes,
      expires_at: expiresAt,
      created_by: userId,
      updated_by: userId,
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error(error.message);
}

export async function getDriveTokensForUser(userId: string) {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("integration_credentials")
    .select("access_token, refresh_token, expires_at, scopes")
    .eq("user_id", userId)
    .eq("provider", "google_drive")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function getAuthedDriveClient(userId: string, origin?: string) {
  const tokens = await getDriveTokensForUser(userId);
  if (!tokens) {
    throw new Error("Google Drive not connected for this user");
  }
  const client = getDriveOAuthClient({ origin });
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? undefined,
    expiry_date: tokens.expires_at ? new Date(tokens.expires_at).getTime() : undefined,
  });

  // Refresh if needed; persist new access token if rotated.
  if (tokens.expires_at && new Date(tokens.expires_at).getTime() < Date.now() + 60_000) {
    const { credentials } = await client.refreshAccessToken();
    await saveDriveTokens(userId, {
      access_token: credentials.access_token ?? tokens.access_token,
      refresh_token: credentials.refresh_token ?? tokens.refresh_token,
      expiry_date: credentials.expiry_date ?? null,
      scope: credentials.scope,
    });
  }
  return client;
}
