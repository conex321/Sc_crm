import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeForTokens, saveDriveTokens } from "@/lib/integrations/google/oauth";
import { requireUser } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const errorParam = url.searchParams.get("error");

  const [stateUserId, encodedNext] = state.split(":");
  const next = encodedNext ? decodeURIComponent(encodedNext) : "/settings/integrations";

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`${next}?integration_error=${errorParam}`, url.origin),
    );
  }
  if (!code || stateUserId !== user.id) {
    return NextResponse.redirect(
      new URL(`${next}?integration_error=invalid_state`, url.origin),
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code, url.origin);
    await saveDriveTokens(user.id, tokens);
  } catch (err) {
    const msg = err instanceof Error ? encodeURIComponent(err.message) : "exchange_failed";
    return NextResponse.redirect(
      new URL(`${next}?integration_error=${msg}`, url.origin),
    );
  }

  return NextResponse.redirect(new URL(`${next}?integration=connected`, url.origin));
}
