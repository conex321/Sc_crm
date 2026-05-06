import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizationUrl } from "@/lib/integrations/google/oauth";
import { requireUser } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/settings/integrations";
  const state = `${user.id}:${encodeURIComponent(next)}`;
  const authUrl = buildAuthorizationUrl(state, url.origin);
  return NextResponse.redirect(authUrl);
}
