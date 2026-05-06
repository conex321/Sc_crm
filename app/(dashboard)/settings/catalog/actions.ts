"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";

const productSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  category: z.enum(["course", "lms", "principal_service", "other"]),
  description: z.string().max(1000).optional(),
  listPrice: z.coerce.number().nonnegative(),
  currency: z.string().trim().min(3).max(3).default("USD"),
  billingPeriod: z.enum(["one_time", "monthly", "annual"]).default("one_time"),
  isActive: z.coerce.boolean().optional(),
});

function readProductForm(form: FormData) {
  return {
    sku: String(form.get("sku") ?? ""),
    name: String(form.get("name") ?? ""),
    category: String(form.get("category") ?? "course"),
    description: String(form.get("description") ?? ""),
    listPrice: String(form.get("listPrice") ?? "0"),
    currency: String(form.get("currency") ?? "USD"),
    billingPeriod: String(form.get("billingPeriod") ?? "one_time"),
    isActive: form.get("isActive") === "on",
  };
}

export async function createProduct(form: FormData) {
  const user = await requireRole(["admin"]);
  const parsed = productSchema.parse(readProductForm(form));
  const sb = await getSupabaseServerClient();
  const { error } = await sb.from("products").insert({
    sku: parsed.sku,
    name: parsed.name,
    description: parsed.description || null,
    category: parsed.category,
    list_price: parsed.listPrice,
    currency: parsed.currency,
    billing_period: parsed.billingPeriod,
    is_active: parsed.isActive ?? true,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings/catalog");
  redirect("/settings/catalog");
}

export async function updateProduct(id: string, form: FormData) {
  const user = await requireRole(["admin"]);
  const parsed = productSchema.parse(readProductForm(form));
  const sb = await getSupabaseServerClient();
  const { error } = await sb
    .from("products")
    .update({
      sku: parsed.sku,
      name: parsed.name,
      description: parsed.description || null,
      category: parsed.category,
      list_price: parsed.listPrice,
      currency: parsed.currency,
      billing_period: parsed.billingPeriod,
      is_active: parsed.isActive ?? true,
      updated_by: user.id,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/catalog");
  redirect("/settings/catalog");
}

const packageSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional(),
  listPrice: z.coerce.number().nonnegative().optional(),
  currency: z.string().trim().min(3).max(3).default("USD"),
  isActive: z.coerce.boolean().optional(),
});

function readPackageForm(form: FormData) {
  return {
    name: String(form.get("name") ?? ""),
    description: String(form.get("description") ?? ""),
    listPrice: String(form.get("listPrice") ?? ""),
    currency: String(form.get("currency") ?? "USD"),
    isActive: form.get("isActive") === "on",
  };
}

export async function createPackage(form: FormData) {
  const user = await requireRole(["admin"]);
  const parsed = packageSchema.parse(readPackageForm(form));
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("packages")
    .insert({
      name: parsed.name,
      description: parsed.description || null,
      list_price: parsed.listPrice ?? null,
      currency: parsed.currency,
      is_active: parsed.isActive ?? true,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/settings/catalog");
  redirect(`/settings/catalog/packages/${data.id}/edit`);
}

export async function updatePackage(id: string, form: FormData) {
  const user = await requireRole(["admin"]);
  const parsed = packageSchema.parse(readPackageForm(form));
  const sb = await getSupabaseServerClient();
  const { error } = await sb
    .from("packages")
    .update({
      name: parsed.name,
      description: parsed.description || null,
      list_price: parsed.listPrice ?? null,
      currency: parsed.currency,
      is_active: parsed.isActive ?? true,
      updated_by: user.id,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/catalog");
  redirect("/settings/catalog");
}

export async function setPackageItem(form: FormData) {
  await requireRole(["admin"]);
  const packageId = String(form.get("packageId") ?? "");
  const productId = String(form.get("productId") ?? "");
  const quantity = Number(form.get("quantity") ?? 1);
  if (!packageId || !productId) throw new Error("packageId + productId required");
  const sb = await getSupabaseServerClient();
  const { error } = await sb.from("package_items").upsert(
    { package_id: packageId, product_id: productId, quantity },
    { onConflict: "package_id,product_id" },
  );
  if (error) throw new Error(error.message);
  revalidatePath(`/settings/catalog/packages/${packageId}/edit`);
}

export async function removePackageItem(packageId: string, itemId: string) {
  await requireRole(["admin"]);
  const sb = await getSupabaseServerClient();
  const { error } = await sb.from("package_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/settings/catalog/packages/${packageId}/edit`);
}
