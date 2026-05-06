"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

const addSchema = z.object({
  opportunityId: z.string().uuid(),
  source: z.enum(["product", "package"]),
  productId: z.string().uuid().optional().or(z.literal("")),
  packageId: z.string().uuid().optional().or(z.literal("")),
  quantity: z.coerce.number().int().min(1).default(1),
  unitPrice: z.coerce.number().nonnegative(),
  discountPct: z.coerce.number().int().min(0).max(100).default(0),
});

export async function addLineItem(form: FormData) {
  const user = await requireUser();
  const parsed = addSchema.parse({
    opportunityId: form.get("opportunityId"),
    source: form.get("source"),
    productId: form.get("productId") ?? "",
    packageId: form.get("packageId") ?? "",
    quantity: form.get("quantity"),
    unitPrice: form.get("unitPrice"),
    discountPct: form.get("discountPct") ?? 0,
  });
  if (parsed.source === "product" && !parsed.productId) {
    throw new Error("Select a product");
  }
  if (parsed.source === "package" && !parsed.packageId) {
    throw new Error("Select a package");
  }

  const sb = await getSupabaseServerClient();

  const { count } = await sb
    .from("opportunity_line_items")
    .select("*", { count: "exact", head: true })
    .eq("opportunity_id", parsed.opportunityId);

  const { error } = await sb.from("opportunity_line_items").insert({
    opportunity_id: parsed.opportunityId,
    product_id: parsed.source === "product" ? parsed.productId || null : null,
    package_id: parsed.source === "package" ? parsed.packageId || null : null,
    quantity: parsed.quantity,
    unit_price: parsed.unitPrice,
    discount_pct: parsed.discountPct,
    position: count ?? 0,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/opportunities/${parsed.opportunityId}`);
}

const updateSchema = z.object({
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().nonnegative(),
  discountPct: z.coerce.number().int().min(0).max(100),
});

export async function updateLineItem(
  opportunityId: string,
  lineItemId: string,
  form: FormData,
) {
  const user = await requireUser();
  const parsed = updateSchema.parse({
    quantity: form.get("quantity"),
    unitPrice: form.get("unitPrice"),
    discountPct: form.get("discountPct"),
  });
  const sb = await getSupabaseServerClient();
  const { error } = await sb
    .from("opportunity_line_items")
    .update({
      quantity: parsed.quantity,
      unit_price: parsed.unitPrice,
      discount_pct: parsed.discountPct,
      updated_by: user.id,
    })
    .eq("id", lineItemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/opportunities/${opportunityId}`);
}

export async function deleteLineItem(opportunityId: string, lineItemId: string) {
  await requireUser();
  const sb = await getSupabaseServerClient();
  const { error } = await sb
    .from("opportunity_line_items")
    .delete()
    .eq("id", lineItemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/opportunities/${opportunityId}`);
}
