import { notFound } from "next/navigation";
import { ProductForm } from "@/components/crm/product-form";
import { updateProduct } from "../../../actions";
import { requireRole } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditProductPage(props: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin"]);
  const { id } = await props.params;
  const sb = await getSupabaseServerClient();
  const { data: product } = await sb.from("products").select("*").eq("id", id).maybeSingle();
  if (!product) notFound();
  const update = updateProduct.bind(null, id);
  return (
    <div className="px-6 py-5">
      <h1 className="mb-3 text-lg font-semibold tracking-tight">Edit · {product.name}</h1>
      <ProductForm
        defaults={{
          sku: product.sku,
          name: product.name,
          description: product.description ?? "",
          category: product.category,
          listPrice: String(product.list_price),
          currency: product.currency,
          billingPeriod: product.billing_period,
          isActive: product.is_active,
        }}
        action={update}
        submitLabel="Save changes"
      />
    </div>
  );
}
