import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { ImportBatchRowsTable, type BatchRow } from "@/components/crm/import-batch-rows-table";

export default async function ImportBatchPage(props: {
  params: Promise<{ batchId: string }>;
}) {
  await requireUser();
  const { batchId } = await props.params;
  const sb = await getSupabaseServerClient();

  const { data: batch } = await sb
    .from("import_batches")
    .select(
      "id, filename, source, status, total_rows, accounts_created, accounts_matched, contacts_created, contacts_updated, skipped_rows, error_rows, created_at",
    )
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) notFound();

  // Paginate lineage — PostgREST caps single responses at ~1000 rows.
  const rows: unknown[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 10_000; from += PAGE) {
    const { data } = await sb
      .from("import_batch_rows")
      .select(
        "id, row_index, account_id, contact_id, account_action, contact_action, error, account:account_id(id, name, country, type, source, deleted_at, owner:owner_user_id(full_name)), contact:contact_id(first_name, last_name, email)",
      )
      .eq("batch_id", batchId)
      .order("row_index", { ascending: true })
      .range(from, from + PAGE - 1);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  const { data: users = [] } = await sb
    .from("users")
    .select("id, full_name")
    .eq("is_active", true)
    .order("full_name");

  return (
    <div className="px-6 py-5">
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-lg font-semibold tracking-tight">{batch.filename}</h1>
        <Badge
          variant={
            batch.status === "completed"
              ? "default"
              : batch.status === "reverted"
                ? "destructive"
                : "secondary"
          }
          className="text-[10px]"
        >
          {batch.status}
        </Badge>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {batch.source} · {new Date(batch.created_at).toLocaleString()} · {batch.total_rows} rows ·{" "}
        {batch.accounts_created} new / {batch.accounts_matched} matched accounts ·{" "}
        {batch.contacts_created} new contacts ·{" "}
        <Link href="/accounts/imports" className="underline">
          all imports
        </Link>
      </p>

      <ImportBatchRowsTable
        batchId={batch.id}
        batchStatus={batch.status}
        rows={rows as BatchRow[]}
        users={users ?? []}
      />
    </div>
  );
}
