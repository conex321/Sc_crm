import { inngest } from "../client";
import { db } from "@/lib/db";
import { integrationEventsRaw, payments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { recordActivity } from "@/lib/integrations/record-activity";
import { matchEmailToContact } from "@/lib/integrations/contact-matcher";
import type Stripe from "stripe";

const HANDLED_EVENT_TYPES = new Set([
  "payment_intent.succeeded",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
]);

function moneyFromMinorUnit(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return null;
  // Most currencies are minor-units × 100; ISO zero-decimal currencies (JPY, etc.)
  // would need special handling. SchoolConex is USD-default → fine for v1.
  void currency;
  return amount / 100;
}

export const stripeProcessEvent = inngest.createFunction(
  {
    id: "stripe-process-event",
    concurrency: 10,
    retries: 3,
    triggers: [{ event: "stripe/event.received" }],
  },
  async ({ event, step, logger }) => {
    const rawEventId = event.data.rawEventId as string;

    const raw = await step.run("load-raw", async () => {
      const rows = await db
        .select()
        .from(integrationEventsRaw)
        .where(eq(integrationEventsRaw.id, rawEventId))
        .limit(1);
      return rows[0];
    });
    if (!raw) return { skipped: true };

    const stripeEvent = raw.payload as unknown as Stripe.Event;
    if (!HANDLED_EVENT_TYPES.has(stripeEvent.type)) {
      await db
        .update(integrationEventsRaw)
        .set({ processedAt: new Date() })
        .where(eq(integrationEventsRaw.id, rawEventId));
      return { skipped: true, reason: "unhandled-type" };
    }

    let summary = `Stripe ${stripeEvent.type}`;
    let amountMinor: number | null = null;
    let currency: string | null = null;
    let status: string | null = null;
    let stripePaymentIntentId: string | null = null;
    let stripeInvoiceId: string | null = null;
    let customerEmail: string | null = null;

    if (stripeEvent.type === "payment_intent.succeeded") {
      const pi = stripeEvent.data.object as Stripe.PaymentIntent;
      amountMinor = pi.amount_received;
      currency = pi.currency;
      status = pi.status;
      stripePaymentIntentId = pi.id;
      customerEmail = pi.receipt_email ?? null;
      summary = `Payment received · $${(amountMinor / 100).toFixed(2)} ${currency?.toUpperCase()}`;
    } else if (stripeEvent.type === "invoice.paid") {
      const inv = stripeEvent.data.object as Stripe.Invoice;
      amountMinor = inv.amount_paid;
      currency = inv.currency;
      status = inv.status ?? null;
      stripeInvoiceId = inv.id ?? null;
      // Stripe API versions differ on where the payment intent surfaces;
      // older expanded under inv.payment_intent, newer exposes it via
      // inv.payments[]. Handle both.
      stripePaymentIntentId =
        ((inv as unknown as { payment_intent?: string }).payment_intent ??
          (inv as unknown as { payments?: { payment?: string }[] }).payments?.[0]
            ?.payment) ?? null;
      customerEmail = inv.customer_email ?? null;
      summary = `Invoice paid · $${(amountMinor / 100).toFixed(2)} ${currency?.toUpperCase()}`;
    } else if (stripeEvent.type === "invoice.payment_failed") {
      const inv = stripeEvent.data.object as Stripe.Invoice;
      amountMinor = inv.amount_due;
      currency = inv.currency;
      status = inv.status ?? "uncollectible";
      stripeInvoiceId = inv.id ?? null;
      customerEmail = inv.customer_email ?? null;
      summary = `Invoice payment failed · $${(amountMinor / 100).toFixed(2)} ${currency?.toUpperCase()}`;
    }

    let match = null;
    if (customerEmail) {
      match = await step.run("match-email", () => matchEmailToContact(customerEmail!));
    }

    await step.run("write-activity", async () => {
      const a = await recordActivity({
        channel: "payment",
        direction: "system",
        summary,
        accountId: match?.accountId ?? null,
        contactId: match?.contactId ?? null,
      });
      await db
        .insert(payments)
        .values({
          activityId: a.id,
          stripePaymentIntentId,
          stripeInvoiceId,
          amount: amountMinor != null ? String(moneyFromMinorUnit(amountMinor, currency)) : null,
          currency,
          status,
        })
        .onConflictDoNothing({ target: payments.stripePaymentIntentId });
    });

    await db
      .update(integrationEventsRaw)
      .set({ processedAt: new Date() })
      .where(eq(integrationEventsRaw.id, rawEventId));

    logger.info(`Stripe ${stripeEvent.type} processed`);
    return { matched: Boolean(match) };
  },
);
