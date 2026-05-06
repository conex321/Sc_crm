"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function signInWithGoogle(formData: FormData) {
  const next = (formData.get("next") as string | null) ?? "/accounts";
  const supabase = await getSupabaseServerClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const callback = `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback,
      queryParams: {
        prompt: "select_account",
        // Restrict the Google account picker to schoolconex.com if possible.
        // The DB trigger is the hard guarantee — this is a UX hint.
        hd: process.env.ALLOWED_EMAIL_DOMAIN ?? "schoolconex.com",
      },
    },
  });

  if (error || !data?.url) {
    redirect(`/login?error=exchange`);
  }
  redirect(data.url);
}
