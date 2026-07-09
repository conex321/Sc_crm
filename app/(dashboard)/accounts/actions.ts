"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

const accountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  type: z.enum(["school", "aspiring_founder", "district", "other"]),
  website: z.string().trim().url("Must be a valid URL").or(z.literal("")).optional(),
  address: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(50).optional(),
  country: z.string().trim().max(100).optional(),
  source: z.string().trim().max(100).optional(),
  // "unassigned" is the form's sentinel for no owner (Radix Select can't
  // represent an empty-string item value).
  ownerUserId: z.string().uuid().or(z.enum(["", "unassigned"])).optional(),
});

function ownerOrNull(v: string | undefined): string | null {
  return v && v !== "unassigned" ? v : null;
}

function fromForm(form: FormData) {
  return {
    name: String(form.get("name") ?? ""),
    type: String(form.get("type") ?? "school"),
    website: String(form.get("website") ?? ""),
    address: String(form.get("address") ?? ""),
    phone: String(form.get("phone") ?? ""),
    country: String(form.get("country") ?? ""),
    source: String(form.get("source") ?? ""),
    ownerUserId: String(form.get("ownerUserId") ?? ""),
  };
}

export async function createAccount(form: FormData) {
  const user = await requireUser();
  const parsed = accountSchema.parse(fromForm(form));

  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("accounts")
    .insert({
      name: parsed.name,
      type: parsed.type,
      website: parsed.website || null,
      address: parsed.address || null,
      phone: parsed.phone || null,
      country: parsed.country || null,
      source: parsed.source || null,
      owner_user_id: ownerOrNull(parsed.ownerUserId) ?? user.id,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/accounts");
  redirect(`/accounts/${data.id}`);
}

export async function updateAccount(id: string, form: FormData) {
  const user = await requireUser();
  const parsed = accountSchema.parse(fromForm(form));

  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("accounts")
    .update({
      name: parsed.name,
      type: parsed.type,
      website: parsed.website || null,
      address: parsed.address || null,
      phone: parsed.phone || null,
      country: parsed.country || null,
      source: parsed.source || null,
      owner_user_id: ownerOrNull(parsed.ownerUserId),
      updated_by: user.id,
    })
    .eq("id", id)
    .select("id");

  if (error) throw new Error(error.message);
  // RLS filtering to 0 rows would otherwise look like a successful save.
  if (!data || data.length === 0) {
    throw new Error("Account not found or you don't have permission to edit it.");
  }
  revalidatePath(`/accounts/${id}`);
  revalidatePath("/accounts");
  redirect(`/accounts/${id}`);
}

export async function softDeleteAccount(id: string) {
  const user = await requireUser();
  const sb = await getSupabaseServerClient();
  const { error } = await sb
    .from("accounts")
    .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/accounts");
  redirect("/accounts");
}
