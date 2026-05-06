"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getStripe } from "@/lib/integrations/stripe";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { recordActivity } from "@/lib/integrations/record-activity";

/**
 * Create a Stripe invoice from this opportunity's line items.
 * Builds a one-shot invoice for the primary contact's email.
 */
export async function sendStripeInvoice(opportunityId: string) {
  const user = await requireUser();
  const sb = await getSupabaseServerClient();

  const { data: opp, error: oppErr } = await sb
    .from("opportunities")
    .select(
      "id, account_id, name, currency, account:account_id(name), primary_contact_id, contact:primary_contact_id(email, first_name, last_name)",
    )
    .eq("id", opportunityId)
    .single();
  if (oppErr || !opp) throw new Error(oppErr?.message ?? "Opportunity not found");

  const contact = Array.isArray(opp.contact) ? opp.contact[0] : opp.contact;
  if (!contact?.email) {
    throw new Error("Primary contact must have an email before invoicing");
  }

  const { data: items, error: itemsErr } = await sb
    .from("opportunity_line_items")
    .select(
      "id, quantity, unit_price, discount_pct, product:products(name, sku), pkg:packages(name)",
    )
    .eq("opportunity_id", opportunityId)
    .order("position");
  if (itemsErr) throw new Error(itemsErr.message);
  if (!items || items.length === 0) {
    throw new Error("Opportunity has no line items to invoice");
  }

  const stripe = getStripe();

  // Find or create Stripe customer
  const existing = await stripe.customers.list({ email: contact.email, limit: 1 });
  const customerId =
    existing.data[0]?.id ??
    (
      await stripe.customers.create({
        email: contact.email,
        name: `${contact.first_name} ${contact.last_name}`,
        metadata: {
          schoolconex_account_id: opp.account_id,
          schoolconex_contact_id: opp.primary_contact_id ?? "",
        },
      })
    ).id;

  // Build invoice (collection_method=send_invoice creates a hosted invoice URL)
  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: "send_invoice",
    days_until_due: 14,
    currency: opp.currency.toLowerCase(),
    metadata: {
      schoolconex_opportunity_id: opp.id,
      schoolconex_account_id: opp.account_id,
    },
  });

  if (!invoice.id) throw new Error("Stripe invoice creation returned no id");

  for (const it of items) {
    const product = Array.isArray(it.product) ? it.product[0] : it.product;
    const pkg = Array.isArray(it.pkg) ? it.pkg[0] : it.pkg;
    const description = product?.name ?? pkg?.name ?? "Line item";
    const unitMinor = Math.round(Number(it.unit_price) * 100);
    const afterDiscount = Math.round(unitMinor * (1 - it.discount_pct / 100));
    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      description,
      amount: afterDiscount * it.quantity,
      currency: opp.currency.toLowerCase(),
    });
  }

  await stripe.invoices.finalizeInvoice(invoice.id);
  const sent = await stripe.invoices.sendInvoice(invoice.id);

  // Log a contract_event-style activity (re-use channel='payment' since this
  // is invoice-not-paid; could be its own channel if we want it separate)
  await recordActivity({
    channel: "payment",
    direction: "outbound",
    summary: `Invoice sent · ${sent.hosted_invoice_url ?? invoice.id}`,
    accountId: opp.account_id,
    contactId: opp.primary_contact_id ?? null,
    opportunityId: opp.id,
    userId: user.id,
  });

  revalidatePath(`/opportunities/${opportunityId}`);
  redirect(`/opportunities/${opportunityId}?invoice=sent`);
}
