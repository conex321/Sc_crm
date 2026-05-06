"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type AccountFormValues = {
  name: string;
  type: "school" | "aspiring_founder" | "district" | "other";
  website: string;
  address: string;
  phone: string;
  country: string;
  source: string;
  ownerUserId: string;
};

export function AccountForm({
  defaultValues,
  users,
  action,
  submitLabel = "Save",
  cancelHref,
}: {
  defaultValues?: Partial<AccountFormValues>;
  users: Array<{ id: string; full_name: string }>;
  action: (form: FormData) => Promise<void>;
  submitLabel?: string;
  cancelHref: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = (form: FormData) => {
    startTransition(async () => {
      try {
        await action(form);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      }
    });
  };

  return (
    <form action={handleSubmit} className="grid max-w-2xl gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="name">Account name</Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={defaultValues?.name}
          placeholder="Lincoln Elementary School District"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="type">Type</Label>
          <Select name="type" defaultValue={defaultValues?.type ?? "school"}>
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="school">School</SelectItem>
              <SelectItem value="district">District</SelectItem>
              <SelectItem value="aspiring_founder">Aspiring founder</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ownerUserId">Owner</Label>
          <Select name="ownerUserId" defaultValue={defaultValues?.ownerUserId ?? ""}>
            <SelectTrigger id="ownerUserId">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Unassigned</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            name="website"
            type="url"
            placeholder="https://example.com"
            defaultValue={defaultValues?.website}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={defaultValues?.phone} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          name="address"
          rows={2}
          defaultValue={defaultValues?.address}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="country">Country</Label>
          <Input id="country" name="country" defaultValue={defaultValues?.country} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="source">Source</Label>
          <Input
            id="source"
            name="source"
            placeholder="referral, mailshake, …"
            defaultValue={defaultValues?.source}
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(cancelHref)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
