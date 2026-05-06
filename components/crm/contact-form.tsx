"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { ContactRow } from "@/lib/crm/contacts";

export function ContactForm({
  accountId,
  contact,
  action,
  submitLabel = "Save",
}: {
  accountId: string;
  contact?: ContactRow;
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
        toast.error(err instanceof Error ? err.message : "Failed to save");
      }
    });
  };

  return (
    <form action={handleSubmit} className="grid max-w-xl gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            required
            defaultValue={contact?.first_name}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            required
            defaultValue={contact?.last_name}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="role">Role</Label>
        <Input
          id="role"
          name="role"
          placeholder="Principal, Superintendent, …"
          defaultValue={contact?.role ?? ""}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={contact?.email ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={contact?.phone ?? ""} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="whatsappPhone">WhatsApp phone</Label>
        <Input
          id="whatsappPhone"
          name="whatsappPhone"
          placeholder="If different from primary phone"
          defaultValue={contact?.whatsapp_phone ?? ""}
        />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          name="isPrimary"
          defaultChecked={contact?.is_primary ?? false}
          className="size-3.5 rounded border"
        />
        <span>Mark as primary contact for this account</span>
      </label>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/accounts/${accountId}`)}
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
