# Session 2026-07-03 — notes-infrastructure-alignment

**Agent:** Claude
**Duration / scope:** Short housekeeping session (continuation of the 2026-06-12 session after context compaction). No app code touched.
**Related decisions:** D-040

## What was done

- Audited the CRM's project-memory setup against the reference setups in `E:\Claude\SchoolConex\` and `E:\Claude\Cobionix\`. Already in place: split-mode `Project_notes_folder\`, project-local `update-project-notes` skill in both `.claude\skills\` and `.codex\skills\` (byte-identical, md5 bb863a0d…).
- Created repo root `CLAUDE.md` (Cobionix pattern): read-notes-first + self-perpetuation clause, gws-sc account lock + draft-only rules, and the repo footguns (Drizzle service-role vs Supabase RLS split, `NEXT_PUBLIC_*` rebuild requirement, D-039 roles, Mailshake owner stamping, commit/push only on request).
- Added `E:\Claude\SchoolConex\SchoolConex_CRM\` row to the project mapping table in the global skill `C:\Users\msefa\.claude\skills\update-project-notes\SKILL.md`, above the broader `E:\Claude\SchoolConex\` row so the more specific prefix matches first. (The parent SchoolConex row already existed.)

## Files touched

- `CLAUDE.md` (new, repo root)
- `C:\Users\msefa\.claude\skills\update-project-notes\SKILL.md` (one table row)
- `Project_notes_folder\PROJECT_NOTES.md`, `decisions.md`, `sessions\INDEX.md`, `CHANGELOG.md`, this file

## Decisions made

- D-040 — notes-process wiring standardized (root CLAUDE.md + global mapping-table row; skill copies must stay byte-identical across `.claude`/`.codex`).

## Failures encountered

- None.

## Handoff notes

- Still pending from 2026-06-12: **Matthew + Rayan each connect Gmail** at `https://sc-crm-sand.vercel.app/settings/integrations` (0 `google_gmail` credential rows as of last check). After the first connect, trigger `/api/cron/gmail-sync` with `Authorization: Bearer $CRON_SECRET` to verify ingestion immediately.
- Commit `4663f9a` (per-rep RLS + attach UI) exists on `feat/mailshake-activation` but is **not pushed**; the new `CLAUDE.md` and these notes edits are uncommitted. Commit/push only when Matthew asks.
