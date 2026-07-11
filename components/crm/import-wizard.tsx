"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Upload, CheckCircle2 } from "lucide-react";
import {
  IMPORT_FIELDS,
  IMPORT_CHUNK_SIZE,
  IMPORT_ROW_LIMIT,
  autoMap,
  applyMapping,
  type ColumnMapping,
  type ImportFieldKey,
  type MappedRow,
} from "@/lib/import/columns";
import {
  createImportBatch,
  importChunk,
  finalizeImportBatch,
} from "@/app/(dashboard)/accounts/import/actions";

type Step = "upload" | "map" | "preview" | "running" | "done";

type Summary = Awaited<ReturnType<typeof finalizeImportBatch>>;

export function ImportWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [progress, setProgress] = useState({ sent: 0, total: 0, errors: 0 });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = async (format: "xlsx" | "csv") => {
    const headers = IMPORT_FIELDS.map((f) => f.header);
    const example = IMPORT_FIELDS.map((f) => f.example);
    if (format === "csv") {
      const csv = [headers, example]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "schoolconex-leads-template.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    } else {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet([headers, example]);
      ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 18) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Leads");
      XLSX.writeFile(wb, "schoolconex-leads-template.xlsx");
    }
  };

  const handleFile = async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { dense: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
        raw: false,
      });
      if (rows.length === 0) {
        toast.error("No data rows found in the file.");
        return;
      }
      if (rows.length > IMPORT_ROW_LIMIT) {
        toast.error(`File has ${rows.length} rows — the limit is ${IMPORT_ROW_LIMIT}.`);
        return;
      }
      const hdrs = Object.keys(rows[0]);
      setFilename(file.name);
      setHeaders(hdrs);
      setRawRows(rows);
      setMapping(autoMap(hdrs));
      setStep("map");
    } catch (err) {
      toast.error(`Could not read file: ${(err as Error).message}`);
    }
  };

  const mappedPreview = useMemo(() => {
    if (step !== "preview") return { mapped: [] as MappedRow[], droppedNoName: 0 };
    return applyMapping(rawRows, mapping);
  }, [step, rawRows, mapping]);

  const mappingIssues = useMemo(() => {
    const issues: string[] = [];
    const values = Object.values(mapping).filter(Boolean) as ImportFieldKey[];
    if (!values.includes("account_name")) {
      issues.push("Map a column to Account Name — it's required.");
    }
    const dupes = values.filter((v, i) => values.indexOf(v) !== i);
    if (dupes.length > 0) {
      const labels = [...new Set(dupes)].map(
        (d) => IMPORT_FIELDS.find((f) => f.key === d)?.header ?? d,
      );
      issues.push(`Mapped more than once: ${labels.join(", ")}.`);
    }
    return issues;
  }, [mapping]);

  const runImport = async () => {
    const { mapped } = applyMapping(rawRows, mapping);
    if (mapped.length === 0) {
      toast.error("Nothing to import — no rows have an account name.");
      return;
    }
    setStep("running");
    setProgress({ sent: 0, total: mapped.length, errors: 0 });
    try {
      const { batchId } = await createImportBatch({
        filename,
        mapping,
        totalRows: mapped.length,
      });
      setBatchId(batchId);
      let errors = 0;
      for (let i = 0; i < mapped.length; i += IMPORT_CHUNK_SIZE) {
        const chunk = mapped.slice(i, i + IMPORT_CHUNK_SIZE);
        const r = await importChunk({ batchId, rows: chunk });
        errors += r.errors.length;
        setProgress({
          sent: Math.min(i + chunk.length, mapped.length),
          total: mapped.length,
          errors,
        });
      }
      const s = await finalizeImportBatch(batchId);
      setSummary(s);
      setStep("done");
    } catch (err) {
      toast.error(`Import failed: ${(err as Error).message}`);
      setStep("preview");
    }
  };

  if (step === "upload") {
    return (
      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">1 · Start from the template</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-3 text-xs">
            <p>
              Download the template, fill one lead per row (school/company + contact person), and
              upload it back. Column headers in the template map automatically. Your own files work
              too — you&apos;ll just confirm the column mapping.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => downloadTemplate("xlsx")}>
                <Download className="size-3.5" /> Excel template
              </Button>
              <Button size="sm" variant="outline" onClick={() => downloadTemplate("csv")}>
                <Download className="size-3.5" /> CSV template
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">2 · Upload your file</CardTitle>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
              className="text-muted-foreground hover:border-primary/40 hover:bg-muted/30 flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-10 text-sm transition"
            >
              <FileSpreadsheet className="size-8 opacity-50" />
              <span>
                <span className="text-foreground font-medium">Click to choose</span> or drag a .xlsx
                / .csv file here
              </span>
              <span className="text-[11px]">Up to {IMPORT_ROW_LIMIT.toLocaleString()} rows</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "map") {
    const mappedCount = Object.values(mapping).filter(Boolean).length;
    return (
      <div className="max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-muted-foreground text-xs">
            <span className="text-foreground font-medium">{filename}</span> ·{" "}
            {rawRows.length.toLocaleString()} rows · {mappedCount}/{headers.length} columns mapped
          </div>
          <Button variant="ghost" size="sm" onClick={() => setStep("upload")}>
            ← Different file
          </Button>
        </div>

        {mappingIssues.length > 0 && (
          <div className="border-pd-warning-bg bg-pd-warning-bg-light text-pd-warning-strong rounded-md border p-3 text-xs">
            {mappingIssues.map((m) => (
              <div key={m}>{m}</div>
            ))}
          </div>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Match your columns to CRM fields</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Column in your file</TableHead>
                  <TableHead>First value</TableHead>
                  <TableHead>CRM field</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {headers.map((h) => (
                  <TableRow key={h}>
                    <TableCell className="font-medium">{h || "(blank header)"}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[14rem] truncate text-xs">
                      {String(rawRows[0]?.[h] ?? "")}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={mapping[h] ?? "skip"}
                        onValueChange={(v) =>
                          setMapping((m) => ({
                            ...m,
                            [h]: v === "skip" ? null : (v as ImportFieldKey),
                          }))
                        }
                      >
                        <SelectTrigger className="h-8 w-56 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">— Skip this column —</SelectItem>
                          {IMPORT_FIELDS.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.header}
                              {f.required ? " *" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={() => setStep("preview")} disabled={mappingIssues.length > 0}>
            Preview import →
          </Button>
        </div>
      </div>
    );
  }

  if (step === "preview") {
    const { mapped, droppedNoName } = mappedPreview;
    return (
      <div className="max-w-4xl space-y-4">
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <div>
            <span className="text-foreground font-medium">{mapped.length.toLocaleString()}</span>{" "}
            rows will import
            {droppedNoName > 0 && (
              <span className="text-pd-warning-strong ml-2">
                · {droppedNoName} skipped (no account name)
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setStep("map")}>
            ← Adjust mapping
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Preview · first {Math.min(10, mapped.length)} rows
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Contact email</TableHead>
                  <TableHead>Phone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mapped.slice(0, 10).map((r) => (
                  <TableRow key={r.rowIndex}>
                    <TableCell className="font-medium">{r.account.name}</TableCell>
                    <TableCell className="text-xs">{r.account.type ?? "school"}</TableCell>
                    <TableCell className="text-xs">{r.account.country ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.contact
                        ? `${r.contact.firstName ?? ""} ${r.contact.lastName ?? ""}`.trim() || "—"
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{r.contact?.email ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.contact?.phone ?? r.account.phone ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span>
            Existing schools are matched by name (no duplicates); contacts dedupe by email. You can
            revert this import afterwards.
          </span>
          <Button onClick={() => void runImport()}>
            <Upload className="size-3.5" /> Import {mapped.length.toLocaleString()} rows
          </Button>
        </div>
      </div>
    );
  }

  if (step === "running") {
    const pct = progress.total ? Math.round((progress.sent / progress.total) * 100) : 0;
    return (
      <div className="max-w-xl space-y-4">
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="text-sm font-medium">Importing {filename}…</div>
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-muted-foreground text-xs">
              {progress.sent.toLocaleString()} / {progress.total.toLocaleString()} rows
              {progress.errors > 0 && ` · ${progress.errors} errors`}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // done
  return (
    <div className="max-w-xl space-y-4">
      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="text-pd-positive size-5" /> Import complete
          </div>
          {summary && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Stat label="New accounts" value={summary.accountsCreated} />
              <Stat label="Matched existing accounts" value={summary.accountsMatched} />
              <Stat label="New contacts" value={summary.contactsCreated} />
              <Stat label="Contacts enriched" value={summary.contactsUpdated} />
              <Stat label="Rows skipped" value={summary.skipped} />
              <Stat label="Errors" value={summary.errors.length} />
            </div>
          )}
          {summary && summary.errors.length > 0 && (
            <div className="bg-muted/30 text-muted-foreground max-h-32 overflow-y-auto rounded border p-2 text-[11px]">
              {summary.errors.slice(0, 20).map((e) => (
                <div key={e.row}>
                  Row {e.row}: {e.message}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            {batchId && (
              <Button asChild size="sm">
                <Link href={`/accounts/imports/${batchId}`}>View imported leads</Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link href="/accounts">Go to accounts</Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setStep("upload");
                setSummary(null);
                setBatchId(null);
              }}
            >
              Import another file
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/20 rounded border px-2 py-1.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

export { ImportWizard as default };
