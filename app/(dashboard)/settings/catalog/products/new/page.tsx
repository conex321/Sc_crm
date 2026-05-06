import { ProductForm } from "@/components/crm/product-form";
import { createProduct } from "../../actions";
import { requireRole } from "@/lib/auth/session";

export default async function NewProductPage() {
  await requireRole(["admin"]);
  return (
    <div className="px-6 py-5">
      <h1 className="mb-3 text-lg font-semibold tracking-tight">New product</h1>
      <ProductForm action={createProduct} submitLabel="Create product" />
    </div>
  );
}
