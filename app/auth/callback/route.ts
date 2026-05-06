import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/accounts";
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(new URL(`/login?error=exchange`, url.origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL(`/login?error=exchange`, url.origin));
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Check if the failure is a domain-mismatch (the DB trigger raised).
    const isDomainViolation =
      error.message?.includes("not allowed") || error.message?.includes("domain");
    return NextResponse.redirect(
      new URL(`/login?error=${isDomainViolation ? "domain" : "exchange"}`, url.origin),
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
