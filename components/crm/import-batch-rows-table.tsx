"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Trash2, Pencil, Undo2 } from "lucide-react";
import {
  bulkDeleteImportedAccounts,
  bulkEditImportedAccounts,
  revertImportBatch,
} from "@/app/(dashboard)/accounts/imports/actions";

export type BatchRow = {
  id: string;
  row_index: number;
  account_id: string | null;
  contact_id: string | null;
  account_action: "created" | "matched" | null;
  contact_action: string | null;
  error: string | null;
  account: {
    id: string;
    name: string;
    country: string | null;
    type: string;
    source: string | null;
    deleted_at: string | null;
    owner: { full_name: string } | null;
  } | null;
  contact: { first_name: string; last_name: string; email: string | null } | null;
};

export function ImportBatchRowsTable({
  batchId,
  batchStatus,
  rows,
  users,
}: {
  batchId: string;
  batchStatus: string;
  rows: BatchRow[];
  users: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({ owner: "keep", type: "keep", country: "", source: "" });

  // One row per distinct live account (a batch can reference an account many times).
  const accountRows = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      if (!r.account || !r.account_id) return false;
      if (seen.has(r.account_id)) return false;
      seen.add(r.account_id);
      return true;
    });
  }, [rows]);

  const liveAccountRows = accountRows.filter((r) => !r.account?.deleted_at);
  const allSelected = liveAccountRows.length > 0 && selected.size === liveAccountRows.length;
  const selectedCreated = liveAccountRows.filter(
    (r) => selected.has(r.account_id!) && r.account_action === "created",
  ).length;

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(liveAccountRows.map((r) => r.account_id!)));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const runBulkEdit = () => {
    const patch: Parameters<typeof bulkEditImportedAccounts>[2] = {};
    if (edit.owner !== "keep") patch.ownerUserId = edit.owner === "none" ? null : edit.owner;
    if (edit.type !== "keep") patch.type = edit.type as "school" | "aspiring_founder" | "district" | "other";
    if (edit.country.trim()) patch.country = edit.country.trim();
    if (edit.source.trim()) patch.source = edit.source.trim();
    if (Object.keys(patch).length === 0) {
      toast.error("Pick at least one change.");
      return;
    }
    startTransition(async () => {
      try {
        const r = await bulkEditImportedAccounts(batchId, [...selected], patch);
        toast.success(`Updated ${r.updated} account${r.updated === 1 ? "" : "s"}.`);
        setEditOpen(false);
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const runBulkDelete = () => {
    if (
      !window.confirm(
        `Delete ${selectedCreated} imported account${selectedCreated === 1 ? "" : "s"} (and their contacts)? Accounts that already existed before this import are never deleted.`,
      )
    )
      return;
    startTransition(async () => {
      try {
        const r = await bulkDeleteImportedAccounts(batchId, [...selected]);
        toast.success(`Deleted ${r.deletedAccounts} accounts, ${r.deletedContacts} contacts.`);
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const runRevert = () => {
    if (
      !window.confirm(
        "Revert this entire import? Every account and contact it CREATED will be deleted. Records it merely matched are untouched. Anything added to these accounts since (notes, calls) becomes hidden with them.",
      )
    )
      return;
    startTransition(async () => {
      try {
        const r = await revertImportBatch(batchId);
        toast.success(`Reverted — removed ${r.deletedAccounts} accounts, ${r.deletedContacts} contacts.`);
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {selected.size > 0
            ? `${selected.size} selected (${selectedCreated} deletable)`
            : `${liveAccountRows.length} accounts in this import`}
        </span>
        <div className="ml-auto flex gap-2">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={selected.size === 0 || pending}>
                <Pencil className="size-3.5" /> Bulk edit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Bulk edit {selected.size} accounts</DialogTitle>
                <DialogDescription>Only the fields you change are applied.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-1">
                <div className="grid gap-1.5">
                  <Label>Owner</Label>
                  <Select value={edit.owner} onValueChange={(v) => setEdit((e) => ({ ...e, owner: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep">— Keep current —</SelectItem>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Type</Label>
                  <Select value={edit.type} onValueChange={(v) => setEdit((e) => ({ ...e, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep">— Keep current —</SelectItem>
                      <SelectItem value="school">School</SelectItem>
                      <SelectItem value="district">District</SelectItem>
                      <SelectItem value="aspiring_founder">Aspiring founder</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Country</Label>
                  <Input
                    placeholder="Leave blank to keep"
                    value={edit.country}
                    onChange={(e) => setEdit((s) => ({ ...s, country: e.target.value }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Source</Label>
                  <Input
                    placeholder="Leave blank to keep"
                    value={edit.source}
                    onChange={(e) => setEdit((s) => ({ ...s, source: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button onClick={runBulkEdit} disabled={pending}>
                  {pending ? "Applying…" : "Apply"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            disabled={selectedCreated === 0 || pending}
            onClick={runBulkDelete}
          >
            <Trash2 className="size-3.5" /> Delete selected
          </Button>

          {batchStatus !== "reverted" && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={runRevert}>
              <Undo2 className="size-3.5" /> Revert whole import
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accountRows.map((r) => {
              const deleted = Boolean(r.account?.deleted_at);
              return (
                <TableRow key={r.id} className={deleted ? "opacity-45" : ""}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(r.account_id!)}
                      onChange={() => toggle(r.account_id!)}
                      disabled={deleted}
                      aria-label={`Select ${r.account?.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    {deleted ? (
                      <span className="font-medium line-through">{r.account?.name}</span>
                    ) : (
                      <Link href={`/accounts/${r.account_id}`} className="font-medium hover:underline">
                        {r.account?.name}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={r.account_action === "created" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {deleted ? "deleted" : (r.account_action ?? "—")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.contact
                      ? `${r.contact.first_name} ${r.contact.last_name}`.trim() +
                        (r.contact.email ? ` · ${r.contact.email}` : "")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{r.account?.country ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.account?.owner?.full_name ?? "—"}
                  </TableCell>
                </TableRow>
              );
            })}
            {accountRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                  No rows recorded for this import.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
