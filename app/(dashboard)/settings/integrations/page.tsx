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
    .select("provider, scopes, expires_at, updated_at, metadata")
    .eq("user_id", user.id);

  const drive = (rows ?? []).find((r) => r.provider === "google_drive");
  const gmail = (rows ?? []).find((r) => r.provider === "google_gmail");
  const gmailEmail =
    gmail && typeof gmail.metadata === "object" && gmail.metadata !== null
      ? ((gmail.metadata as { email?: string }).email ?? null)
      : null;

  const { count: emailMessageCount } = await sb
    .from("email_messages")
    .select("activity_id", { count: "exact", head: true });

  const { count: mailshakeCampaigns } = await sb
    .from("mailshake_campaigns")
    .select("id", { count: "exact", head: true });
  const { count: mailshakeLeads } = await sb
    .from("mailshake_leads")
    .select("id", { count: "exact", head: true });
  const { count: mailshakeMatchedLeads } = await sb
    .from("mailshake_leads")
    .select("id", { count: "exact", head: true })
    .not("account_id", "is", null);
  const { data: lastMailshakeSync } = await sb
    .from("mailshake_campaigns")
    .select("last_synced_at")
    .order("last_synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const mailshakeReady = Boolean(process.env.MAILSHAKE_API_KEY);

  return (
    <div className="px-6 py-5">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground text-xs">
          Per-user connections. Connecting Drive lets you attach files and generate contracts as
          yourself; the system also uses a separate service account for template copies and
          scheduled status checks.
        </p>
      </div>

      {params.integration === "connected" && (
        <div className="border-pd-positive-bg bg-pd-positive-bg-light text-pd-positive-strong mb-4 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
          <CheckCircle2 className="size-4" />
          Connected.
        </div>
      )}
      {params.integration_error && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive mb-4 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
          <AlertCircle className="size-4" />
          {params.integration_error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Mailshake</CardTitle>
              {mailshakeReady ? (
                <Badge variant="default">Live</Badge>
              ) : (
                <Badge variant="secondary">Inactive</Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              Account-level API key syncs all campaigns + per-lead status daily (08:00 UTC).
              Recipients are matched to CRM accounts by email or by Mailshake&apos;s
              <code className="mx-1">account</code>field.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Campaigns synced</span>
              <span className="tabular-nums">{mailshakeCampaigns ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Leads tracked</span>
              <span className="tabular-nums">{mailshakeLeads ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Matched to accounts</span>
              <span className="tabular-nums">
                {mailshakeMatchedLeads ?? 0}/{mailshakeLeads ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Last sync</span>
              <span>
                {lastMailshakeSync?.last_synced_at
                  ? new Date(lastMailshakeSync.last_synced_at).toLocaleString()
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Webhook secret</span>
              <span>
                {process.env.MAILSHAKE_WEBHOOK_SECRET ? (
                  <Badge variant="default" className="text-[10px]">
                    set
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    not set (unsigned events accepted)
                  </Badge>
                )}
              </span>
            </div>
            <div className="pt-1">
              <a href="/campaigns" className="text-xs underline">
                View campaigns →
              </a>
            </div>
          </CardContent>
        </Card>

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
              Scope: <code>drive.file</code> (only files the app creates or you open via Picker).
              Used for &ldquo;Attach from Drive&rdquo; and to share generated contracts as you.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Button asChild size="sm">
              <a href="/api/google-drive/connect">{drive ? "Reconnect" : "Connect Drive"}</a>
            </Button>
            {drive?.scopes && (
              <span className="text-muted-foreground text-[11px]">{drive.scopes.join(", ")}</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Gmail</CardTitle>
              {gmail ? (
                <Badge variant="default">Connected</Badge>
              ) : (
                <Badge variant="secondary">Not connected</Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              Scope: <code>gmail.readonly</code>. Per-rep — connect your own mailbox so threads with
              CRM contacts land on the account timeline. Daily sync at 09:00 UTC.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <Button asChild size="sm">
                <a href="/api/gmail/connect">{gmail ? "Reconnect" : "Connect Gmail"}</a>
              </Button>
              {gmailEmail && (
                <span className="text-muted-foreground text-[11px]">{gmailEmail}</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Messages indexed</span>
              <span className="tabular-nums">{emailMessageCount ?? 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
