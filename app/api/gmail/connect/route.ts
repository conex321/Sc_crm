import { NextResponse, type NextRequest } from "next/server";
import { buildGmailAuthorizationUrl } from "@/lib/integrations/google/gmail";
import { requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/settings/integrations";
  const state = `${user.id}:${encodeURIComponent(next)}`;
  const authUrl = buildGmailAuthorizationUrl(state, url.origin);
  return NextResponse.redirect(authUrl);
}
