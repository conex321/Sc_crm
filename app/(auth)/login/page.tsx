import { signInWithGoogle, signInWithEmailPassword } from "./actions";
import { Suspense } from "react";

export default async function LoginPage(props: {
  searchParams: Promise<{ next?: string; reason?: string; error?: string }>;
}) {
  const params = await props.searchParams;
  const next = params.next ?? "/accounts";
  const reason = params.reason;
  const error = params.error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold tracking-tight">SchoolConex CRM</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Internal sales tool. Sign in with your @schoolconex.com Google account.
          </p>
        </div>

        {error === "domain" && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            That account isn&apos;t on the @schoolconex.com domain.
          </div>
        )}
        {error === "exchange" && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            We couldn&apos;t complete sign-in. Please try again.
          </div>
        )}
        {error === "credentials" && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            Wrong email or password.
          </div>
        )}
        {error === "missing" && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            Email and password are required.
          </div>
        )}
        {reason === "inactive" && (
          <div className="mb-4 rounded-md border border-amber-300/50 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
            Your account is deactivated. Ask an admin to reactivate it.
          </div>
        )}

        <Suspense>
          <form action={signInWithEmailPassword} className="grid gap-2">
            <input type="hidden" name="next" value={next} />
            <input
              type="email"
              name="email"
              required
              placeholder="you@schoolconex.com"
              autoComplete="email"
              className="h-9 rounded-md border bg-background px-2 text-xs"
            />
            <input
              type="password"
              name="password"
              required
              placeholder="Password"
              autoComplete="current-password"
              className="h-9 rounded-md border bg-background px-2 text-xs"
            />
            <button
              type="submit"
              className="h-9 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Sign in
            </button>
          </form>

          <div className="my-4 flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next} />
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-accent"
            >
              <GoogleIcon className="size-4" />
              Continue with Google
            </button>
          </form>
        </Suspense>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Internal use only · @schoolconex.com only
        </p>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 11.84v3.66h5.13c-.21 1.18-1.55 3.46-5.13 3.46-3.09 0-5.61-2.56-5.61-5.71s2.52-5.71 5.61-5.71c1.76 0 2.94.75 3.62 1.4l2.47-2.39C16.46 5.18 14.43 4.25 12 4.25c-4.83 0-8.75 3.92-8.75 8.75s3.92 8.75 8.75 8.75c5.05 0 8.39-3.55 8.39-8.55 0-.57-.06-1.01-.14-1.36H12z"
      />
    </svg>
  );
}
