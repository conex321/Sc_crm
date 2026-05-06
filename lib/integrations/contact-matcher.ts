import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Normalize a phone number to E.164 (best-effort) for matching.
 * - Strips formatting characters
 * - Adds + if missing and the leading digits look like a country code
 * - Falls back to last-7-digits matching for local numbers
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  // US default — most reps + clients are US-based for SchoolConex
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length > 7 ? `+${digits}` : null;
}

export function lastSeven(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-7) : null;
}

export type ContactMatch = {
  contactId: string;
  accountId: string;
  fullName: string;
};

/**
 * Match a phone number to a contact. Tries:
 *   1. Exact E.164 match on contacts.phone or contacts.whatsapp_phone
 *   2. Last-7-digits substring match (local-format fallback)
 * Returns null on no match.
 */
export async function matchPhoneToContact(
  phone: string,
): Promise<ContactMatch | null> {
  const e164 = normalizePhone(phone);
  if (!e164) return null;

  const sb = await getSupabaseServerClient();
  const { data: exact } = await sb
    .from("contacts")
    .select("id, account_id, first_name, last_name")
    .or(`phone.eq.${e164},whatsapp_phone.eq.${e164}`)
    .is("deleted_at", null)
    .limit(1);
  if (exact && exact.length > 0) {
    return {
      contactId: exact[0].id,
      accountId: exact[0].account_id,
      fullName: `${exact[0].first_name} ${exact[0].last_name}`,
    };
  }

  const last7 = lastSeven(e164);
  if (!last7) return null;

  const { data: fuzzy } = await sb
    .from("contacts")
    .select("id, account_id, first_name, last_name, phone, whatsapp_phone")
    .or(`phone.like.%${last7},whatsapp_phone.like.%${last7}`)
    .is("deleted_at", null)
    .limit(1);
  if (fuzzy && fuzzy.length > 0) {
    return {
      contactId: fuzzy[0].id,
      accountId: fuzzy[0].account_id,
      fullName: `${fuzzy[0].first_name} ${fuzzy[0].last_name}`,
    };
  }
  return null;
}

/**
 * Match an email address to a contact (case-insensitive exact).
 */
export async function matchEmailToContact(
  email: string,
): Promise<ContactMatch | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const sb = await getSupabaseServerClient();
  const { data } = await sb
    .from("contacts")
    .select("id, account_id, first_name, last_name")
    .ilike("email", normalized)
    .is("deleted_at", null)
    .limit(1);
  if (data && data.length > 0) {
    return {
      contactId: data[0].id,
      accountId: data[0].account_id,
      fullName: `${data[0].first_name} ${data[0].last_name}`,
    };
  }
  return null;
}
