---
name: update-project-notes
description: Updates the project notes folder after every material change during a session. Invoke whenever a decision is made, a file is meaningfully changed, a bug is fixed, a failure is encountered, or before handing off to the other agent. Keeps PROJECT_NOTES.md, CHANGELOG.md, and session files in sync, and performs file splits when any notes file crosses 500 lines. Designed to be called repeatedly within a single session, not just at session end.
---

# update-project-notes

This skill is **continuous, not a wrap-up**. It runs after every material change throughout a session so the notes always reflect reality.

## Notes folder location

`e:\Claude\SchoolConex\SchoolConex_CRM\Project_notes_folder\`

## What counts as a material change

Any of:
- A decision was made
- A file was created, deleted, or meaningfully edited
- A bug was fixed
- A failure was hit
- An architecture shift happened
- A dependency was added
- A TODO was resolved
- About to hand off to the other agent

## Triggers

- A material change just landed — run BEFORE moving to the next task
- The user says "update notes", "log that", "save progress"
- About to end a session or hand off
- Starting a session — read notes first, then run after the first material change
- Explicitly invoked by name

## Procedure (every invocation)

1. **Read `PROJECT_NOTES.md`** — detect `Notes mode: single-file` vs `split`.
2. **Check line count** of the target file(s) before writing.
3. **If single-file mode and the result would exceed 500 lines** → perform the split migration (see "Split migration" below). Commit the split as its own step BEFORE adding new content.
4. **If split mode and any individual file would exceed 500 lines** → split that file by topic (not by date). The parent file becomes an index. Never split `PROJECT_NOTES.md` itself — it stays the root entry point.
5. **Merge new content** into the correct sections. NEVER blind-append except to `CHANGELOG.md` and `sessions/INDEX.md`.
6. **Assign new stable IDs** for new decisions (`D-NNN`) or failures (`F-NNN`). Never reuse retired IDs.
7. **Update `Last updated`, `Last agent`, `Session summary`, `Total sessions logged`** in `PROJECT_NOTES.md`.
8. **Append one block to `CHANGELOG.md`** (one block per invocation, not per session — finer history is better).
9. **Output the one-line confirmation:** `📝 Notes updated: <file(s)>, IDs: <D-/F- IDs added>`.

## Lightweight mode

If the change touches one file and introduces no new decisions or failures: update only `CHANGELOG.md` and the `Last updated` field. Skip the full merge. The next substantive change consolidates these micro-entries.

## Self-perpetuation clause

After running this skill, the agent must continue using it for the remainder of the session. Every subsequent material change triggers another run. This is not optional and does not require re-authorization from the user. If the agent catches itself having made a material change without updating notes, it runs the skill immediately to catch up, then continues. The agent also ends every assistant turn that included a material change with a one-line confirmation: `📝 Notes updated: <file(s)>, IDs: <D-/F- IDs added>`.

## Split migration (single-file → split)

When `PROJECT_NOTES.md` would exceed 500 lines after the next write, before writing:

1. Create the directory `Project_notes_folder/sessions/`.
2. Migrate content out of `PROJECT_NOTES.md` into:
   - `decisions.md` — Architecture & Key Decisions section (append-only, ADR-style)
   - `file-map.md` — File & Directory Map
   - `failures.md` — Failures & Resolutions
   - `context.md` — Context for the Next Agent
   - `sessions/INDEX.md` — one-line summary per session, newest first
   - `sessions/YYYY-MM-DD-<slug>.md` — split the Accomplishments Log by session
3. `PROJECT_NOTES.md` becomes the index — keep `Current State`, `Open Questions / Next Steps`, the `Index` block, and the `How to read this folder` block. Set `Notes mode: split`. Set `Total sessions logged: <n>`.
4. `CHANGELOG.md` is unchanged by the split; continue appending.

After splitting, `PROJECT_NOTES.md` looks like:

```markdown
# Project Notes — SchoolConex CRM

**Last updated:** <ISO date>
**Last agent:** <Claude | Codex>
**Session summary:** <1–2 sentences>
**Notes mode:** split
**Total sessions logged:** <n>

## Current State
<kept inline — fresh agent reads first>

## Open Questions / Next Steps
<kept inline — second thing a fresh agent reads>

## Index
- Decisions → `decisions.md`
- File map → `file-map.md`
- Failures & resolutions → `failures.md`
- Conventions & gotchas → `context.md`
- Session history → `sessions/INDEX.md`
- Raw change log → `CHANGELOG.md`

## How to read this folder
1. Read this file end-to-end.
2. Read `context.md` before touching code.
3. Check `sessions/INDEX.md` for the last 3 sessions.
4. Load other files on demand.
```

## Session file format (split mode)

`sessions/YYYY-MM-DD-<slug>.md`:

```markdown
# Session YYYY-MM-DD — <slug>

**Agent:** <Claude | Codex>
**Duration / scope:** <short>
**Related decisions:** <links into decisions.md>

## What was done
## Files touched
## Decisions made (link to decisions.md entries)
## Failures encountered (link to failures.md entries)
## Handoff notes
```

`sessions/INDEX.md` — one line per session, newest first:

```markdown
- 2026-04-18 — <slug> — <one-sentence summary> — [Claude]
```

When `sessions/INDEX.md` exceeds 500 lines, archive everything older than 90 days into `sessions/archive/YYYY-QN.md` and leave a pointer in the index.

## CHANGELOG.md format

```markdown
## 2026-04-18T14:32Z — Claude
- session: sessions/2026-04-18-auth-refactor.md
- decisions_added: [D-017, D-018]
- failures_added: [F-009]
- files_changed: [src/auth/, src/middleware/session.ts]
- next: finish token rotation, see Open Questions #3
```

## Format conventions

- Plain markdown only — no agent-specific syntax or tool references
- Absolute file paths, exact commands, pinned versions
- Never write "I did X" — write "Session on <date> did X"
- Cross-reference by stable ID (`D-017`, `F-009`), not line numbers or section titles
- When editing an existing section, preserve its structure — merge in, don't append to the bottom

## Stable ID counters (update when assigning new IDs)

- Decisions: D-001 through D-016 assigned (next: D-017)
- Failures: F-001, F-002, F-003 assigned (next: F-004)
