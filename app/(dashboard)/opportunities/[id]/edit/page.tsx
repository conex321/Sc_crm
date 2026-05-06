import { notFound } from "next/navigation";
import { OpportunityForm } from "@/components/crm/opportunity-form";
import { updateOpportunity } from "../../actions";
import { getOpportunity, listPipelines } from "@/lib/crm/opportunities";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditOpportunityPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const opp = await getOpportunity(id);
  if (!opp) notFound();

  const sb = await getSupabaseServerClient();
  const [accountsRes, usersRes, contactsRes, stagesRes, pipelines] =
    await Promise.all([
      sb
        .from("accounts")
        .select("id, name")
        .is("deleted_at", null)
        .order("name")
        .limit(500),
      sb.from("users").select("id, full_name").eq("is_active", true).order("full_name"),
      sb
        .from("contacts")
        .select("id, account_id, first_name, last_name")
        .is("deleted_at", null)
        .order("last_name"),
      sb.from("pipeline_stages").select("id, pipeline_id, name, position").order("position"),
      listPipelines(),
    ]);

  const contactsByAccount: Record<string, Array<{ id: string; first_name: string; last_name: string }>> =
    {};
  for (const c of contactsRes.data ?? []) {
    (contactsByAccount[c.account_id] ??= []).push({
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
    });
  }

  const update = updateOpportunity.bind(null, id);

  return (
    <div className="px-6 py-5">
      <h1 className="mb-3 text-lg font-semibold tracking-tight">Edit · {opp.name}</h1>
      <OpportunityForm
        accounts={accountsRes.data ?? []}
        pipelines={pipelines}
        stages={stagesRes.data ?? []}
        users={usersRes.data ?? []}
        contactsByAccount={contactsByAccount}
        defaults={{
          name: opp.name,
          accountId: opp.account_id,
          pipelineId: opp.pipeline_id,
          stageId: opp.stage_id,
          amount: opp.amount ?? "",
          currency: opp.currency,
          expectedCloseDate: opp.expected_close_date ?? "",
          ownerUserId: opp.owner_user_id ?? "",
          primaryContactId: opp.primary_contact_id ?? "",
        }}
        action={update}
        submitLabel="Save changes"
        cancelHref={`/opportunities/${id}`}
      />
    </div>
  );
}
