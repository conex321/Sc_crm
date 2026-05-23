import { NextResponse, type NextRequest } from "next/server";
import { syncAllCampaigns } from "@/lib/integrations/mailshake-sync";
import { runAutoPipeline } from "@/lib/integrations/auto-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron entry point. Calls the same syncAllCampaigns() helper that the
 * Inngest cron uses, but driven by Vercel's built-in cron scheduler so we
 * don't require Inngest Cloud credentials in production.
 *
 * Vercel injects `Authorization: Bearer ${CRON_SECRET}` automatically on
 * scheduled invocations when CRON_SECRET is set. Reject anything else.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    if (header !== `Bearer ${secret}`) {
      return new NextResponse("unauthorized", { status: 401 });
    }
  }

  if (!process.env.MAILSHAKE_API_KEY) {
    return NextResponse.json({ skipped: "no-api-key" });
  }

  try {
    const result = await syncAllCampaigns();
    const auto = await runAutoPipeline();
    return NextResponse.json({
      ok: true,
      campaigns: result.campaigns.upserted,
      leads: result.leads.upserted,
      matchedAccount: result.leads.matchedAccount,
      matchedContact: result.leads.matchedContact,
      auto,
      ranAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
