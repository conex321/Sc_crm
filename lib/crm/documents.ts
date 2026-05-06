import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type DocumentRow = {
  id: string;
  account_id: string;
  opportunity_id: string | null;
  drive_file_id: string;
  drive_link: string;
  mime_type: string | null;
  name: string;
  doc_kind: "contract" | "proposal" | "sow" | "misc";
  status: "draft" | "sent" | "signed" | "archived";
  contract_value: string | null;
  generated_from_template_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function listDocumentsForAccount(accountId: string): Promise<DocumentRow[]> {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("documents")
    .select(
      "id, account_id, opportunity_id, drive_file_id, drive_link, mime_type, name, doc_kind, status, contract_value, generated_from_template_id, created_at, updated_at",
    )
    .eq("account_id", accountId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DocumentRow[];
}

export async function listDocumentsForOpportunity(
  opportunityId: string,
): Promise<DocumentRow[]> {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("documents")
    .select(
      "id, account_id, opportunity_id, drive_file_id, drive_link, mime_type, name, doc_kind, status, contract_value, generated_from_template_id, created_at, updated_at",
    )
    .eq("opportunity_id", opportunityId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DocumentRow[];
}

export async function listActiveTemplates() {
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("contract_templates")
    .select("id, name, description, drive_file_id, drive_link, is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function isDriveConnected(userId: string): Promise<boolean> {
  const sb = await getSupabaseServerClient();
  const { count, error } = await sb
    .from("integration_credentials")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("provider", "google_drive");
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
