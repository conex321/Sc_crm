"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

const noteSchema = z.object({
  accountId: z.string().uuid().optional().or(z.literal("")),
  contactId: z.string().uuid().optional().or(z.literal("")),
  opportunityId: z.string().uuid().optional().or(z.literal("")),
  body: z.string().trim().min(1, "Body is required").max(5000),
});

const taskSchema = z.object({
  accountId: z.string().uuid().optional().or(z.literal("")),
  contactId: z.string().uuid().optional().or(z.literal("")),
  opportunityId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(1).max(200),
  dueAt: z.string().optional(),
  assignedUserId: z.string().uuid().optional().or(z.literal("")),
});

function nullable(v: string | undefined): string | null {
  return v && v.length > 0 ? v : null;
}

export async function createNote(form: FormData) {
  await requireUser();
  const parsed = noteSchema.parse({
    accountId: form.get("accountId") ?? "",
    contactId: form.get("contactId") ?? "",
    opportunityId: form.get("opportunityId") ?? "",
    body: form.get("body") ?? "",
  });

  const sb = await getSupabaseServerClient();
  const { error } = await sb.rpc("create_note", {
    p_account_id: nullable(parsed.accountId),
    p_contact_id: nullable(parsed.contactId),
    p_opportunity_id: nullable(parsed.opportunityId),
    p_body: parsed.body,
  });
  if (error) throw new Error(error.message);

  if (parsed.accountId) revalidatePath(`/accounts/${parsed.accountId}`);
  if (parsed.opportunityId) revalidatePath(`/opportunities/${parsed.opportunityId}`);
}

export async function createTask(form: FormData) {
  await requireUser();
  const parsed = taskSchema.parse({
    accountId: form.get("accountId") ?? "",
    contactId: form.get("contactId") ?? "",
    opportunityId: form.get("opportunityId") ?? "",
    title: form.get("title") ?? "",
    dueAt: form.get("dueAt") ?? "",
    assignedUserId: form.get("assignedUserId") ?? "",
  });

  const sb = await getSupabaseServerClient();
  const { error } = await sb.rpc("create_task", {
    p_account_id: nullable(parsed.accountId),
    p_contact_id: nullable(parsed.contactId),
    p_opportunity_id: nullable(parsed.opportunityId),
    p_title: parsed.title,
    p_due_at: parsed.dueAt ? new Date(parsed.dueAt).toISOString() : null,
    p_assigned_user_id: nullable(parsed.assignedUserId),
  });
  if (error) throw new Error(error.message);

  if (parsed.accountId) revalidatePath(`/accounts/${parsed.accountId}`);
  if (parsed.opportunityId) revalidatePath(`/opportunities/${parsed.opportunityId}`);
}

export async function toggleTaskComplete(
  activityId: string,
  redirectTo: string,
) {
  await requireUser();
  const sb = await getSupabaseServerClient();
  const { error } = await sb.rpc("toggle_task_complete", { p_activity_id: activityId });
  if (error) throw new Error(error.message);
  revalidatePath(redirectTo);
}
