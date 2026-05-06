import { notFound } from "next/navigation";
import { AccountForm } from "@/components/crm/account-form";
import { updateAccount } from "../../actions";
import { getAccount } from "@/lib/crm/accounts";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditAccountPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const account = await getAccount(id);
  if (!account) notFound();

  const sb = await getSupabaseServerClient();
  const { data: users = [] } = await sb
    .from("users")
    .select("id, full_name")
    .eq("is_active", true)
    .order("full_name");

  const update = updateAccount.bind(null, id);

  return (
    <div className="px-6 py-5">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Edit · {account.name}</h1>
      </div>
      <AccountForm
        users={users ?? []}
        defaultValues={{
          name: account.name,
          type: account.type,
          website: account.website ?? "",
          address: account.address ?? "",
          phone: account.phone ?? "",
          country: account.country ?? "",
          source: account.source ?? "",
          ownerUserId: account.owner_user_id ?? "",
        }}
        action={update}
        submitLabel="Save changes"
        cancelHref={`/accounts/${id}`}
      />
    </div>
  );
}
