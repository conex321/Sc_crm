import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ImportHistoryPage() {
  await requireUser();
  const sb = await getSupabaseServerClient();
  // RLS: reps see their own batches; admins see all.
  const { data: batches = [], error } = await sb
    .from("import_batches")
    .select(
      "id, filename, source, status, total_rows, accounts_created, accounts_matched, contacts_created, contacts_updated, skipped_rows, created_at, creator:created_by(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Import history</h1>
          <p className="text-xs text-muted-foreground">
            Every lead import — open one to review, bulk-edit, or delete what it brought in.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/accounts/import">New import</Link>
        </Button>
      </div>

      {(batches ?? []).length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No imports yet. Start with the{" "}
          <Link href="/accounts/import" className="underline">
            import wizard
          </Link>
          .
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File / source</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Accounts new/matched</TableHead>
                <TableHead className="text-right">Contacts new/updated</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(batches ?? []).map((b) => {
                const creator = b.creator as unknown as { full_name: string } | null;
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link
                        href={`/accounts/imports/${b.id}`}
                        className="font-medium hover:underline"
                      >
                        {b.filename}
                      </Link>
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {b.source}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {creator?.full_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          b.status === "completed"
                            ? "default"
                            : b.status === "reverted"
                              ? "destructive"
                              : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{b.total_rows}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.accounts_created} / {b.accounts_matched}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {b.contacts_created} / {b.contacts_updated}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(b.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
