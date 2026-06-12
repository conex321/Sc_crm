## File & Directory Map

- `e:\Claude\SchoolConex\SchoolConex_CRM\` — project root (Next.js 16 + Supabase + Drizzle CRM, ~25 routes, 9 commits)
- `Project_notes_folder/` — persistent notes (single-file mode)
  - `PROJECT_NOTES.md` — this file
  - `CHANGELOG.md` — append-only audit log
- `.claude/skills/update-project-notes/SKILL.md` + `.codex/skills/update-project-notes/SKILL.md` — auto-invoked notes skill
- `docs/superpowers/specs/2026-05-06-schoolconex-crm-design.md` — final design spec, source of truth
- `app/`, `components/`, `lib/`, `inngest/`, `supabase/migrations/` — main app code (see spec for layout)
- `scripts/` — operational scripts:
  - `apply-sql.mts` / `run-demo-user.mts` / `run-rayan-user.mts` / `remove-rayan-user.mts` — DB ops
  - `dialpad-{lookup-user,list-calls,backfill}.mts` — Dialpad ops (`npm run dialpad:*`)
  - `check-calls.mts` — DB inspection
  - `e2e-rayan.mts` + `e2e-inbox-check.mts` — programmatic e2e auth + render tests
  - `browser-launch.mts` — long-running headed Chrome over CDP, port 9222
  - `gcp-*.mts` (~15 scripts) — small one-shot GCP browser actions: probe, dismiss, list, create, enable, etc.
  - `drive-smoke.mts` — Drive SA smoke test (now exercises full create+delete with `supportsAllDrives:true`)
  - `drive-create-shared-drive.mts` / `drive-add-sa-member.mts` / `drive-finish-add-sa.mts` — UI-driven Shared Drive setup attempts (kept for reference; the working path is OAuth)
  - `drive-oauth-add-sa.mts` — one-shot OAuth loopback flow that adds the SA to the Shared Drive via REST. Reusable for any other admin-task that needs user-OAuth (just swap the API call).
  - `drive-create-folders-in-sd.mts` — idempotent: ensures `CRM Templates` + `CRM Generated` exist inside the Shared Drive, prints folder IDs.
  - `drive-wait-signin.mts` / `drive-wait-cloud-console.mts` / `cdp-probe.mts` / `drive-snap.mts` — small CDP utilities for orchestrating headed-browser flows.
  - `gcp-add-redirect-uri-do.mts` / `gcp-add-redirect-v2.mts` / `gcp-verify-redirect.mts` — Cloud Console redirect-URI management (used to register `http://localhost:53682/oauth/callback`).
- `.playwright-profile/` — persistent Chrome profile (gitignored)
- `.playwright-shots/` — debugging screenshots from automation runs (gitignored)
- `.secrets/service-account.json` — Drive service account JSON key (gitignored)
- `.env.local` — Supabase URL+anon, Postgres DATABASE_URL, Dialpad admin key + Rayan filter, Google OAuth client id+secret + service account JSON + folder IDs + project id (gitignored)
- `test.md` — empty file user opened in IDE; ignore
- Outside project root:
  - `C:\Users\msefa\.claude\plans\i-d-like-you-to-serene-emerson.md` — Claude Code plan-mode plan file (was active during brainstorm; now obsolete)
- **GCP project under SchoolConex Workspace:** `schoolconex-crm` (project number `489266381443`, owner matthew@schoolconex.com)
- **Supabase project:** `ooanslwrwjexdjwdphes`

---

