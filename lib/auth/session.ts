import "server-only";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { users, type User } from "@/lib/db/schema";

export type SessionUser = User & { authEmail: string };

export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const profile = await db.query.users.findFirst({
    where: eq(users.id, authUser.id),
  });

  if (!profile) return null;
  return { ...profile, authEmail: authUser.email ?? profile.googleEmail };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive) redirect("/login?reason=inactive");
  return user;
}

export async function requireRole(
  allowed: ReadonlyArray<User["role"]>,
): Promise<SessionUser> {
  const user = await requireUser();
  if (!allowed.includes(user.role)) redirect("/accounts?reason=forbidden");
  return user;
}
