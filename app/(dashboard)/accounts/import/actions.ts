"use server";

import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { processChunk, finalizeBatch } from "@/lib/import/engine";
import {
  IMPORT_CHUNK_SIZE,
  IMPORT_ROW_LIMIT,
  type ColumnMapping,
  type MappedRow,
} from "@/lib/import/columns";

const createSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  mapping: z.record(z.string(), z.string().nullable()),
  totalRows: z.number().int().min(1).max(IMPORT_ROW_LIMIT),
});

export async function createImportBatch(input: {
  filename: string;
  mapping: ColumnMapping;
  totalRows: number;
}): Promise<{ batchId: string }> {
  const user = await requireUser();
  const parsed = createSchema.parse(input);
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("import_batches")
    .insert({
      created_by: user.id,
      filename: parsed.filename,
      source: "csv_upload",
      status: "running",
      mapping: parsed.mapping,
      total_rows: parsed.totalRows,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { batchId: data.id };
}

const rowSchema = z.object({
  rowIndex: z.number().int().min(1),
  account: z.object({
    name: z.string().min(1).max(500),
    type: z.enum(["school", "aspiring_founder", "district", "other"]).optional(),
    website: z.string().max(500).optional(),
    phone: z.string().max(500).optional(),
    address: z.string().max(500).optional(),
    country: z.string().max(500).optional(),
    source: z.string().max(500).optional(),
    email: z.string().max(500).optional(),
    linkedin: z.string().max(500).optional(),
  }),
  contact: z
    .object({
      firstName: z.string().max(500).optional(),
      lastName: z.string().max(500).optional(),
      role: z.string().max(500).optional(),
      email: z.string().max(500).optional(),
      phone: z.string().max(500).optional(),
      whatsappPhone: z.string().max(500).optional(),
      linkedin: z.string().max(500).optional(),
    })
    .optional(),
});

const chunkSchema = z.object({
  batchId: z.string().uuid(),
  rows: z.array(rowSchema).min(1).max(IMPORT_CHUNK_SIZE),
});

export async function importChunk(input: {
  batchId: string;
  rows: MappedRow[];
}): Promise<{
  processed: number;
  accountsCreated: number;
  contactsCreated: number;
  errors: { row: number; message: string }[];
}> {
  const user = await requireUser();
  const parsed = chunkSchema.parse(input);
  const sb = await getSupabaseServerClient();

  // RLS restricts visibility to own batches, so this doubles as an ownership check.
  const { data: batch, error } = await sb
    .from("import_batches")
    .select("id, status")
    .eq("id", parsed.batchId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!batch) throw new Error("Import batch not found.");
  if (batch.status === "reverted") throw new Error("This batch was reverted.");

  const result = await processChunk(sb, {
    batchId: parsed.batchId,
    userId: user.id,
    defaultSource: "csv_import",
    rows: parsed.rows as MappedRow[],
  });
  return {
    processed: result.processed,
    accountsCreated: result.accountsCreated,
    contactsCreated: result.contactsCreated,
    errors: result.errors,
  };
}

export async function finalizeImportBatch(batchId: string) {
  await requireUser();
  z.string().uuid().parse(batchId);
  const sb = await getSupabaseServerClient();
  // RLS scopes to own batch; finalize recomputes stats from lineage.
  return finalizeBatch(sb, batchId);
}
