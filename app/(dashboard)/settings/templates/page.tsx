import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const DRIVE_ID_PATTERN = /\/d\/([a-zA-Z0-9_-]+)/;

function extractFileId(input: string): string | null {
  const t = input.trim();
  if (/^[a-zA-Z0-9_-]{10,}$/.test(t)) return t;
  return t.match(DRIVE_ID_PATTERN)?.[1] ?? null;
}

async function addTemplate(form: FormData) {
  "use server";
  const user = await requireRole(["admin"]);
  const schema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
    driveUrlOrId: z.string().min(1),
  });
  const parsed = schema.parse({
    name: form.get("name") ?? "",
    description: form.get("description") ?? "",
    driveUrlOrId: form.get("driveUrlOrId") ?? "",
  });
  const fileId = extractFileId(parsed.driveUrlOrId);
  if (!fileId) throw new Error("Couldn't read a Drive file ID");

  const sb = await getSupabaseServerClient();
  const { error } = await sb.from("contract_templates").insert({
    name: parsed.name,
    description: parsed.description || null,
    drive_file_id: fileId,
    drive_link: `https://drive.google.com/file/d/${fileId}/view`,
    is_active: true,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings/templates");
}

async function toggleTemplateActive(templateId: string, isActive: boolean) {
  "use server";
  await requireRole(["admin"]);
  const sb = await getSupabaseServerClient();
  const { error } = await sb
    .from("contract_templates")
    .update({ is_active: isActive })
    .eq("id", templateId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/templates");
}

export default async function TemplatesPage() {
  await requireRole(["admin"]);
  const sb = await getSupabaseServerClient();
  const { data: templates = [] } = await sb
    .from("contract_templates")
    .select("id, name, description, drive_file_id, drive_link, is_active, updated_at")
    .order("name");

  return (
    <div className="px-6 py-5">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight">Contract templates</h1>
        <p className="text-xs text-muted-foreground">
          Each template is a Drive Doc shared with the service account. Reps generate
          contracts from these templates from the Documents tab on any account.
          Placeholders supported: <code>{"{{account_name}}"}</code>,{" "}
          <code>{"{{opportunity_name}}"}</code>, <code>{"{{contract_value}}"}</code>,{" "}
          <code>{"{{rep_name}}"}</code>, <code>{"{{rep_email}}"}</code>,{" "}
          <code>{"{{today}}"}</code>.
        </p>
      </div>

      <Card className="mb-5 max-w-2xl">
        <CardHeader>
          <CardTitle className="text-sm">Add a template</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={addTemplate} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required placeholder="Principal Service — Standard SOW" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea id="description" name="description" rows={2} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="driveUrlOrId">Drive URL or file ID</Label>
              <Input
                id="driveUrlOrId"
                name="driveUrlOrId"
                required
                placeholder="https://docs.google.com/document/d/…"
              />
            </div>
            <Button type="submit" size="sm" className="w-fit">
              Add template
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full">
          <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Drive</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(templates ?? []).map((t) => (
              <tr key={t.id} className="border-t [&_td]:px-3 [&_td]:py-2">
                <td>
                  <div className="font-medium">{t.name}</div>
                  {t.description && (
                    <div className="text-[11px] text-muted-foreground">
                      {t.description}
                    </div>
                  )}
                </td>
                <td>
                  <a
                    href={t.drive_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs hover:underline"
                  >
                    Open <ExternalLink className="size-3" />
                  </a>
                </td>
                <td>
                  <Badge variant={t.is_active ? "default" : "secondary"}>
                    {t.is_active ? "active" : "disabled"}
                  </Badge>
                </td>
                <td className="text-right">
                  <form
                    action={async () => {
                      "use server";
                      await toggleTemplateActive(t.id, !t.is_active);
                    }}
                  >
                    <Button type="submit" variant="ghost" size="sm">
                      {t.is_active ? "Disable" : "Enable"}
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
            {(templates ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No templates yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
