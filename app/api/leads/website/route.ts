import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  accounts,
  contacts,
  tasks,
  users,
  integrationEventsRaw,
} from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { recordActivity } from "@/lib/integrations/record-activity";
import { slackNotifyCard } from "@/lib/integrations/slack-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public website lead-capture endpoint. The schoolconex.com contact form POSTs
// here with a shared-secret token; we match-or-create an account+contact
// (source='website'), log an inbound activity, create a follow-up task for the
// lead owner, and ping Slack. Idempotent-ish: a repeat email enriches the same
// account rather than duplicating (same match ladder as the QuickBooks import).
//
// Env: WEBSITE_LEAD_TOKEN (required to accept), WEBSITE_LEAD_OWNER_EMAIL
// (task assignee; default rayan@schoolconex.com).

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type LeadPayload = {
  name?: string;
  email?: string;
  school?: string;
  phone?: string;
  message?: string;
  company?: string; // honeypot — real users leave this blank
  token?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
};

function splitName(full: string | undefined): { first: string; last: string } {
  const n = (full ?? "").trim();
  if (!n) return { first: "(website)", last: "lead" };
  const parts = n.split(/\s+/);
  return { first: parts[0], last: parts.slice(1).join(" ") || "" };
}

export async function POST(req: NextRequest) {
  const token = process.env.WEBSITE_LEAD_TOKEN;

  let body: LeadPayload;
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      body = (await req.json()) as LeadPayload;
    } else {
      body = Object.fromEntries(new URLSearchParams(await req.text())) as LeadPayload;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  // Auth: shared secret (header or body). If no token is configured, refuse —
  // fail closed so the endpoint can't be abused before it's wired up.
  const provided = req.headers.get("x-lead-token") ?? body.token;
  if (!token || provided !== token) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  // Honeypot: silently accept + drop bots that fill the hidden field.
  if (body.company && body.company.trim().length > 0) {
    return NextResponse.json({ ok: true });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const schoolName = (body.school ?? "").trim();
  const contactName = (body.name ?? "").trim();
  if (!email && !schoolName && !contactName) {
    return NextResponse.json({ ok: false, error: "need email, school, or name" }, { status: 400 });
  }

  // Idempotency guard on the raw event: hash of email+school within the day.
  const dedupeKey = `website:${norm(email || contactName)}:${norm(schoolName)}`;
  const rawInsert = await db
    .insert(integrationEventsRaw)
    .values({
      provider: "website",
      eventId: dedupeKey,
      eventType: "lead",
      payload: {
        email,
        school: schoolName,
        name: contactName,
        phone: body.phone ?? null,
        message: body.message ?? null,
        utm: {
          source: body.utm_source ?? null,
          medium: body.utm_medium ?? null,
          campaign: body.utm_campaign ?? null,
        },
      },
    })
    .onConflictDoNothing({ target: [integrationEventsRaw.provider, integrationEventsRaw.eventId] })
    .returning({ id: integrationEventsRaw.id });
  if (!rawInsert[0]) {
    // Already captured this exact lead — acknowledge without re-processing.
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Match-or-create account: by contact email, else by normalized school name.
  let accountId: string | null = null;
  if (email) {
    const byEmail = await db
      .select({ accountId: contacts.accountId })
      .from(contacts)
      .where(and(isNull(contacts.deletedAt), sql`lower(${contacts.email}) = ${email}`))
      .limit(1);
    if (byEmail[0]) accountId = byEmail[0].accountId;
  }
  if (!accountId && schoolName) {
    const byName = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          isNull(accounts.deletedAt),
          sql`regexp_replace(lower(${accounts.name}), '[^a-z0-9]', '', 'g') = ${norm(schoolName)}`,
        ),
      )
      .limit(1);
    if (byName[0]) accountId = byName[0].id;
  }

  // Resolve lead owner (task assignee + new-account owner).
  const ownerEmail = (process.env.WEBSITE_LEAD_OWNER_EMAIL ?? "rayan@schoolconex.com").toLowerCase();
  const ownerRows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.googleEmail}) = ${ownerEmail}`)
    .limit(1);
  const ownerId = ownerRows[0]?.id ?? null;

  let createdAccount = false;
  if (!accountId) {
    const created = await db
      .insert(accounts)
      .values({
        name: schoolName || contactName || email,
        type: "school",
        source: "website",
        email: email || null,
        phone: body.phone ?? null,
        ownerUserId: ownerId,
      })
      .returning({ id: accounts.id });
    accountId = created[0].id;
    createdAccount = true;
  }

  // Match-or-create contact on (account, lower(email)).
  let contactId: string | null = null;
  if (email) {
    const existing = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.accountId, accountId),
          isNull(contacts.deletedAt),
          sql`lower(${contacts.email}) = ${email}`,
        ),
      )
      .limit(1);
    contactId = existing[0]?.id ?? null;
  }
  if (!contactId && (email || contactName)) {
    const { first, last } = splitName(contactName);
    const created = await db
      .insert(contacts)
      .values({
        accountId,
        firstName: first,
        lastName: last,
        email: email || null,
        phone: body.phone ?? null,
        isPrimary: createdAccount,
      })
      .returning({ id: contacts.id });
    contactId = created[0].id;
  }

  // Log the inbound touch.
  const utm = [body.utm_source, body.utm_medium, body.utm_campaign].filter(Boolean).join(" / ");
  const summary = `Website inquiry${schoolName ? ` · ${schoolName}` : ""}${utm ? ` · ${utm}` : ""}${
    body.message ? ` — ${body.message.slice(0, 200)}` : ""
  }`;
  const activity = await recordActivity({
    channel: "email_inbound",
    direction: "inbound",
    summary,
    accountId,
    contactId,
    userId: ownerId,
  });

  // Follow-up task for the owner.
  await db.insert(tasks).values({
    activityId: activity.id,
    title: `New website inquiry — respond${contactName ? ` to ${contactName}` : ""}`,
    dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    assignedUserId: ownerId,
  });

  // Mark the raw event processed.
  await db
    .update(integrationEventsRaw)
    .set({ processedAt: new Date() })
    .where(eq(integrationEventsRaw.id, rawInsert[0].id));

  // Slack ping (no-ops if unconfigured).
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  await slackNotifyCard(
    "🌐 New website lead",
    [
      contactName ? `Name: ${contactName}` : "",
      email ? `Email: ${email}` : "",
      schoolName ? `School: ${schoolName}` : "",
      body.phone ? `Phone: ${body.phone}` : "",
      body.message ? `Message: ${body.message.slice(0, 300)}` : "",
      utm ? `Source: ${utm}` : "",
    ].filter(Boolean),
    base ? `${base}/accounts/${accountId}` : undefined,
  );

  return NextResponse.json({ ok: true, accountId, contactId, createdAccount });
}
