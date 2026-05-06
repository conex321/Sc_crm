"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Defaults = {
  sku?: string;
  name?: string;
  description?: string;
  category?: "course" | "lms" | "principal_service" | "other";
  listPrice?: string;
  currency?: string;
  billingPeriod?: "one_time" | "monthly" | "annual";
  isActive?: boolean;
};

export function ProductForm({
  defaults,
  action,
  submitLabel = "Save",
}: {
  defaults?: Defaults;
  action: (form: FormData) => Promise<void>;
  submitLabel?: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = (form: FormData) => {
    startTransition(async () => {
      try {
        await action(form);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  };

  return (
    <form action={handleSubmit} className="grid max-w-2xl gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" name="sku" required defaultValue={defaults?.sku} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="category">Category</Label>
          <Select name="category" defaultValue={defaults?.category ?? "course"}>
            <SelectTrigger id="category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="course">Course</SelectItem>
              <SelectItem value="lms">LMS</SelectItem>
              <SelectItem value="principal_service">Principal Service</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required defaultValue={defaults?.name} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={2} defaultValue={defaults?.description ?? ""} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="listPrice">List price</Label>
          <Input id="listPrice" name="listPrice" type="number" step="0.01" required defaultValue={defaults?.listPrice} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="currency">Currency</Label>
          <Input id="currency" name="currency" maxLength={3} defaultValue={defaults?.currency ?? "USD"} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="billingPeriod">Billing</Label>
          <Select name="billingPeriod" defaultValue={defaults?.billingPeriod ?? "one_time"}>
            <SelectTrigger id="billingPeriod">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one_time">One-time</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={defaults?.isActive ?? true}
          className="size-3.5 rounded border"
        />
        <span>Active (available in line-item picker)</span>
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={() => router.push("/settings/catalog")} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
