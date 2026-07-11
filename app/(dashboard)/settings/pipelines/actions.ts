"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";

const rotDaysSchema = z.object({
  stageId: z.string().uuid(),
  rotDays: z.number().int().min(1).max(365).nullable(),
});

/** Admin-only: set/clear the rotting threshold (days) for a stage. Null = off. */
export async function updateStageRotDays(stageId: string, rotDays: number | null) {
  await requireRole(["admin"]);
  const parsed = rotDaysSchema.parse({ stageId, rotDays });

  const sb = await getSupabaseServerClient();
  const { data, error } = await sb
    .from("pipeline_stages")
    .update({ rot_days: parsed.rotDays })
    .eq("id", parsed.stageId)
    .select("id");
  if (error) throw new Error(error.message);
  // RLS filtering to 0 rows would otherwise look like a successful save.
  if (!data || data.length === 0) {
    throw new Error("Stage not found or you don't have permission to edit it.");
  }
  revalidatePath("/settings/pipelines");
}
