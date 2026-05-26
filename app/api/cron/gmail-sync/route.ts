import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  integrationCredentials,
  integrationEventsRaw,
  emailMessages,
  users,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  listMessageIdsSince,
  getMessage,
  type GmailMessage,
} from "@/lib/integrations/google/gmail";
import { recordActivity } from "@/lib/integrations/record-activity";
import { matchEmailToContact } from "@/lib/integrations/contact-matcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const INTERNAL_DOMAIN = "@schoolconex.com";
const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

type ConnectedUser = {
  userId: string;
  email: string;
};

async function listConnectedUsers(): Promise<ConnectedUser[]> {
  const rows = await db
    .select({
      userId: integrationCredentials.userId,
      email: users.googleEmail,
    })
    .from(integrationCredentials)
    .innerJoin(users, eq(users.id, integrationCredentials.userId))
    .where(eq(integrationCredentials.provider, "google_gmail"));
  return rows.map((r) => ({ userId: r.userId, email: r.email }));
}

async function getWatermarkMs(userId: string): Promise<number> {
  const res = await db
    .select({
      ts: sql<string | null>`max(${integrationEventsRaw.receivedAt})`,
    })
    .from(integrationEventsRaw)
    .where(
      and(
        eq(integrationEventsRaw.provider, "gmail"),
        sql`${integrationEventsRaw.payload}->>'rep_user_id' = ${userId}`,
      ),
    );
  const ts = res[0]?.ts;
  if (!ts) return Date.now() - DEFAULT_LOOKBACK_MS;
  return new Date(ts).getTime() - 60_000;
}

function classify(msg: GmailMessage, repEmail: string): {
  direction: "inbound" | "outbound";
  externalAddresses: string[];
  isInternal: boolean;
} {
  const repLower = repEmail.toLowerCase();
  const fromLower = (msg.from ?? "").toLowerCase();
  const toLower = msg.to.map((a) => a.toLowerCase());
  const ccLower = msg.cc.map((a) => a.toLowerCase());
  const direction: "inbound" | "outbound" = fromLower === repLower ? "outbound" : "inbound";
  const all = [fromLower, ...toLower, ...ccLower].filter(Boolean);
  const externalAddresses = all.filter(
    (a) => a && a !== repLower && !a.endsWith(INTERNAL_DOMAIN),
  );
  const isInternal = all.length > 0 && all.every((a) => a.endsWith(INTERNAL_DOMAIN));
  return { direction, externalAddresses, isInternal };
}

async function ingest(
  rep: ConnectedUser,
  origin: string,
  msgId: string,
): Promise<"new" | "duplicate" | "skipped"> {
  const inserted = await db
    .insert(integrationEventsRaw)
    .values({
      provider: "gmail",
      eventId: msgId,
      eventType: "message",
      payload: { rep_user_id: rep.userId, message_id: msgId },
    })
    .onConflictDoNothing({
      target: [integrationEventsRaw.provider, integrationEventsRaw.eventId],
    })
    .returning({ id: integrationEventsRaw.id });
  if (!inserted[0]) return "duplicate";

  const msg = await getMessage(rep.userId, msgId, origin).catch(() => null);
  if (!msg) {
    await db
      .update(integrationEventsRaw)
      .set({ processedAt: new Date(), error: "gmail get failed" })
      .where(eq(integrationEventsRaw.id, inserted[0].id));
    return "skipped";
  }

  const { direction, externalAddresses, isInternal } = classify(msg, rep.email);

  let accountId: string | null = null;
  let contactId: string | null = null;
  if (!isInternal) {
    for (const addr of externalAddresses) {
      const match = await matchEmailToContact(addr);
      if (match) {
        accountId = match.accountId;
        contactId = match.contactId;
        break;
      }
    }
  }

  const occurredAt = msg.internalDate ? new Date(msg.internalDate) : new Date();
  const subjectShort = (msg.subject ?? "(no subject)").slice(0, 120);
  const summary = `${direction === "inbound" ? "Email from" : "Email to"} ${externalAddresses[0] ?? "(unknown)"} · ${subjectShort}${isInternal ? " · internal" : ""}`;

  const channel = direction === "inbound" ? "email_inbound" : "email_outbound";

  const activity = await recordActivity({
    channel,
    direction,
    summary,
    occurredAt,
    accountId,
    contactId,
    userId: rep.userId,
  });

  await db
    .insert(emailMessages)
    .values({
      activityId: activity.id,
      provider: "gmail",
      providerMessageId: msg.id,
      threadId: msg.threadId,
      fromAddress: msg.from,
      toAddresses: msg.to,
      ccAddresses: msg.cc,
      subject: msg.subject,
      snippet: msg.snippet,
      bodyText: msg.bodyText,
      bodyHtml: msg.bodyHtml,
      internalDate: occurredAt,
    })
    .onConflictDoNothing({ target: emailMessages.providerMessageId });

  await db
    .update(integrationEventsRaw)
    .set({ processedAt: new Date() })
    .where(eq(integrationEventsRaw.id, inserted[0].id));

  return "new";
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    if (header !== `Bearer ${secret}`) {
      return new NextResponse("unauthorized", { status: 401 });
    }
  }

  const origin = new URL(req.url).origin;
  const reps = await listConnectedUsers();
  if (reps.length === 0) {
    return NextResponse.json({
      ok: true,
      reps: 0,
      note: "no users have connected Gmail yet",
      ranAt: new Date().toISOString(),
    });
  }

  const perRep: Record<string, { pulled: number; inserted: number; skipped: number }> = {};
  let total = 0;
  let inserted = 0;

  for (const rep of reps) {
    const sinceMs = await getWatermarkMs(rep.userId);
    let pulled = 0;
    let insertedRep = 0;
    let skippedRep = 0;
    try {
      const ids = await listMessageIdsSince(rep.userId, sinceMs, origin);
      pulled = ids.length;
      for (const id of ids) {
        const result = await ingest(rep, origin, id);
        if (result === "new") {
          insertedRep++;
          inserted++;
        } else if (result === "skipped") {
          skippedRep++;
        }
        total++;
      }
    } catch (err) {
      perRep[rep.email] = {
        pulled,
        inserted: insertedRep,
        skipped: skippedRep,
      };
      return NextResponse.json(
        {
          ok: false,
          error: (err as Error).message,
          rep: rep.email,
          perRep,
        },
        { status: 500 },
      );
    }
    perRep[rep.email] = { pulled, inserted: insertedRep, skipped: skippedRep };
  }

  return NextResponse.json({
    ok: true,
    reps: reps.length,
    total,
    inserted,
    perRep,
    ranAt: new Date().toISOString(),
  });
}
