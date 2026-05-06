"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";

const roleSchema = z.enum(["rep", "manager", "admin"]);

export async function setUserRole(userId: string, role: string) {
  await requireRole(["admin"]);
  const parsed = roleSchema.parse(role);
  const sb = await getSupabaseServerClient();
  const { error } = await sb.from("users").update({ role: parsed }).eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/users");
}

export async function setUserActive(userId: string, isActive: boolean) {
  await requireRole(["admin"]);
  const sb = await getSupabaseServerClient();
  const { error } = await sb
    .from("users")
    .update({ is_active: isActive })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/users");
}
