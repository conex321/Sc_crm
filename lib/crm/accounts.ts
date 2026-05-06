import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AccountRow = {
  id: string;
  name: string;
  type: "school" | "aspiring_founder" | "district" | "other";
  website: string | null;
  address: string | null;
  phone: string | null;
  country: string | null;
  source: string | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type AccountWithOwner = AccountRow & {
  owner: { id: string; full_name: string } | null;
};

export async function listAccounts(filters?: {
  ownerId?: string;
  search?: string;
}): Promise<AccountWithOwner[]> {
  const sb = await getSupabaseServerClient();
  let q = sb
    .from("accounts")
    .select(
      "id, name, type, website, address, phone, country, source, owner_user_id, created_at, updated_at, deleted_at, owner:owner_user_id(id, full_name)",
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (filters?.ownerId) q = q.eq("owner_user_id", filters.ownerId);
  if (filters?.search) q = q.ilike("name", `%${filters.search}%`);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AccountWithOwner[];
}

export async function getAccount(id: string): Promise<AccountWithOwner | null> {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("accounts")
    .select(
      "id, name, type, website, address, phone, country, source, owner_user_id, created_at, updated_at, deleted_at, owner:owner_user_id(id, full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as AccountWithOwner) ?? null;
}
