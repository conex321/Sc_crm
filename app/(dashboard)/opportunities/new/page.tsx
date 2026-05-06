import { OpportunityForm } from "@/components/crm/opportunity-form";
import { createOpportunity } from "../actions";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listPipelines } from "@/lib/crm/opportunities";

export default async function NewOpportunityPage(props: {
  searchParams: Promise<{ accountId?: string; pipeline?: string }>;
}) {
  const params = await props.searchParams;
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

  const initialPipeline =
    pipelines.find((p) => p.slug === params.pipeline) ?? pipelines[0];

  return (
    <div className="px-6 py-5">
      <h1 className="mb-3 text-lg font-semibold tracking-tight">New opportunity</h1>
      <OpportunityForm
        accounts={accountsRes.data ?? []}
        pipelines={pipelines}
        stages={stagesRes.data ?? []}
        users={usersRes.data ?? []}
        contactsByAccount={contactsByAccount}
        defaults={{
          accountId: params.accountId,
          pipelineId: initialPipeline?.id,
          currency: "USD",
        }}
        action={createOpportunity}
        submitLabel="Create opportunity"
        cancelHref="/opportunities"
      />
    </div>
  );
}
