import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { listPipelines, listStagesForPipeline, listOpportunitiesByPipeline } from "@/lib/crm/opportunities";
import { PipelineBoard } from "@/components/crm/pipeline-board";
import { requireUser } from "@/lib/auth/session";

export default async function OpportunitiesPage(props: {
  searchParams: Promise<{ pipeline?: string }>;
}) {
  const params = await props.searchParams;
  const user = await requireUser();
  const pipelines = await listPipelines();

  const activePipeline =
    pipelines.find((p) => p.slug === params.pipeline) ?? pipelines[0];

  if (!activePipeline) {
    return (
      <div className="px-6 py-5">
        <h1 className="text-lg font-semibold tracking-tight">Opportunities</h1>
        <div className="mt-6 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No pipelines yet. Ask an admin to create one in{" "}
          <Link href="/settings/pipelines" className="underline">
            Settings → Pipelines
          </Link>
          .
        </div>
      </div>
    );
  }

  const [stages, opportunities] = await Promise.all([
    listStagesForPipeline(activePipeline.id),
    listOpportunitiesByPipeline(activePipeline.id),
  ]);

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Opportunities</h1>
          <p className="text-xs text-muted-foreground">
            {opportunities.length} open · drag cards to change stage
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border bg-muted/20 p-1">
            {pipelines.map((p) => (
              <Link
                key={p.id}
                href={`/opportunities?pipeline=${p.slug}`}
                className={`rounded px-3 py-1 text-xs font-medium transition ${
                  activePipeline.slug === p.slug
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.name}
              </Link>
            ))}
          </div>
          <Button asChild size="sm">
            <Link href={`/opportunities/new?pipeline=${activePipeline.slug}`}>
              <Plus className="size-3.5" /> New opportunity
            </Link>
          </Button>
        </div>
      </div>

      <PipelineBoard
        stages={stages}
        initialOpportunities={opportunities}
        currentUserId={user.id}
      />
    </div>
  );
}
