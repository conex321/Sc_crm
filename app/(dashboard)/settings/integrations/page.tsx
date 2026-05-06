import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function IntegrationsPage(props: {
  searchParams: Promise<{ integration?: string; integration_error?: string }>;
}) {
  const user = await requireUser();
  const params = await props.searchParams;
  const sb = await getSupabaseServerClient();
  const { data: rows = [] } = await sb
    .from("integration_credentials")
    .select("provider, scopes, expires_at, updated_at")
    .eq("user_id", user.id);

  const drive = (rows ?? []).find((r) => r.provider === "google_drive");

  return (
    <div className="px-6 py-5">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Integrations</h1>
        <p className="text-xs text-muted-foreground">
          Per-user connections. Connecting Drive lets you attach files and generate
          contracts as yourself; the system also uses a separate service account for
          template copies and scheduled status checks.
        </p>
      </div>

      {params.integration === "connected" && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-emerald-300/50 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-700/40 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="size-4" />
          Connected.
        </div>
      )}
      {params.integration_error && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="size-4" />
          {params.integration_error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Google Drive</CardTitle>
              {drive ? (
                <Badge variant="default">Connected</Badge>
              ) : (
                <Badge variant="secondary">Not connected</Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              Scope: <code>drive.file</code> (only files the app creates or you open
              via Picker). Used for &ldquo;Attach from Drive&rdquo; and to share
              generated contracts as you.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Button asChild size="sm">
              <a href="/api/google-drive/connect">
                {drive ? "Reconnect" : "Connect Drive"}
              </a>
            </Button>
            {drive?.scopes && (
              <span className="text-[11px] text-muted-foreground">
                {drive.scopes.join(", ")}
              </span>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
