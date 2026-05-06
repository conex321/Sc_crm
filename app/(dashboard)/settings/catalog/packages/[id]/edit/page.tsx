import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import {
  updatePackage,
  setPackageItem,
  removePackageItem,
} from "../../../actions";
import { requireRole } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default async function EditPackagePage(props: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin"]);
  const { id } = await props.params;
  const sb = await getSupabaseServerClient();

  const [pkgRes, itemsRes, productsRes] = await Promise.all([
    sb.from("packages").select("*").eq("id", id).maybeSingle(),
    sb
      .from("package_items")
      .select("id, package_id, product_id, quantity, products(name, sku, list_price)")
      .eq("package_id", id),
    sb.from("products").select("id, sku, name, list_price").eq("is_active", true).order("name"),
  ]);

  const pkg = pkgRes.data;
  if (!pkg) notFound();
  const items = itemsRes.data ?? [];
  const products = productsRes.data ?? [];
  const update = updatePackage.bind(null, id);

  return (
    <div className="px-6 py-5">
      <h1 className="mb-4 text-lg font-semibold tracking-tight">Edit package · {pkg.name}</h1>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Package details</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={update} className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required defaultValue={pkg.name} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={3}
                  defaultValue={pkg.description ?? ""}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="listPrice">List price</Label>
                  <Input
                    id="listPrice"
                    name="listPrice"
                    type="number"
                    step="0.01"
                    defaultValue={pkg.list_price ?? ""}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="currency">Currency</Label>
                  <Input
                    id="currency"
                    name="currency"
                    maxLength={3}
                    defaultValue={pkg.currency}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={pkg.is_active}
                  className="size-3.5 rounded border"
                />
                <span>Active</span>
              </label>
              <Button type="submit" size="sm" className="w-fit">
                Save details
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Items in this package</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No items yet.</p>
            ) : (
              <ul className="space-y-1">
                {items.map((it) => {
                  const prod = Array.isArray(it.products) ? it.products[0] : it.products;
                  return (
                    <li
                      key={it.id}
                      className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1.5 text-xs"
                    >
                      <div>
                        <span className="font-medium">{prod?.name ?? "—"}</span>{" "}
                        <Badge variant="secondary" className="ml-1 text-[10px]">
                          ×{it.quantity}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {prod?.list_price
                            ? formatter.format(Number(prod.list_price) * it.quantity)
                            : "—"}
                        </span>
                        <form
                          action={async () => {
                            "use server";
                            await removePackageItem(id, it.id);
                          }}
                        >
                          <Button type="submit" variant="ghost" size="icon" className="size-6">
                            <Trash2 className="size-3" />
                          </Button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <form action={setPackageItem} className="grid grid-cols-[1fr_80px_auto] items-end gap-2 pt-2">
              <input type="hidden" name="packageId" value={id} />
              <div className="grid gap-1.5">
                <Label htmlFor="productId" className="text-[11px]">
                  Add product
                </Label>
                <select
                  id="productId"
                  name="productId"
                  required
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="">Pick a product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} · {p.name} · {formatter.format(Number(p.list_price))}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="quantity" className="text-[11px]">
                  Qty
                </Label>
                <Input id="quantity" name="quantity" type="number" min={1} defaultValue={1} />
              </div>
              <Button type="submit" size="sm">
                Add
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
