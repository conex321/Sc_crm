"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

const contactSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  role: z.string().trim().max(100).optional(),
  email: z.string().trim().email().or(z.literal("")).optional(),
  phone: z.string().trim().max(50).optional(),
  whatsappPhone: z.string().trim().max(50).optional(),
  isPrimary: z.coerce.boolean().optional(),
});

function fromForm(form: FormData) {
  return {
    firstName: String(form.get("firstName") ?? ""),
    lastName: String(form.get("lastName") ?? ""),
    role: String(form.get("role") ?? ""),
    email: String(form.get("email") ?? ""),
    phone: String(form.get("phone") ?? ""),
    whatsappPhone: String(form.get("whatsappPhone") ?? ""),
    isPrimary: form.get("isPrimary") === "on",
  };
}

export async function createContact(accountId: string, form: FormData) {
  const user = await requireUser();
  const parsed = contactSchema.parse(fromForm(form));
  const sb = await getSupabaseServerClient();

  if (parsed.isPrimary) {
    await sb.from("contacts").update({ is_primary: false }).eq("account_id", accountId);
  }

  const { error } = await sb.from("contacts").insert({
    account_id: accountId,
    first_name: parsed.firstName,
    last_name: parsed.lastName,
    role: parsed.role || null,
    email: parsed.email || null,
    phone: parsed.phone || null,
    whatsapp_phone: parsed.whatsappPhone || null,
    is_primary: parsed.isPrimary ?? false,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/accounts/${accountId}`);
  redirect(`/accounts/${accountId}?tab=contacts`);
}

export async function updateContact(
  accountId: string,
  contactId: string,
  form: FormData,
) {
  const user = await requireUser();
  const parsed = contactSchema.parse(fromForm(form));
  const sb = await getSupabaseServerClient();

  if (parsed.isPrimary) {
    await sb
      .from("contacts")
      .update({ is_primary: false })
      .eq("account_id", accountId)
      .neq("id", contactId);
  }

  const { data, error } = await sb
    .from("contacts")
    .update({
      first_name: parsed.firstName,
      last_name: parsed.lastName,
      role: parsed.role || null,
      email: parsed.email || null,
      phone: parsed.phone || null,
      whatsapp_phone: parsed.whatsappPhone || null,
      is_primary: parsed.isPrimary ?? false,
      updated_by: user.id,
    })
    .eq("id", contactId)
    .select("id");
  if (error) throw new Error(error.message);
  // RLS filtering to 0 rows would otherwise look like a successful save.
  if (!data || data.length === 0) {
    throw new Error("Contact not found or you don't have permission to edit it.");
  }
  revalidatePath(`/accounts/${accountId}`);
  redirect(`/accounts/${accountId}`);
}

export async function softDeleteContact(accountId: string, contactId: string) {
  const user = await requireUser();
  const sb = await getSupabaseServerClient();
  const { error } = await sb
    .from("contacts")
    .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", contactId);
  if (error) throw new Error(error.message);
  revalidatePath(`/accounts/${accountId}`);
}
