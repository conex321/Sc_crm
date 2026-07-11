import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Upload } from "lucide-react";
import { listAccounts, type CustomerStatus } from "@/lib/crm/accounts";
import { CustomerStatusBadge } from "@/components/crm/customer-status-badge";
import { requireUser } from "@/lib/auth/session";
import { formatDistanceToNow } from "date-fns";

const STATUS_TABS: { key: string; label: string; status?: CustomerStatus; customersOnly?: boolean }[] = [
  { key: "all", label: "All" },
  { key: "customers", label: "Customers", customersOnly: true },
  { key: "active", label: "Active", status: "active" },
  { key: "inactive", label: "Inactive", status: "inactive" },
  { key: "prospect", label: "Prospects", status: "prospect" },
];

export default async function AccountsPage(props: {
  searchParams: Promise<{ q?: string; mine?: string; status?: string }>;
}) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const params = await props.searchParams;
  const tab = STATUS_TABS.find((t) => t.key === params.status) ?? STATUS_TABS[0];
  const accounts = await listAccounts({
    search: params.q,
    ownerId: params.mine === "1" ? user.id : undefined,
    customerStatus: tab.status,
    customersOnly: tab.customersOnly,
  });
  const qs = (extra: Record<string, string | undefined>) => {
    // Base = current filters; keys in `extra` override (undefined removes).
    const merged: Record<string, string | undefined> = {
      q: params.q,
      mine: params.mine === "1" ? "1" : undefined,
      status: params.status,
      ...extra,
    };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `/accounts?${s}` : "/accounts";
  };

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
            {/* Preserve the active status tab + owner filter across a search. */}
            {params.status && <input type="hidden" name="status" value={params.status} />}
            {params.mine === "1" && <input type="hidden" name="mine" value="1" />}
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
            <Link href={qs({ mine: params.mine === "1" ? undefined : "1" })}>
              {params.mine === "1" ? "All" : "Mine"}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/accounts/import">
              <Upload className="size-3.5" /> Import
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/accounts/new">
              <Plus className="size-3.5" /> New account
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {STATUS_TABS.map((t) => (
          <Button
            key={t.key}
            asChild
            size="sm"
            variant={tab.key === t.key ? "default" : "outline"}
            className="h-7 text-xs"
          >
            <Link href={qs({ status: t.key === "all" ? undefined : t.key })}>{t.label}</Link>
          </Button>
        ))}
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
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                {isAdmin && <th className="px-3 py-2 font-medium">Outstanding</th>}
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
                    <CustomerStatusBadge status={a.customer_status} />
                  </td>
                  <td>
                    <Badge variant="secondary" className="font-normal capitalize">
                      {a.type.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground">
                    {a.owner?.full_name ?? "—"}
                  </td>
                  {isAdmin && (
                    <td className="tabular-nums text-muted-foreground">
                      {typeof a.billing_summary?.outstanding === "number"
                        ? `CA$${a.billing_summary.outstanding.toLocaleString()}`
                        : "—"}
                    </td>
                  )}
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
