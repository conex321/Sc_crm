import "server-only";
import { db } from "@/lib/db";
import { activities } from "@/lib/db/schema";

type ActivityChannelLiteral = (typeof activities.channel.enumValues)[number];

export type RecordActivityInput = {
  channel: ActivityChannelLiteral;
  direction: "inbound" | "outbound" | "system";
  summary: string;
  occurredAt?: Date;
  accountId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  userId?: string | null;
};

export type RecordedActivity = { id: string };

/**
 * Single canonical entry point for inserting a parent `activities` row from
 * integration code (webhook handlers, Inngest jobs). Bypasses RLS via the
 * server-only Drizzle client (DATABASE_URL = postgres role) — safe because
 * this is only called from server code that has already verified its source.
 *
 * Pair with the appropriate child-table insert (calls / messages / etc.)
 * inside the same caller for atomicity at the application level. For higher
 * integrity, wrap both calls in a Drizzle transaction.
 */
export async function recordActivity(
  input: RecordActivityInput,
): Promise<RecordedActivity> {
  const [row] = await db
    .insert(activities)
    .values({
      channel: input.channel,
      direction: input.direction,
      summary: input.summary.slice(0, 500),
      occurredAt: input.occurredAt ?? new Date(),
      accountId: input.accountId ?? null,
      contactId: input.contactId ?? null,
      opportunityId: input.opportunityId ?? null,
      userId: input.userId ?? null,
    })
    .returning({ id: activities.id });
  if (!row) throw new Error("Failed to insert activity");
  return { id: row.id };
}
