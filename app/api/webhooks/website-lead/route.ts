import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accounts,
  contacts,
  integrationEventsRaw,
  notes,
  users,
} from "@/lib/db/schema";
import { matchEmailToContact } from "@/lib/integrations/contact-matcher";
import { recordActivity } from "@/lib/integrations/record-activity";

/**
 * Inbound leads from schoolconex.com (demo / pilot / guide / quiz / chat
 * forms). Shared-secret gated: the website's /api/lead fires-and-forgets
 * here after storing its own copy.
 *
 * Creates (or matches) account + contact and records a note activity on the
 * timeline, owned by WEBSITE_LEAD_OWNER_EMAIL (default rayan@schoolconex.com).
 * No opportunity/deal is created — same convention as the import engine.
 *
 * Env:
 *   WEBSITE_LEAD_WEBHOOK_SECRET  required — endpoint 401s without it
 *   WEBSITE_LEAD_OWNER_EMAIL     optional, defaults to rayan@schoolconex.com
 * Webhook URL: ${NEXT_PUBLIC_SITE_URL}/api/webhooks/website-lead
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WebsiteLead = {
  form_type?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  organization?: string | null;
  organization_type?: string | null;
  role?: string | null;
  country?: string | null;
  student_count?: string | null;
  stage?: string | null;
  interest?: string | null;
  timeline?: string | null;
  message?: string | null;
  guide_slug?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  landing_page?: string | null;
};

function secretsMatch(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function resolveOwnerId(): Promise<string | null> {
  const email = (process.env.WEBSITE_LEAD_OWNER_EMAIL ?? "rayan@schoolconex.com")
    .trim()
    .toLowerCase();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.googleEmail}) = ${email}`)
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.WEBSITE_LEAD_WEBHOOK_SECRET;
  if (!secret || !secretsMatch(request.headers.get("x-webhook-secret"), secret)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const rawBody = await request.text();
  let lead: WebsiteLead;
  try {
    lead = JSON.parse(rawBody) as WebsiteLead;
  } catch {
    return new NextResponse("invalid JSON", { status: 400 });
  }

  const email = (lead.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new NextResponse("missing email", { status: 400 });
  }

  // Idempotency, mailshake-style: identical payloads (retries) process once.
  const eventId = createHash("sha256").update(rawBody).digest("hex");
  const inserted = await db
    .insert(integrationEventsRaw)
    .values({
      provider: "website",
      eventId,
      eventType: lead.form_type ?? "lead",
      payload: lead as object,
    })
    .onConflictDoNothing({
      target: [integrationEventsRaw.provider, integrationEventsRaw.eventId],
    })
    .returning({ id: integrationEventsRaw.id });
  if (inserted.length === 0) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const ownerId = await resolveOwnerId();
    const firstName = (lead.first_name ?? "").trim() || "(unknown)";
    const lastName = (lead.last_name ?? "").trim() || email.split("@")[0];
    const orgName =
      (lead.organization ?? "").trim() || `${firstName} ${lastName}`.trim();

    // Dedupe against existing contacts before creating anything.
    const match = await matchEmailToContact(email);
    let accountId = match?.accountId ?? null;
    let contactId = match?.contactId ?? null;

    if (!contactId) {
      if (!accountId) {
        const created = await db
          .insert(accounts)
          .values({
            name: orgName,
            type: lead.organization ? "school" : "aspiring_founder",
            email,
            phone: lead.phone ?? null,
            country: lead.country ?? null,
            source: "website",
            ownerUserId: ownerId,
            createdBy: ownerId,
            updatedBy: ownerId,
          })
          .returning({ id: accounts.id });
        accountId = created[0].id;
      }
      const createdContact = await db
        .insert(contacts)
        .values({
          accountId: accountId!,
          firstName,
          lastName,
          email,
          phone: lead.phone ?? null,
          role: lead.role ?? null,
          isPrimary: true,
          createdBy: ownerId,
          updatedBy: ownerId,
        })
        .returning({ id: contacts.id });
      contactId = createdContact[0].id;
    }

    const detailLines = [
      `Website lead — ${lead.form_type ?? "demo"} form`,
      lead.guide_slug ? `Guide/asset: ${lead.guide_slug}` : null,
      lead.organization_type ? `Org type: ${lead.organization_type}` : null,
      lead.stage ? `Stage: ${lead.stage}` : null,
      lead.student_count ? `Students: ${lead.student_count}` : null,
      lead.interest ? `Interest: ${lead.interest}` : null,
      lead.timeline ? `Timeline: ${lead.timeline}` : null,
      lead.message ? `Message: ${lead.message}` : null,
      lead.landing_page ? `Landing page: ${lead.landing_page}` : null,
      lead.utm_source
        ? `UTM: ${[lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(" / ")}`
        : null,
    ].filter(Boolean);

    const activity = await recordActivity({
      channel: "note",
      direction: "inbound",
      summary: `Website lead (${lead.form_type ?? "demo"}): ${firstName} ${lastName} <${email}>${lead.organization ? ` — ${lead.organization}` : ""}`,
      accountId: accountId ?? undefined,
      contactId: contactId ?? undefined,
      userId: ownerId ?? undefined,
    });
    await db.insert(notes).values({
      activityId: activity.id,
      body: detailLines.join("\n"),
    });

    await db
      .update(integrationEventsRaw)
      .set({ processedAt: new Date() })
      .where(sql`${integrationEventsRaw.id} = ${inserted[0].id}`);

    return NextResponse.json({ ok: true, accountId, contactId });
  } catch (err) {
    console.error("[website-lead] processing failed:", err);
    await db
      .update(integrationEventsRaw)
      .set({ error: String(err).slice(0, 500) })
      .where(sql`${integrationEventsRaw.id} = ${inserted[0].id}`);
    return new NextResponse("processing failed", { status: 500 });
  }
}
