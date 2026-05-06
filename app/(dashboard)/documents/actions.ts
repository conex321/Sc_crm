"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import {
  copyTemplateAndFill,
  getFileMetadata,
} from "@/lib/integrations/google/drive";

const attachSchema = z.object({
  accountId: z.string().uuid(),
  opportunityId: z.string().uuid().optional().or(z.literal("")),
  driveFileId: z.string().min(1),
  docKind: z.enum(["contract", "proposal", "sow", "misc"]).default("misc"),
});

export async function attachDriveFile(form: FormData) {
  const user = await requireUser();
  const parsed = attachSchema.parse({
    accountId: form.get("accountId") ?? "",
    opportunityId: form.get("opportunityId") ?? "",
    driveFileId: form.get("driveFileId") ?? "",
    docKind: form.get("docKind") ?? "misc",
  });

  const meta = await getFileMetadata(user.id, parsed.driveFileId);

  const sb = await getSupabaseServerClient();
  const { error } = await sb.from("documents").insert({
    account_id: parsed.accountId,
    opportunity_id: parsed.opportunityId || null,
    drive_file_id: meta.id,
    drive_link: meta.webViewLink,
    mime_type: meta.mimeType,
    name: meta.name,
    doc_kind: parsed.docKind,
    status: "draft",
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/accounts/${parsed.accountId}`);
  if (parsed.opportunityId) revalidatePath(`/opportunities/${parsed.opportunityId}`);
}

const generateSchema = z.object({
  accountId: z.string().uuid(),
  opportunityId: z.string().uuid().optional().or(z.literal("")),
  templateId: z.string().uuid(),
  contractValue: z.string().optional(),
});

export async function generateContractFromTemplate(form: FormData) {
  const user = await requireUser();
  const parsed = generateSchema.parse({
    accountId: form.get("accountId") ?? "",
    opportunityId: form.get("opportunityId") ?? "",
    templateId: form.get("templateId") ?? "",
    contractValue: form.get("contractValue") ?? "",
  });

  const sb = await getSupabaseServerClient();
  const { data: tmpl, error: tmplErr } = await sb
    .from("contract_templates")
    .select("drive_file_id, name")
    .eq("id", parsed.templateId)
    .single();
  if (tmplErr || !tmpl) throw new Error(tmplErr?.message ?? "Template not found");

  const { data: account, error: acctErr } = await sb
    .from("accounts")
    .select("name")
    .eq("id", parsed.accountId)
    .single();
  if (acctErr || !account) throw new Error(acctErr?.message ?? "Account not found");

  let opportunityName = "";
  if (parsed.opportunityId) {
    const { data: opp } = await sb
      .from("opportunities")
      .select("name")
      .eq("id", parsed.opportunityId)
      .single();
    opportunityName = opp?.name ?? "";
  }

  const generatedFolderId = process.env.GOOGLE_DRIVE_GENERATED_FOLDER_ID;
  if (!generatedFolderId) {
    throw new Error(
      "GOOGLE_DRIVE_GENERATED_FOLDER_ID not set. Create a 'CRM Generated' folder in Drive and share with the service account.",
    );
  }

  const placeholders: Record<string, string> = {
    account_name: account.name,
    opportunity_name: opportunityName,
    contract_value: parsed.contractValue || "",
    today: new Date().toLocaleDateString(),
    rep_name: user.fullName,
    rep_email: user.googleEmail,
  };

  const newName = `${account.name} — ${tmpl.name} (${new Date().toISOString().slice(0, 10)})`;
  const file = await copyTemplateAndFill({
    templateFileId: tmpl.drive_file_id,
    generatedFolderId,
    newName,
    placeholders,
    shareWithEmail: user.googleEmail,
  });

  const { error: insertErr } = await sb.from("documents").insert({
    account_id: parsed.accountId,
    opportunity_id: parsed.opportunityId || null,
    drive_file_id: file.id,
    drive_link: file.webViewLink,
    mime_type: file.mimeType,
    name: file.name,
    doc_kind: "contract",
    status: "draft",
    generated_from_template_id: parsed.templateId,
    contract_value: parsed.contractValue ? Number(parsed.contractValue) : null,
    created_by: user.id,
    updated_by: user.id,
  });
  if (insertErr) throw new Error(insertErr.message);

  revalidatePath(`/accounts/${parsed.accountId}`);
  if (parsed.opportunityId) revalidatePath(`/opportunities/${parsed.opportunityId}`);
}

export async function setDocumentStatus(
  documentId: string,
  status: "draft" | "sent" | "signed" | "archived",
  accountId: string,
) {
  const user = await requireUser();
  const sb = await getSupabaseServerClient();
  const { error } = await sb
    .from("documents")
    .update({ status, updated_by: user.id })
    .eq("id", documentId);
  if (error) throw new Error(error.message);
  revalidatePath(`/accounts/${accountId}`);
}

export async function unlinkDocument(documentId: string, accountId: string) {
  const user = await requireUser();
  const sb = await getSupabaseServerClient();
  const { error } = await sb
    .from("documents")
    .update({ status: "archived", updated_by: user.id })
    .eq("id", documentId);
  if (error) throw new Error(error.message);
  revalidatePath(`/accounts/${accountId}`);
}
