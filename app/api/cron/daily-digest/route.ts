import { NextResponse, type NextRequest } from "next/server";
import {
  buildRepDigests,
  digestHasContent,
  renderDigestText,
  renderDigestHtml,
} from "@/lib/integrations/digest";
import { mailerConfigured, sendMail } from "@/lib/integrations/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Daily per-rep digest. Vercel cron (07:30 ET / 11:30 UTC). Sends each active
 * user a summary of new replies, stale follow-ups, due tasks, and unmatched
 * calls — only when there's something worth saying.
 *
 * ?dry=1 renders + returns the digests without sending (also used by
 * `npm run digest:preview`). Requires CRON_SECRET like the other crons.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    if (header !== `Bearer ${secret}`) {
      return new NextResponse("unauthorized", { status: 401 });
    }
  }

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sc-crm-sand.vercel.app";

  const digests = await buildRepDigests();
  const withContent = digests.filter(digestHasContent);

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      mailerConfigured: mailerConfigured(),
      recipients: withContent.map((d) => ({
        email: d.email,
        newReplies: d.newReplies,
        staleFollowups: d.staleFollowups,
        dueTasks: d.dueTasks,
        overdueTasks: d.overdueTasks,
        unmatchedCalls: d.unmatchedCalls,
        preview: renderDigestText(d, base),
      })),
      ranAt: new Date().toISOString(),
    });
  }

  if (!mailerConfigured()) {
    return NextResponse.json({
      ok: false,
      skipped: "smtp-not-configured",
      wouldSend: withContent.length,
    });
  }

  const results: { email: string; sent: boolean; error?: string }[] = [];
  for (const d of withContent) {
    const r = await sendMail({
      to: d.email,
      subject: "Your SchoolConex CRM — today's follow-ups",
      text: renderDigestText(d, base),
      html: renderDigestHtml(d, base),
    });
    results.push({ email: d.email, sent: r.sent, error: r.error });
  }

  return NextResponse.json({
    ok: true,
    sent: results.filter((r) => r.sent).length,
    skippedNoContent: digests.length - withContent.length,
    results,
    ranAt: new Date().toISOString(),
  });
}
