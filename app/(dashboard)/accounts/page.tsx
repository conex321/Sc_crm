import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { listAccounts } from "@/lib/crm/accounts";
import { requireUser } from "@/lib/auth/session";
import { formatDistanceToNow } from "date-fns";

export default async function AccountsPage(props: {
  searchParams: Promise<{ q?: string; mine?: string }>;
}) {
  const user = await requireUser();
  const params = await props.searchParams;
  const accounts = await listAccounts({
    search: params.q,
    ownerId: params.mine === "1" ? user.id : undefined,
  });

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Accounts</h1>
          <p className="text-xs text-muted-foreground">
            {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
            {params.mine === "1" ? " owned by you" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form className="flex items-center gap-2" action="/accounts">
            <input
              type="text"
              name="q"
              defaultValue={params.q}
              placeholder="Search…"
              className="h-8 w-56 rounded-md border bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button type="submit" size="sm" variant="outline">
              Search
            </Button>
          </form>
          <Button asChild size="sm" variant={params.mine === "1" ? "default" : "outline"}>
            <Link href={params.mine === "1" ? "/accounts" : "/accounts?mine=1"}>
              {params.mine === "1" ? "All" : "Mine"}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/accounts/new">
              <Plus className="size-3.5" /> New account
            </Link>
          </Button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No accounts yet.{" "}
          <Link href="/accounts/new" className="text-foreground underline">
            Create the first one
          </Link>
          .
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full">
            <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Country</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr
                  key={a.id}
                  className="border-t hover:bg-muted/30 [&_td]:px-3 [&_td]:py-2"
                >
                  <td>
                    <Link
                      href={`/accounts/${a.id}`}
                      className="font-medium hover:underline"
                    >
                      {a.name}
                    </Link>
                  </td>
                  <td>
                    <Badge variant="secondary" className="font-normal capitalize">
                      {a.type.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground">
                    {a.owner?.full_name ?? "—"}
                  </td>
                  <td className="text-muted-foreground">{a.phone ?? "—"}</td>
                  <td className="text-muted-foreground">{a.country ?? "—"}</td>
                  <td className="text-muted-foreground">
                    {formatDistanceToNow(new Date(a.updated_at), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
