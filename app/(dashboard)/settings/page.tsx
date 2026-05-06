import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";

export default async function SettingsIndexPage() {
  await requireRole(["admin"]);
  redirect("/settings/users");
}
