# Session 2026-07-11 — Current GTM stack and operating plan

**Agent:** Codex  
**Duration / scope:** Deep research and repository audit; current-state overview plus target operating plan  
**Related decisions:** Research recommendation only; no new implementation decision ID assigned

## What was done

- Audited the current SchoolConex GTM stack across the CRM, website, project notes, and sales/marketing knowledge archive.
- Added an evidence-labelled current-state overview covering data sources, CRM, Mailshake, Klaviyo, Resend, Google Workspace, Apollo, PhantomBuster, Firecrawl, Dialpad, proposals, Stripe/QuickBooks, analytics, and orchestration.
- Explicitly recorded Klaviyo as user-confirmed but not represented in local integrations, and identified the existing Resend five-step nurture as a potential duplicate-motion conflict.
- Produced a target operating plan with CRM as the control plane and explicit email ownership: Mailshake for cold outbound, Klaviyo for consented lifecycle, Resend for transactional, and Gmail for human one-to-one.
- Added a canonical lifecycle, data objects, suppression policy, source-to-paid workflow, Google Workspace design, GTM agent/tool boundary, playbooks, metrics, acceptance tests, and phased rollout.
- Used current official Klaviyo, Google Workspace, Apollo, PandaDoc, and Stripe documentation for unstable platform capabilities and limitations.
- No vendor configuration, CRM data, campaign, sequence, email, proposal, or payment state was changed.

## Files touched

- `docs/research/2026-07-11-schoolconex-current-gtm-stack-overview.md`
- `docs/research/2026-07-11-schoolconex-repeatable-gtm-operating-plan.md`
- `Project_notes_folder/PROJECT_NOTES.md`
- `Project_notes_folder/CHANGELOG.md`
- `Project_notes_folder/sessions/INDEX.md`
- `Project_notes_folder/sessions/2026-07-11-current-gtm-stack-and-operating-plan.md`
- Workspace `file_structure.md`

## Decisions made

No implementation decision was made. The documents recommend, subject to approval and account-level inventory:

- CRM owns truth/control.
- Mailshake owns cold outbound.
- Klaviyo owns consented lifecycle nurture.
- Resend becomes transactional-only after a controlled Klaviyo migration.
- Gmail/Calendar/Drive remain the human collaboration layer.
- PandaDoc should be piloted for e-signature with Stripe payments.
- OpenAI/Claude should operate through typed, audited CRM tools and approval gates.

## Failures encountered

- The Windows restricted-token wrapper continued to reject `apply_patch` edits to existing files despite the workspace being a declared writable root. New research-file creation succeeded; required maintenance edits used approved PowerShell writes after the patch path failed.

## Handoff notes

- Start implementation with a one-week vendor-account inventory, especially Klaviyo lists/segments/flows/forms/suppressions and the Resend overlap.
- Do not activate a Klaviyo flow equivalent to the current website nurture until mutual exclusion (`nurture_owner`) is implemented and tested.
- Do not enroll any new cold cohort outside CRM approval and universal suppression checks.
- Verify both research documents with the requirements checklist before treating this research goal as complete.
