"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Account = { id: string; name: string };
type Pipeline = { id: string; name: string; slug: string };
type Stage = { id: string; pipeline_id: string; name: string; position: number };
type User = { id: string; full_name: string };
type Contact = { id: string; first_name: string; last_name: string };

export function OpportunityForm({
  defaults,
  accounts,
  pipelines,
  stages,
  users,
  contactsByAccount,
  action,
  submitLabel = "Save",
  cancelHref,
}: {
  defaults?: {
    name?: string;
    accountId?: string;
    pipelineId?: string;
    stageId?: string;
    amount?: string;
    currency?: string;
    expectedCloseDate?: string;
    ownerUserId?: string;
    primaryContactId?: string;
  };
  accounts: Account[];
  pipelines: Pipeline[];
  stages: Stage[];
  users: User[];
  contactsByAccount: Record<string, Contact[]>;
  action: (form: FormData) => Promise<void>;
  submitLabel?: string;
  cancelHref: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [accountId, setAccountId] = useState(defaults?.accountId ?? "");
  const [pipelineId, setPipelineId] = useState(defaults?.pipelineId ?? pipelines[0]?.id ?? "");
  const [stageId, setStageId] = useState(defaults?.stageId ?? "");

  const stagesForPipeline = stages.filter((s) => s.pipeline_id === pipelineId);

  useEffect(() => {
    if (!stageId || !stagesForPipeline.find((s) => s.id === stageId)) {
      setStageId(stagesForPipeline[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId]);

  const contacts = accountId ? (contactsByAccount[accountId] ?? []) : [];

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
        <Label htmlFor="name">Opportunity name</Label>
        <Input id="name" name="name" required defaultValue={defaults?.name} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="accountId">Account</Label>
          <Select
            name="accountId"
            value={accountId}
            onValueChange={setAccountId}
            required
          >
            <SelectTrigger id="accountId">
              <SelectValue placeholder="Select an account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="primaryContactId">Primary contact</Label>
          {/* Radix Select throws on empty-string item values — use a sentinel. */}
          <Select
            name="primaryContactId"
            defaultValue={defaults?.primaryContactId || "none"}
            disabled={!accountId}
          >
            <SelectTrigger id="primaryContactId">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {contacts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="pipelineId">Pipeline</Label>
          <Select
            name="pipelineId"
            value={pipelineId}
            onValueChange={setPipelineId}
            required
          >
            <SelectTrigger id="pipelineId">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="stageId">Stage</Label>
          <Select name="stageId" value={stageId} onValueChange={setStageId} required>
            <SelectTrigger id="stageId">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stagesForPipeline.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.position}. {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            defaultValue={defaults?.amount}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            name="currency"
            maxLength={3}
            defaultValue={defaults?.currency ?? "USD"}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="expectedCloseDate">Expected close</Label>
          <Input
            id="expectedCloseDate"
            name="expectedCloseDate"
            type="date"
            defaultValue={defaults?.expectedCloseDate}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ownerUserId">Owner</Label>
        <Select name="ownerUserId" defaultValue={defaults?.ownerUserId || "unassigned"}>
          <SelectTrigger id="ownerUserId">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
