"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  addLineItem,
  updateLineItem,
  deleteLineItem,
} from "@/app/(dashboard)/opportunities/[id]/line-items/actions";
import { fmtCad } from "@/lib/format";

type Product = { id: string; sku: string; name: string; list_price: string };
type Package = { id: string; name: string; list_price: string | null };

export type LineItem = {
  id: string;
  product_id: string | null;
  package_id: string | null;
  quantity: number;
  unit_price: string;
  discount_pct: number;
  product?: { name: string; sku: string } | null;
  pkg?: { name: string } | null;
};

function subtotal(li: LineItem) {
  return Number(li.unit_price) * li.quantity * (1 - li.discount_pct / 100);
}

export function LineItemsEditor({
  opportunityId,
  lineItems,
  products,
  packages,
}: {
  opportunityId: string;
  lineItems: LineItem[];
  products: Product[];
  packages: Package[];
}) {
  const [pending, startTransition] = useTransition();
  const [source, setSource] = useState<"product" | "package">("product");

  const total = lineItems.reduce((acc, li) => acc + subtotal(li), 0);

  const onAdd = (form: FormData) => {
    form.set("opportunityId", opportunityId);
    form.set("source", source);
    startTransition(async () => {
      try {
        await addLineItem(form);
        toast.success("Line item added");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  };

  const onUpdate = (lineItemId: string) => (form: FormData) => {
    startTransition(async () => {
      try {
        await updateLineItem(opportunityId, lineItemId, form);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  };

  const onDelete = (lineItemId: string) => {
    startTransition(async () => {
      try {
        await deleteLineItem(opportunityId, lineItemId);
        toast.success("Removed");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span>Line items</span>
          <span className="text-muted-foreground text-xs font-normal">
            Total ·{" "}
            <span className="text-foreground font-semibold tabular-nums">{fmtCad(total)}</span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {lineItems.length === 0 ? (
          <p className="text-muted-foreground rounded border border-dashed p-3 text-center text-xs">
            No line items yet. Add a product or package below.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground text-left text-[11px] uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Unit price</th>
                  <th className="px-3 py-2 font-medium">Discount %</th>
                  <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li) => (
                  <tr key={li.id} className="border-t [&_td]:px-3 [&_td]:py-1.5">
                    <td className="font-medium">
                      {li.product_id
                        ? `${li.product?.sku ?? ""} · ${li.product?.name ?? ""}`
                        : `📦 ${li.pkg?.name ?? ""}`}
                    </td>
                    <td>
                      <form action={onUpdate(li.id)} className="contents">
                        <Input
                          name="quantity"
                          type="number"
                          min={1}
                          defaultValue={li.quantity}
                          className="h-7 w-16 text-xs"
                          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                        />
                        <input type="hidden" name="unitPrice" value={li.unit_price} />
                        <input type="hidden" name="discountPct" value={li.discount_pct} />
                      </form>
                    </td>
                    <td>
                      <form action={onUpdate(li.id)} className="contents">
                        <input type="hidden" name="quantity" value={li.quantity} />
                        <Input
                          name="unitPrice"
                          type="number"
                          step="0.01"
                          defaultValue={li.unit_price}
                          className="h-7 w-24 text-xs"
                          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                        />
                        <input type="hidden" name="discountPct" value={li.discount_pct} />
                      </form>
                    </td>
                    <td>
                      <form action={onUpdate(li.id)} className="contents">
                        <input type="hidden" name="quantity" value={li.quantity} />
                        <input type="hidden" name="unitPrice" value={li.unit_price} />
                        <Input
                          name="discountPct"
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={li.discount_pct}
                          className="h-7 w-14 text-xs"
                          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                        />
                      </form>
                    </td>
                    <td className="text-right font-medium tabular-nums">{fmtCad(subtotal(li))}</td>
                    <td className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        disabled={pending}
                        onClick={() => onDelete(li.id)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form
          action={onAdd}
          className="grid grid-cols-[120px_1fr_70px_120px_70px_auto] items-end gap-2"
        >
          <div className="grid gap-1">
            <span className="text-muted-foreground text-[10px] uppercase">Source</span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as "product" | "package")}
              className="bg-background h-8 rounded-md border px-2 text-xs"
            >
              <option value="product">Product</option>
              <option value="package">Package</option>
            </select>
          </div>
          <div className="grid gap-1">
            <span className="text-muted-foreground text-[10px] uppercase">
              {source === "product" ? "Product" : "Package"}
            </span>
            {source === "product" ? (
              <select
                name="productId"
                required
                onChange={(e) => {
                  const product = products.find((p) => p.id === e.target.value);
                  const priceInput = e.currentTarget.form?.elements.namedItem("unitPrice") as
                    | HTMLInputElement
                    | undefined;
                  if (product && priceInput) priceInput.value = product.list_price;
                }}
                className="bg-background h-8 rounded-md border px-2 text-xs"
              >
                <option value="">Pick…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                name="packageId"
                required
                onChange={(e) => {
                  const pkg = packages.find((p) => p.id === e.target.value);
                  const priceInput = e.currentTarget.form?.elements.namedItem("unitPrice") as
                    | HTMLInputElement
                    | undefined;
                  if (pkg?.list_price && priceInput) priceInput.value = pkg.list_price;
                }}
                className="bg-background h-8 rounded-md border px-2 text-xs"
              >
                <option value="">Pick…</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="grid gap-1">
            <span className="text-muted-foreground text-[10px] uppercase">Qty</span>
            <Input name="quantity" type="number" min={1} defaultValue={1} className="h-8 text-xs" />
          </div>
          <div className="grid gap-1">
            <span className="text-muted-foreground text-[10px] uppercase">Unit price</span>
            <Input name="unitPrice" type="number" step="0.01" required className="h-8 text-xs" />
          </div>
          <div className="grid gap-1">
            <span className="text-muted-foreground text-[10px] uppercase">Disc %</span>
            <Input
              name="discountPct"
              type="number"
              min={0}
              max={100}
              defaultValue={0}
              className="h-8 text-xs"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            <Plus className="size-3.5" /> Add
          </Button>
        </form>

        <p className="text-muted-foreground text-[11px]">
          Opportunity amount auto-syncs from the line-item total via DB trigger.
        </p>
      </CardContent>
    </Card>
  );
}
