"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { generateContractFromTemplate } from "@/app/(dashboard)/documents/actions";

type Template = { id: string; name: string; description: string | null };

export function GenerateContractDialog({
  accountId,
  opportunityId,
  templates,
}: {
  accountId: string;
  opportunityId?: string;
  templates: Template[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (form: FormData) => {
    startTransition(async () => {
      try {
        await generateContractFromTemplate(form);
        setOpen(false);
        toast.success("Contract generated in Drive");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  };

  if (templates.length === 0) {
    return (
      <Button size="sm" variant="outline" disabled title="No active templates">
        <Sparkles className="size-3.5" /> Generate contract
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Sparkles className="size-3.5" /> Generate contract
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate from template</DialogTitle>
          <DialogDescription>
            Copies the template into Drive, fills placeholders ({"{{account_name}}"},
            {" {{opportunity_name}}"}, {"{{contract_value}}"}, {"{{rep_name}}"},
            {" {{rep_email}}"}, {"{{today}}"}), and attaches it here.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          <input type="hidden" name="accountId" value={accountId} />
          {opportunityId && (
            <input type="hidden" name="opportunityId" value={opportunityId} />
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="templateId">Template</Label>
            <Select name="templateId" required>
              <SelectTrigger id="templateId">
                <SelectValue placeholder="Pick a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="contractValue">Contract value (optional)</Label>
            <Input
              id="contractValue"
              name="contractValue"
              type="number"
              step="0.01"
              placeholder="e.g. 48000"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Generating…" : "Generate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
