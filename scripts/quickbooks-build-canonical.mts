// Build a canonical, de-duplicated customer list from the live QBO+Stripe export
// produced by the server-side pull (.quickbooks/qbo-crm-export.json).
//
// Dedupe strategy (live QBO is authoritative — the stale 2026-05-28 review CSV is NOT):
//   1. Drop QBO "(merged into X)" shells — QBO already merged them into a surviving record.
//   2. Apply an explicit merge map for duplicates not yet merged in QBO (dup id -> primary id).
//   3. Fold Stripe customers into the matching canonical cluster by email, else by any
//      member name (displayName or companyName); collapse Stripe internal duplicates;
//      skip Stripe records that correspond to deleted QBO shells; the rest become
//      source='stripe' accounts.
// Classification: inactive if the PRIMARY QBO record is archived (Active=false) OR its last
//   invoice is older than 18 months; prospect if never invoiced; else active.
//
// Read-only over JSON. Run: tsx scripts/quickbooks-build-canonical.mts
// Output: .quickbooks/qbo-canonical.json  (git-ignored — contains customer PII)
import { readFileSync, writeFileSync } from "node:fs";

const CUTOFF = "2025-01-06"; // 18 months before 2026-07-06
const IN = ".quickbooks/qbo-crm-export.json";
const OUT = ".quickbooks/qbo-canonical.json";

// Duplicates still Active in QBO (not yet merged there) -> canonical primary.
const MERGE: Record<string, string> = {
  "255": "2", "264": "263", "77": "3", "257": "3",
  "25": "239", "267": "259", "237": "140", "7": "75", "139": "75",
  // #96 "Doon Academy" (empty shell, no invoices) -> #93 (Arjun Batra, companyName
  // "Doon Academy", has the invoices). Same school; caught as an intra-canonical
  // name collision. The two "Michelle Zhang" records (#5/#138) are deliberately NOT
  // merged: different emails + activity, likely namesakes.
  "96": "93",
};
// Deleted QBO shadow records with no value -> never import.
const SKIP = new Set(["269"]);
// Stripe records that correspond to deleted/merged QBO shells -> do not resurrect.
const STRIPE_SKIP_NAMES = new Set(["navjot", "stmaryhighschool"]);

const norm = (s: string | null | undefined) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function cleanName(c: any): string {
  let n =
    c.companyName && c.companyName !== c.displayName && !/@/.test(c.companyName)
      ? c.companyName
      : c.displayName;
  n = (n || "")
    .replace(/\s*\(merged into[^)]*\)/gi, "")
    .replace(/\s*\(deleted\)/gi, "")
    .replace(/\s+[\w.+-]+@[\w.-]+/, "")
    .trim();
  return n || c.displayName || "(unnamed)";
}

type Cluster = {
  primaryId: string;
  ids: string[];
  name: string;
  rawNames: Set<string>;
  emails: Set<string>;
  phones: Set<string>;
  addresses: Set<string>;
  websites: Set<string>;
  stripeIds: Set<string>;
  notes: string[];
  contactByEmail: Map<string, { email: string; first: string | null; last: string | null; isPrimary: boolean }>;
  billing: {
    invoiced: number; paid: number; outstanding: number;
    invoiceCount: number; paymentCount: number;
    firstInvoiceDate: string | null; lastInvoiceDate: string | null;
  };
};

function main() {
  const d = JSON.parse(readFileSync(IN, "utf8"));
  const cx: any[] = d.customers;
  const byId = new Map<string, any>(cx.map((c) => [c.qbo_id, c]));

  const mergedInto = new Map<string, string>();
  for (const c of cx) {
    const m = (c.displayName || "").match(/\(merged into ([^)]+)\)/i);
    if (m) mergedInto.set(c.qbo_id, m[1].trim());
  }
  const primaryOf = (id: string): string => (MERGE[id] ? primaryOf(MERGE[id]) : id);

  const canon = new Map<string, Cluster>();
  const skipped: { id: string; why: string; name: string }[] = [];
  for (const c of cx) {
    if (SKIP.has(c.qbo_id)) { skipped.push({ id: c.qbo_id, why: "skip-set", name: c.displayName }); continue; }
    if (mergedInto.has(c.qbo_id)) { skipped.push({ id: c.qbo_id, why: `merged->${mergedInto.get(c.qbo_id)}`, name: c.displayName }); continue; }
    const pid = primaryOf(c.qbo_id);
    if (!byId.has(pid)) { skipped.push({ id: c.qbo_id, why: `primary-missing:${pid}`, name: c.displayName }); continue; }
    if (!canon.has(pid)) {
      canon.set(pid, {
        primaryId: pid, ids: [], name: cleanName(byId.get(pid)),
        rawNames: new Set(), emails: new Set(), phones: new Set(),
        addresses: new Set(), websites: new Set(), stripeIds: new Set(), notes: [],
        contactByEmail: new Map(),
        billing: { invoiced: 0, paid: 0, outstanding: 0, invoiceCount: 0, paymentCount: 0, firstInvoiceDate: null, lastInvoiceDate: null },
      });
    }
    const g = canon.get(pid)!;
    const s = byId.get(c.qbo_id);
    g.ids.push(c.qbo_id);
    if (s.displayName) g.rawNames.add(norm(s.displayName));
    if (s.companyName) g.rawNames.add(norm(s.companyName));
    if (s.email) {
      const e = s.email.toLowerCase();
      g.emails.add(e);
      if (!g.contactByEmail.has(e))
        g.contactByEmail.set(e, {
          email: e,
          first: s.givenName || null,
          last: s.familyName || null,
          isPrimary: c.qbo_id === pid,
        });
    }
    if (s.phone) g.phones.add(s.phone);
    if (s.billAddr?.oneLine) g.addresses.add(s.billAddr.oneLine);
    if (s.website) g.websites.add(s.website);
    if (s.notes) g.notes.push(s.notes);
    const b = s.billing;
    if (b) {
      g.billing.invoiced += b.invoiced || 0;
      g.billing.paid += b.paid || 0;
      g.billing.outstanding += b.outstanding || 0;
      g.billing.invoiceCount += b.invoiceCount || 0;
      g.billing.paymentCount += b.paymentCount || 0;
      if (b.firstInvoiceDate && (!g.billing.firstInvoiceDate || b.firstInvoiceDate < g.billing.firstInvoiceDate)) g.billing.firstInvoiceDate = b.firstInvoiceDate;
      if (b.lastInvoiceDate && (!g.billing.lastInvoiceDate || b.lastInvoiceDate > g.billing.lastInvoiceDate)) g.billing.lastInvoiceDate = b.lastInvoiceDate;
    }
  }

  const clusters = [...canon.values()];

  // Stripe fold-in.
  const emailIdx = new Map<string, Cluster>();
  const nameIdx = new Map<string, Cluster>();
  for (const g of clusters) {
    for (const e of g.emails) emailIdx.set(e, g);
    for (const n of g.rawNames) if (!nameIdx.has(n)) nameIdx.set(n, g);
    nameIdx.set(norm(g.name), g);
  }
  const seen = new Map<string, Cluster>();
  const stripeNew: any[] = [];
  let stripeMatched = 0, stripeSkipped = 0;
  for (const s of d.stripeCustomers || []) {
    const key = s.email || norm(s.name);
    if (seen.has(key)) { seen.get(key)!.stripeIds.add(s.stripe_id); stripeMatched++; continue; }
    const g = (s.email && emailIdx.get(s.email)) || nameIdx.get(norm(s.name));
    if (g) { g.stripeIds.add(s.stripe_id); seen.set(key, g); stripeMatched++; }
    else if (STRIPE_SKIP_NAMES.has(norm(s.name))) stripeSkipped++;
    else stripeNew.push(s);
  }

  const status = (g: Cluster): "active" | "inactive" | "prospect" => {
    const primaryActive = byId.get(g.primaryId).active;
    if (!primaryActive) return "inactive";
    const li = g.billing.lastInvoiceDate;
    if (!li) return "prospect";
    return li >= CUTOFF ? "active" : "inactive";
  };

  const accounts = clusters.map((g) => ({
    source: "quickbooks" as const,
    name: g.name,
    customer_status: status(g),
    email: [...g.emails][0] || null,
    phone: [...g.phones][0] || null,
    address: [...g.addresses][0] || null,
    website: [...g.websites][0] || null,
    external_ids: {
      quickbooks_id: g.primaryId,
      quickbooks_ids: g.ids,
      stripe_ids: [...g.stripeIds],
    },
    billing_summary: {
      ...g.billing,
      invoiced: Math.round(g.billing.invoiced * 100) / 100,
      paid: Math.round(g.billing.paid * 100) / 100,
      outstanding: Math.round(g.billing.outstanding * 100) / 100,
      currency: "CAD",
    },
    contacts: [...g.contactByEmail.values()],
  }));

  // Genuinely new Stripe-only customers.
  for (const s of stripeNew) {
    accounts.push({
      source: "stripe" as any,
      name: s.name || s.email || "(stripe customer)",
      customer_status: "prospect",
      email: s.email || null,
      phone: null, address: null, website: null,
      external_ids: { quickbooks_id: null as any, quickbooks_ids: [], stripe_ids: [s.stripe_id] },
      billing_summary: null as any,
      contacts: s.email ? [{ email: s.email, first: null, last: null, isPrimary: true }] : [],
    });
  }

  const counts = {
    rawQboCustomers: cx.length,
    canonicalQbo: clusters.length,
    stripeOnlyNew: stripeNew.length,
    totalAccounts: accounts.length,
    active: accounts.filter((a) => a.customer_status === "active").length,
    inactive: accounts.filter((a) => a.customer_status === "inactive").length,
    prospect: accounts.filter((a) => a.customer_status === "prospect").length,
    withEmail: accounts.filter((a) => a.email).length,
    withPhone: accounts.filter((a) => a.phone).length,
    withStripe: accounts.filter((a) => a.external_ids.stripe_ids.length).length,
    contactRows: accounts.reduce((n, a) => n + a.contacts.length, 0),
    stripeMatched, stripeSkipped, mergedShells: [...mergedInto.keys()].length,
  };

  writeFileSync(OUT, JSON.stringify({ generatedAt: d.generatedAt, cutoff: CUTOFF, counts, accounts, skipped }, null, 2));
  console.log("wrote", OUT);
  console.log(JSON.stringify(counts, null, 2));
}

main();
