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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { attachDriveFile } from "@/app/(dashboard)/documents/actions";

const DRIVE_ID_PATTERN = /\/d\/([a-zA-Z0-9_-]+)/;

function extractFileId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(DRIVE_ID_PATTERN);
  return m?.[1] ?? null;
}

/**
 * Phase 2 v1: paste a Drive file URL (or raw file ID). The Google Drive
 * Picker JS SDK can be wired in later for a richer UX; this works against
 * the same `drive.file` scope as long as the file was opened by the rep.
 */
export function DriveAttachButton({
  accountId,
  opportunityId,
  driveConnected,
}: {
  accountId: string;
  opportunityId?: string;
  driveConnected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (form: FormData) => {
    const raw = String(form.get("driveUrlOrId") ?? "");
    const fileId = extractFileId(raw);
    if (!fileId) {
      toast.error("Couldn't read a Drive file ID from that input");
      return;
    }
    form.set("driveFileId", fileId);
    startTransition(async () => {
      try {
        await attachDriveFile(form);
        setOpen(false);
        toast.success("Attached");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  };

  if (!driveConnected) {
    return (
      <Button asChild size="sm" variant="outline">
        <a href="/api/google-drive/connect">
          <FilePlus2 className="size-3.5" /> Connect Drive
        </a>
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FilePlus2 className="size-3.5" /> Attach from Drive
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach a Drive file</DialogTitle>
          <DialogDescription>
            Paste the Drive file URL (or ID). The file must be one your account can
            access — the CRM uses your <code>drive.file</code> token.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-3">
          <input type="hidden" name="accountId" value={accountId} />
          {opportunityId && (
            <input type="hidden" name="opportunityId" value={opportunityId} />
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="driveUrlOrId">Drive URL or file ID</Label>
            <Input
              id="driveUrlOrId"
              name="driveUrlOrId"
              required
              placeholder="https://docs.google.com/document/d/…"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="docKind">Document kind</Label>
            <Select name="docKind" defaultValue="contract">
              <SelectTrigger id="docKind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="proposal">Proposal</SelectItem>
                <SelectItem value="sow">Statement of Work</SelectItem>
                <SelectItem value="misc">Misc</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Attaching…" : "Attach"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
