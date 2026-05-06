import { redirect } from "next/navigation";

export default function HomePage() {
  // Phase 1 step 3 will replace this with auth-aware routing:
  // - signed-in users → /accounts
  // - anonymous → /login
  redirect("/accounts");
}
