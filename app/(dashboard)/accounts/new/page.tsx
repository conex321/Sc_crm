import { AccountForm } from "@/components/crm/account-form";
import { createAccount } from "../actions";
import { getSupabaseServerClient } from "@/lib/supabase/server";

async function listUsersForOwnerSelect() {
  const sb = await getSupabaseServerClient();
  const { data } = await sb
    .from("users")
    .select("id, full_name")
    .eq("is_active", true)
    .order("full_name");
  return data ?? [];
}

export default async function NewAccountPage() {
  const users = await listUsersForOwnerSelect();
  return (
    <div className="px-6 py-5">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">New account</h1>
        <p className="text-xs text-muted-foreground">
          Create a new account for a school or aspiring founder.
        </p>
      </div>
      <AccountForm
        users={users}
        action={createAccount}
        submitLabel="Create account"
        cancelHref="/accounts"
      />
    </div>
  );
}
