import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeGmailCodeForTokens,
  saveGmailTokens,
  getGmailProfile,
} from "@/lib/integrations/google/gmail";
import { requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const tokens = await exchangeGmailCodeForTokens(code, url.origin);
    await saveGmailTokens(user.id, tokens);
    // Best-effort: stamp connected email for display, ignore failures.
    try {
      const profile = await getGmailProfile(user.id, url.origin);
      if (profile.emailAddress) {
        await saveGmailTokens(user.id, tokens, { email: profile.emailAddress });
      }
    } catch {
      /* non-fatal */
    }
  } catch (err) {
    const msg = err instanceof Error ? encodeURIComponent(err.message) : "exchange_failed";
    return NextResponse.redirect(
      new URL(`${next}?integration_error=${msg}`, url.origin),
    );
  }

  return NextResponse.redirect(
    new URL(`${next}?integration=gmail_connected`, url.origin),
  );
}
