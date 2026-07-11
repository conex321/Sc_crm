# Phase 1: Pipedrive design system - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss; decisions pre-made by Matthew 2026-07-11)

<domain>
## Phase Boundary

The whole app renders in Pipedrive's visual language on a token foundation every later phase builds on, with no functional regression. Covers DSGN-01..05: three-layer token system in Tailwind v4, top bar with global search + green "+" quick-add, Pipedrive-fashion left nav, coherent re-skin of all existing screens, CAD formatter sweep. Does NOT cover new features (deals/leads/contacts/email/insights are later phases).

</domain>

<decisions>
## Implementation Decisions

### Locked by Matthew (2026-07-11)
- FULL Pipedrive look — their visual language (white surfaces, Pipedrive-green primary, gray ink hierarchy), SchoolConex logo/name kept.
- Compact data density preserved (14px root, text-xs/sm patterns stay).
- Dark mode must keep working.

### From verified research (docs/research/pipedrive-teardown.md — build to spec)
- Token architecture: base numeric shade scales (0–800 per color, contrast-matched) → semantic groups Surface / Fill / Divider / Text / Icon / Primary / Secondary / Active / Negative / Warning / Positive / Info → components. $primary-default aliases green-600.
- Exact hex values: sample from Pipedrive's Figma Community files (figma.com/@pipedrive) and/or the live app's CSS custom properties during this phase. If unreachable, derive a faithful palette from public Pipedrive screenshots (their green ≈ #017737 family for primary actions on white) and document the source.

### Claude's Discretion
- Mapping strategy from semantic tokens onto the existing shadcn CSS variables (keep shadcn component API; swap variable values + add pd-* tokens as needed).
- Nav structure details (grouping/order) so long as it reads Pipedrive-fashion and existing routes keep working; new nav slots for Leads/People/Orgs/Mail/Insights may point at existing or placeholder targets ONLY if they don't confuse (prefer adding nav items in the phases that ship those routes).
- Quick-add "+" menu wiring: entries for existing creatables now (Deal/Account/Contact/Activity); Lead/Person/Org entries land with their phases.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- components/ui/* (shadcn kit) — restyle via CSS variables in app/globals.css (@theme, OKLCH, dark mode via next-themes).
- components/layout/app-sidebar.tsx + top-bar.tsx — the shell to restyle; global-search.tsx is a ⌘K stub (search wiring is Phase 4; the FIELD can render now).
- lib/crm/dashboard.ts fmtCad — extend into a shared money formatter; sweep legacy USD hardcodes (components/crm/opportunity-list.tsx, components/crm/document-list.tsx, app/(dashboard)/settings/catalog/page.tsx, app/(dashboard)/opportunities/[id]/page.tsx).

### Established Patterns
- Tailwind v4 @theme inline tokens; 14px root; density conventions in .planning/codebase/CONVENTIONS.md.
- Verification gate: tsc + build + e2e walk (scripts/e2e-rayan.mts) + Playwright pass; deploy npx vercel --prod --yes; report; notes skill.

### Integration Points
- app/globals.css (tokens), app/(dashboard)/layout shell, every existing page inherits.

</code_context>

<specifics>
## Specific Ideas

- Match Pipedrive: white content surfaces on light gray app background, green solid primary buttons, blue links, colored label chips, stage-colored elements later. Buttons/badges/chips/table row styling per teardown + reference screenshots.
- Keep "Phase 1 · <sha>" footer but restyle.

</specifics>

<deferred>
## Deferred Ideas

- Leads/People/Orgs/Mail/Insights routes + nav entries — Phases 3-6.
- Stage-colored kanban columns + label chips on cards — Phase 2 (tokens for them land now).

</deferred>
