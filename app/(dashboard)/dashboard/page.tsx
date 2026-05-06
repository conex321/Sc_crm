import { requireUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await requireUser();
  const sb = await getSupabaseServerClient();

  const [accountsRes, openOppsRes, pipelinesRes, myTasksRes] = await Promise.all([
    sb
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    sb
      .from("opportunities")
      .select("id, name, amount", { count: "exact" })
      .eq("status", "open")
      .is("deleted_at", null),
    sb
      .from("pipelines")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("name"),
    sb
      .from("tasks")
      .select("activity_id, title, due_at, completed_at, assigned_user_id")
      .eq("assigned_user_id", user.id)
      .is("completed_at", null)
      .order("due_at", { ascending: true })
      .limit(5),
  ]);

  const totalAccounts = accountsRes.count ?? 0;
  const totalOpenOpps = openOppsRes.count ?? 0;
  const pipelineValue = (openOppsRes.data ?? []).reduce(
    (acc, o) => acc + Number(o.amount ?? 0),
    0,
  );
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  return (
    <div className="px-6 py-5">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">
          Hi, {user.fullName.split(" ")[0]}
        </h1>
        <p className="text-xs text-muted-foreground">
          Quick overview of what&apos;s open and what needs you.
        </p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Active accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totalAccounts}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Open opportunities
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totalOpenOpps}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Open pipeline value
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatter.format(pipelineValue)}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pipelines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            {(pipelinesRes.data ?? []).map((p) => (
              <Link
                key={p.id}
                href={`/opportunities?pipeline=${p.slug}`}
                className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1.5 hover:bg-muted/40"
              >
                <span className="font-medium">{p.name}</span>
                <Badge variant="secondary" className="text-[10px]">
                  open
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Your open tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            {(myTasksRes.data ?? []).length === 0 ? (
              <div className="text-muted-foreground">Nothing assigned to you 👌</div>
            ) : (
              (myTasksRes.data ?? []).map((t) => (
                <div
                  key={t.activity_id}
                  className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1.5"
                >
                  <span>{t.title}</span>
                  {t.due_at && (
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(t.due_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
