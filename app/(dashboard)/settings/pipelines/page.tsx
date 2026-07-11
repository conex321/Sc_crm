import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { RotDaysInput } from "./rot-days-input";

export default async function PipelinesAdminPage() {
  await requireRole(["admin"]);
  const sb = await getSupabaseServerClient();

  const { data: pipelines } = await sb
    .from("pipelines")
    .select("id, name, slug, service_line, is_active")
    .order("name");

  const { data: stages } = await sb
    .from("pipeline_stages")
    .select("id, pipeline_id, name, position, probability, is_won, is_lost, rot_days")
    .order("position");

  return (
    <div className="px-6 py-5">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Pipelines</h1>
        <p className="text-xs text-muted-foreground">
          Phase 1 ships read-only pipeline view. CRUD editor lands in a follow-up.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(pipelines ?? []).map((p) => {
          const ps = (stages ?? []).filter((s) => s.pipeline_id === p.id);
          return (
            <Card key={p.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{p.name}</h3>
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {p.service_line.replace("_", " ")}
                  </Badge>
                </div>
                <ol className="space-y-1 text-xs">
                  {ps.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1"
                    >
                      <span>
                        {s.position}. {s.name}
                      </span>
                      <span className="flex items-center gap-2">
                        {!s.is_won && !s.is_lost && (
                          <RotDaysInput stageId={s.id} initialRotDays={s.rot_days} />
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {s.is_won
                            ? "won"
                            : s.is_lost
                              ? "lost"
                              : `${s.probability}%`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
