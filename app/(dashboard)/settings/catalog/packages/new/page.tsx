import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPackage } from "../../actions";
import { requireRole } from "@/lib/auth/session";

export default async function NewPackagePage() {
  await requireRole(["admin"]);
  return (
    <div className="px-6 py-5">
      <h1 className="mb-3 text-lg font-semibold tracking-tight">New package</h1>
      <form action={createPackage} className="grid max-w-xl gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required placeholder="School Founder bundle" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" rows={3} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="listPrice">List price (optional)</Label>
            <Input id="listPrice" name="listPrice" type="number" step="0.01" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="currency">Currency</Label>
            <Input id="currency" name="currency" maxLength={3} defaultValue="USD" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" name="isActive" defaultChecked className="size-3.5 rounded border" />
          <span>Active</span>
        </label>
        <Button type="submit" className="w-fit">
          Create package
        </Button>
      </form>
      <p className="mt-3 text-xs text-muted-foreground">
        After creating, add products to this package on the edit page.
      </p>
    </div>
  );
}
