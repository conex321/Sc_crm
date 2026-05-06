import "server-only";
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY not set in .env.local");
  }
  _stripe = new Stripe(key, {
    appInfo: { name: "schoolconex-crm" },
  });
  return _stripe;
}

export function verifyStripeWebhook(
  rawBody: string | Buffer,
  signature: string | null,
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not set");
  if (!signature) throw new Error("Missing stripe-signature header");
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}
