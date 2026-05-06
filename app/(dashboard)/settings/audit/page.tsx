import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function AuditLogPage() {
  await requireRole(["admin"]);
  const sb = await getSupabaseServerClient();
  const { data: rows = [] } = await sb
    .from("audit_log")
    .select(
      "id, table_name, row_id, action, occurred_at, actor:actor_user_id(id, full_name, google_email)",
    )
    .order("occurred_at", { ascending: false })
    .limit(200);

  return (
    <div className="px-6 py-5">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Audit log</h1>
        <p className="text-xs text-muted-foreground">
          Most recent 200 write events on admin-touchable tables (users, pipelines,
          stages, products, packages, contract templates).
        </p>
      </div>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Actor</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Table</th>
              <th className="px-3 py-2 font-medium">Row</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => {
              const actor = Array.isArray(r.actor) ? r.actor[0] : r.actor;
              return (
                <tr key={r.id} className="border-t [&_td]:px-3 [&_td]:py-2">
                  <td className="text-muted-foreground">
                    {format(new Date(r.occurred_at), "PPp")}
                  </td>
                  <td>{actor?.full_name ?? "—"}</td>
                  <td>
                    <Badge
                      variant={
                        r.action === "DELETE"
                          ? "destructive"
                          : r.action === "INSERT"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {r.action}
                    </Badge>
                  </td>
                  <td className="font-mono text-[11px]">{r.table_name}</td>
                  <td className="font-mono text-[10px] text-muted-foreground">
                    {r.row_id.slice(0, 8)}…
                  </td>
                </tr>
              );
            })}
            {(rows ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-xs text-muted-foreground"
                >
                  Nothing logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
