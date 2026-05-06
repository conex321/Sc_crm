# Changelog

Append-only audit trail. Newest entries at the bottom. Never rewrite past entries.

---

## 2026-05-06T00:00Z — Claude
- session: 2026-05-06 brainstorm + design (single-file mode; no `sessions/` folder yet — will be created on split)
- decisions_added: [D-001, D-002, D-003, D-004, D-005, D-006, D-007, D-008, D-009, D-010, D-011, D-012]
- failures_added: []
- files_changed: [Project_notes_folder/PROJECT_NOTES.md, Project_notes_folder/CHANGELOG.md, .claude/skills/update-project-notes/SKILL.md, .codex/skills/update-project-notes/SKILL.md]
- next: write design spec to docs/superpowers/specs/2026-05-06-schoolconex-crm-design.md, user reviews spec, then invoke superpowers:writing-plans

## 2026-05-06T00:30Z — Claude
- session: 2026-05-06 spec write + tightening (still single-file mode)
- decisions_added: [D-013, D-014, D-015, D-016]
- failures_added: []
- files_changed: [docs/superpowers/specs/2026-05-06-schoolconex-crm-design.md, Project_notes_folder/PROJECT_NOTES.md, Project_notes_folder/CHANGELOG.md, .claude/skills/update-project-notes/SKILL.md, .codex/skills/update-project-notes/SKILL.md]
- next: begin Phase 1 step 1 — initialize project structure (git init, scaffold Next.js 15 + Tailwind v4 + shadcn/ui, create folder shape)

## 2026-05-06T01:00Z — Claude
- session: 2026-05-06 Phase 1 step 1 (scaffold)
- decisions_added: []
- failures_added: [F-001]
- files_changed: [.gitignore, package.json, package-lock.json, tsconfig.json, next.config.ts, postcss.config.mjs, eslint.config.mjs, .prettierrc.json, components.json, .env.example, README.md, app/layout.tsx, app/page.tsx, app/globals.css, lib/utils.ts, plus .gitkeep markers in app/(auth), app/(dashboard)/{accounts,opportunities,settings}, components/{crm,layout,ui}, lib/{supabase,db,auth,crm}, supabase/{migrations,seed}, inngest]
- commit: a47f81a "Phase 1 step 1: scaffold Next.js 15 + Tailwind v4 + Supabase + Drizzle"
- verified: npm run build passes (Turbopack, 6s compile, 3 static routes); npm audit shows 0 high vulns (6 moderate remain in Next-bundled postcss/esbuild — npm cannot fix without breakage)
- stack-actual: Next.js 16.2.4 (auto-upgraded from 15.1.6 due to CVE-2025-66478), React 19.0.0, Tailwind v4.0, Drizzle 0.45.2 (latest patched), TypeScript 5.7
- next: Phase 1 step 2 — Supabase schema + migrations (lib/db/schema.ts, drizzle.config.ts, supabase/migrations/0001_initial.sql with RLS scaffolding)
