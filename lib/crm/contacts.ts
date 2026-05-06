import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type ContactRow = {
  id: string;
  account_id: string;
  first_name: string;
  last_name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export async function listContactsForAccount(accountId: string): Promise<ContactRow[]> {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("contacts")
    .select(
      "id, account_id, first_name, last_name, role, email, phone, whatsapp_phone, is_primary, created_at, updated_at, deleted_at",
    )
    .eq("account_id", accountId)
    .is("deleted_at", null)
    .order("is_primary", { ascending: false })
    .order("last_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ContactRow[];
}

export async function getContact(id: string): Promise<ContactRow | null> {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ContactRow) ?? null;
}
