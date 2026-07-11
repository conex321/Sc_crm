# Session 2026-07-11 — GTM CRM Blueprint

**Agent:** Codex
**Duration / scope:** Deep research and read-only architecture audit, plus one research artifact
**Related decisions:** None — recommendations await user review

## What was done

- Audited the current CRM schema, routes, integrations, project notes, active Pipedrive-parity roadmap, sales overview, legacy sales scripts, and regional email sequences.
- Researched current primary sources for Apollo, PhantomBuster, Firecrawl, Mailshake, OpenAI/Claude agent tooling, Gmail/Calendar, PandaDoc/Stripe, deliverability, education datasets, LinkedIn terms, CASL, CAN-SPAM, and UK PECR/GDPR guidance.
- Produced an end-to-end source-to-onboarding GTM operating blueprint with data sources, lifecycle/schema recommendations, scoring, agent governance, outreach sequences, compliance, metrics, acceptance tests, and a 30/60/90 roadmap.

## Files touched

- `docs/research/2026-07-11-schoolconex-gtm-crm-blueprint.md`
- Notes/navigation bookkeeping files listed in `CHANGELOG.md`

## Decisions made

- None. The artifact is explicitly a research-backed proposal, not authorization to implement, activate campaigns, or send outreach.

## Failures encountered

- The patching tool could create the blueprint but then failed on existing-file edits because the Windows restricted-token sandbox could not enforce the configured split writable roots. A scoped workspace-only PowerShell fallback completed required notes/navigation maintenance.

## Handoff notes

- Highest-priority risks found: no canonical consent/suppression/provenance layer; first-class Leads not yet shipped; Mailshake webhook activation incomplete; Gmail send/Calendar sync absent; e-signature not authoritative; Stripe webhook processing still depends on production-inactive Inngest; legacy copy contains claims that need a reviewed claim library.
- Recommended near-term operating model keeps CRM as source of truth, Apollo + Firecrawl for enrichment, Mailshake for bulk sequences, Gmail for engaged one-to-one mail, existing Google appointment schedules for booking, and a PandaDoc + Stripe pilot for proposal/sign/pay.