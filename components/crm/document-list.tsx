"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExternalLink, FileText, MoreHorizontal, Send, CheckCircle2, Archive } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { setDocumentStatus, unlinkDocument } from "@/app/(dashboard)/documents/actions";
import type { DocumentRow } from "@/lib/crm/documents";
import { fmtCad } from "@/lib/format";

export function DocumentList({
  accountId,
  documents,
  emptyAction,
}: {
  accountId: string;
  documents: DocumentRow[];
  emptyAction?: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();

  const setStatus = (id: string, status: "draft" | "sent" | "signed") => {
    startTransition(async () => {
      try {
        await setDocumentStatus(id, status, accountId);
        toast.success(`Marked as ${status}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  };

  const archive = (id: string) => {
    startTransition(async () => {
      try {
        await unlinkDocument(id, accountId);
        toast.success("Archived");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  };

  if (documents.length === 0) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-xs">
        No documents yet. {emptyAction}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full">
        <thead className="bg-muted/40 text-muted-foreground text-left text-[11px] uppercase">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Kind</th>
            <th className="px-3 py-2 font-medium">Value</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Updated</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => (
            <tr key={d.id} className="hover:bg-muted/30 border-t [&_td]:px-3 [&_td]:py-2">
              <td>
                <Link
                  href={d.drive_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium hover:underline"
                >
                  <FileText className="text-muted-foreground size-3.5" />
                  {d.name}
                  <ExternalLink className="text-muted-foreground size-3" />
                </Link>
              </td>
              <td>
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {d.doc_kind}
                </Badge>
              </td>
              <td className="text-muted-foreground tabular-nums">
                {d.contract_value ? fmtCad(Number(d.contract_value)) : "—"}
              </td>
              <td>
                <Badge
                  variant={
                    d.status === "signed"
                      ? "default"
                      : d.status === "sent"
                        ? "secondary"
                        : "outline"
                  }
                  className="text-[10px] capitalize"
                >
                  {d.status}
                </Badge>
              </td>
              <td className="text-muted-foreground">
                {format(new Date(d.updated_at), "MMM d, yyyy")}
              </td>
              <td className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7" disabled={pending}>
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setStatus(d.id, "sent")}>
                      <Send className="size-3.5" /> Mark sent
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatus(d.id, "signed")}>
                      <CheckCircle2 className="size-3.5" /> Mark signed
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => archive(d.id)}>
                      <Archive className="size-3.5" /> Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
