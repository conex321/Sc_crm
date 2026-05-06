// Phase 4 Catalog & Quoting — admin CRUD for products + packages.
import { requireRole } from "@/lib/auth/session";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default async function CatalogPage() {
  await requireRole(["admin"]);
  const sb = await getSupabaseServerClient();
  const [productsRes, packagesRes, packageItemsRes] = await Promise.all([
    sb
      .from("products")
      .select("id, sku, name, category, list_price, currency, billing_period, is_active")
      .order("category")
      .order("name"),
    sb
      .from("packages")
      .select("id, name, description, list_price, currency, is_active")
      .order("name"),
    sb
      .from("package_items")
      .select("package_id, product_id, quantity"),
  ]);

  const productsByCategory = new Map<string, typeof productsRes.data>();
  for (const p of productsRes.data ?? []) {
    const cat = p.category ?? "other";
    if (!productsByCategory.has(cat)) productsByCategory.set(cat, []);
    productsByCategory.get(cat)!.push(p);
  }
  const itemCountByPackage = new Map<string, number>();
  for (const item of packageItemsRes.data ?? []) {
    itemCountByPackage.set(item.package_id, (itemCountByPackage.get(item.package_id) ?? 0) + item.quantity);
  }

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Catalog</h1>
          <p className="text-xs text-muted-foreground">
            Products are the 70+ courses + service tiers. Packages bundle products.
            Both feed the line-item quote editor on opportunities.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/catalog/packages/new">
              <Plus className="size-3.5" /> New package
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/settings/catalog/products/new">
              <Plus className="size-3.5" /> New product
            </Link>
          </Button>
        </div>
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
        Products ({productsRes.data?.length ?? 0})
      </h2>
      <div className="mb-6 space-y-4">
        {[...productsByCategory.entries()].map(([cat, items]) => (
          <div key={cat}>
            <h3 className="mb-1 text-[11px] font-medium uppercase text-muted-foreground">
              {cat.replace("_", " ")}
            </h3>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">List price</th>
                    <th className="px-3 py-2 font-medium">Billing</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(items ?? []).map((p) => (
                    <tr key={p.id} className="border-t [&_td]:px-3 [&_td]:py-2">
                      <td className="font-mono text-[11px]">{p.sku}</td>
                      <td className="font-medium">{p.name}</td>
                      <td>{formatter.format(Number(p.list_price))}</td>
                      <td className="text-muted-foreground capitalize">
                        {p.billing_period.replace("_", " ")}
                      </td>
                      <td>
                        <Badge variant={p.is_active ? "default" : "secondary"}>
                          {p.is_active ? "active" : "disabled"}
                        </Badge>
                      </td>
                      <td className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/settings/catalog/products/${p.id}/edit`}>Edit</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {(productsRes.data ?? []).length === 0 && (
          <div className="rounded border border-dashed p-6 text-center text-xs text-muted-foreground">
            No products yet.
          </div>
        )}
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
        Packages ({packagesRes.data?.length ?? 0})
      </h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(packagesRes.data ?? []).map((pkg) => (
          <Card key={pkg.id}>
            <CardContent className="space-y-2 p-4 text-xs">
              <div className="flex items-center justify-between">
                <Link
                  href={`/settings/catalog/packages/${pkg.id}/edit`}
                  className="text-sm font-semibold hover:underline"
                >
                  {pkg.name}
                </Link>
                <Badge variant={pkg.is_active ? "default" : "secondary"}>
                  {pkg.is_active ? "active" : "disabled"}
                </Badge>
              </div>
              {pkg.description && (
                <p className="text-muted-foreground">{pkg.description}</p>
              )}
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{itemCountByPackage.get(pkg.id) ?? 0} items</span>
                <span className="font-medium text-foreground">
                  {pkg.list_price ? formatter.format(Number(pkg.list_price)) : "—"}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
