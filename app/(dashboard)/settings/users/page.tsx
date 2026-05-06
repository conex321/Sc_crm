import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { UserRoleControls } from "./role-controls";

export default async function UserRolesPage() {
  await requireRole(["admin"]);
  const sb = await getSupabaseServerClient();
  const { data: rows = [], error } = await sb
    .from("users")
    .select("id, full_name, google_email, role, is_active, created_at")
    .order("full_name");
  if (error) throw new Error(error.message);

  return (
    <div className="px-6 py-5">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Users & roles</h1>
        <p className="text-xs text-muted-foreground">
          Sign-in is restricted to @schoolconex.com Google accounts. Anyone who signs
          in is created with role <code>rep</code>; promote here.
        </p>
      </div>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((u) => (
              <tr key={u.id} className="border-t [&_td]:px-3 [&_td]:py-2">
                <td className="font-medium">{u.full_name}</td>
                <td className="text-muted-foreground">{u.google_email}</td>
                <td>
                  <UserRoleControls
                    userId={u.id}
                    role={u.role}
                    isActive={u.is_active}
                  />
                </td>
                <td>
                  <Badge variant={u.is_active ? "default" : "secondary"}>
                    {u.is_active ? "active" : "deactivated"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
