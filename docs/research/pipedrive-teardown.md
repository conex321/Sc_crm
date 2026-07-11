# Pipedrive Product Teardown — verified research (D-045)

> Produced 2026-07-11 by the deep-research workflow (104 agents; every claim below survived 3-vote adversarial verification against primary sources — Pipedrive's Knowledge Base and their design-system lead's published case study). Feeds the pipedrive-parity-v1 GSD milestone.

## Summary

Adversarial verification confirmed a solid, primary-sourced skeleton for a Pipedrive clone across three layers. Feature inventory: Pipedrive's plan matrix defines an all-tier baseline (customizable pipelines, deal cards, rotting, leads inbox, contacts/orgs, activities+calendar, custom fields, import/export, Insights, mobile, Google/Microsoft sync, API/webhooks) with the email suite, Automations (delay + if/else steps), Sequences, Forecast view and Contacts timeline gated to Growth+, and LeadBooster (Chatbot, Live Chat, Web Forms, Prospector), Smart Docs, and Projects included at Premium+. Behavioral mechanics are precisely documented for the pipeline kanban (default card fields, next-activity sorting with newest-first tiebreak, single-pipeline membership, won/lost removal), the rotting feature (per-stage day thresholds, red tile, last-update timer with specific reset actions), the forecast view (expected-close-date bucketing, won-date override, weighted values, gear-icon Show by/Arrange by, drag-to-reschedule), and the Leads Inbox (unqualified-lead holding area, mandatory person/org link, customizable list view, and a detail panel with left-side record sections plus right-side Composer/Focus/History). Design system: Pipedrive uses a layered token architecture (base numeric shade scales 0-800, semantic groups like Surface/Fill/Text/Primary/Negative aliased to base shades, e.g. $primary-default = $green-600) modeled on IBM Carbon and Atlassian. The requested user-review prioritization signal (G2/Capterra/Reddit rankings) did not survive verification and remains an open gap.

## Verified findings

### [confidence: high] Build-first baseline

Build-first baseline: every Pipedrive plan, including the cheapest Lite tier, ships customizable pipelines, deal card customization, deal rotting, data import/export, merge duplicates, products catalog, custom fields, leads inbox, people/organization management, contacts map, calendar view + activity management, Smart Bcc, API access, webhooks, AI-powered report creation, Insights reporting and dashboard, visibility options, mobile iOS/Android apps, and Google/Microsoft contact + calendar sync. Pipedrive's own Knowledge Base taxonomy separately confirms Automations, Smart Docs, Project management, and Products as distinct documented feature modules. This is the core CRM surface a clone must implement first; note that quantity/depth scales by tier even where a feature exists everywhere (e.g. Lite gets one Insights dashboard, custom visibility groups are Premium+).

**Evidence:** Plan matrix (new-plans table, all four tiers checked): 'Customizable pipelines ✔️✔️✔️✔️ | Deal card customization ✔️✔️✔️✔️ | Deal rotting ✔️✔️✔️✔️ | ... Leads inbox ✔️✔️✔️✔️ | ... Insights reporting ✔️✔️✔️✔️ | Mobile Android and iOS apps ✔️✔️✔️✔️'. KB feature categories: 'Automations (/category/features/workflow-automation) ... Smart Docs (/category/features/sales-documents) ... Project management ... Products'. Merges claims 0, 2, and 3.

**Sources:** https://support.pipedrive.com/en/article/what-features-do-the-pipedrive-plans-have · https://support.pipedrive.com/en/category/features

### [confidence: high] Tier gating that doubles as a natural build-phase sequence

Tier gating that doubles as a natural build-phase sequence: the full email suite (email sync, templates/signatures, open+click tracking, group emailing, email scheduling, meeting scheduler), the Automations engine including delay/wait and if/else branching steps, plus Sequences, Forecast view, and Contacts timeline are all absent from Lite and appear only at Growth (second tier) and above — Pipedrive itself treats these as second-wave capability on top of the core CRM.

**Evidence:** Parsed plan table shows empty Lite cell with checkmarks on Growth/Premium/Ultimate for every listed feature: 'Email sync [- Y Y Y], Email templates and signatures [- Y Y Y], Email open and click tracking [- Y Y Y], Group emailing [- Y Y Y], Automations [- Y Y Y], Delay and wait for steps [- Y Y Y], If/else steps [- Y Y Y], Sequences [- Y Y Y], Forecast view [- Y Y Y], Contacts timeline [- Y Y Y]'. Claim 4.

**Sources:** https://support.pipedrive.com/en/article/what-features-do-the-pipedrive-plans-have

### [confidence: high] Premium-tier add-on modules

Premium-tier add-on modules: LeadBooster is a bundled add-on (included on Premium+, paid add-on below) comprising exactly four features — Chatbot (website lead self-qualification), Live Chat, Web Forms (embeddable forms funneling visitors into Pipedrive as deals or leads), and Prospector (outbound lead-gen search). Smart Docs (document sync/editing from Google Drive, OneDrive, SharePoint — the quotes/documents module) and Projects (post-sales activity management spanning closed and open deals) are likewise included on Premium and higher.

**Evidence:** 'LeadBooster add-on – Available on Premium and higher plans and comes with the following features: Chatbot... Live Chat... Web Forms... Prospector... Smart Docs – Included on Premium and higher plans. Helps to sync your documents from Google Drive, Microsoft OneDrive or SharePoint... Projects – Included on Premium and higher plans.' Plan table row: 'LeadBooster add-on: Paid add-on | Paid add-on | included | included'. Merges claims 1 and 5.

**Sources:** https://support.pipedrive.com/en/article/what-features-do-the-pipedrive-plans-have · https://support.pipedrive.com/en/category/features

### [confidence: high] Pipeline kanban mechanics (the core screen)

Pipeline kanban mechanics (the core screen): each deal card defaults to showing title, contact, value, label, and owner, plus a clickable activity icon that marks activities done or schedules new ones without opening the deal. Column ordering defaults to next-activity sort (overdue first), tiebroken by creation time newest-first, changeable via a 'Sort by' dropdown (deal value, expected close date, owner...). A deal lives in exactly one pipeline at a time; multiple pipelines are switched via a dropdown at the top of the view, and cross-pipeline moves break deal-progress reporting in Insights (progress reports only reflect movements within the current pipeline). Deals closed Won/Lost disappear from the active kanban but remain reachable by won/lost filters.

**Evidence:** 'By default, each deal card shows key information such as the title, contact, value, label and owner... click the activity icon on the card... mark activities as done or schedule new ones.' 'By default, deals are sorted by next activity... sorted by creation time, with newer deals appearing first... click the Sort by dropdown.' 'A deal can only exist in one pipeline at a time... Moving a deal to another pipeline affects reporting in Insights.' 'Closed deals are removed from the active pipeline view.' Article last updated April 9, 2026. Merges claims 6, 7, 8, 9.

**Sources:** https://support.pipedrive.com/en/article/pipeline-view

### [confidence: high] Deal rotting spec (clone-ready)

Deal rotting spec (clone-ready): rotting is configured per pipeline stage in pipeline edit mode via a 'Rotting in (days)' toggle plus a per-stage inactive-days threshold, settable independently on any number of stages. A rotten deal is indicated by the deal tile turning red in the kanban. The timer keys off the deal's last-updated time and is reset by marking activities done, adding notes or files, and email actions (sending, receiving, unlinking, deleting — also archiving). A rotten deal is restored to healthy by scheduling a new activity or editing any deal detail (custom fields, expected close date, value, etc.).

**Evidence:** 'Click the Rotting in (days) toggle to activate it, then define the number of inactive days after which a deal in this stage is considered rotten. You can define the rotting time for as many stages as you need.' 'You'll know a deal has gone rotten by the red color on the deal tile.' 'Several actions... reset the inactivity count: Marking activities as done, Adding notes and files, Email actions: Sending, Receiving, Unlinking, Deleting.' 'Restore it to a healthy state by: Scheduling a new activity... Editing any details of the deal.' Article last updated May 12, 2026. Merges claims 10, 11, 12, 13.

**Sources:** https://support.pipedrive.com/en/article/the-rotting-feature · https://support.pipedrive.com/en/article/pipeline-view

### [confidence: high] Forecast view spec

Forecast view spec: accessed as the third View button on the Deals tab, it renders a kanban of date-based columns bucketed on expected close date — except WON deals, which bucket on their won date — with an option to substitute any custom date field (e.g. 'delivery date') as the projection basis. Each column header summarizes total open value, total won value, and combined won+open projection; if deal or stage probabilities are customized, weighted (probability-adjusted) values display instead of raw values. Columns are customized via a gear icon ('Show by' = which date field buckets columns, 'Arrange by' = in-column deal ordering), and dragging a deal card to another column rewrites its expected close date. Plan-gated to Growth+/Professional+.

**Evidence:** 'The forecast view projects your revenue by using the expected close date... If a deal is marked as WON, that deal's won date will be used instead.' 'Go to the Deals tab and click on the third View button... a kanban view of your deals, separated into date-based columns... total value for all open deals, the total value for all won deals and a projection of the combined revenue.' 'If you have any customized probability for your deals or stages, the weighted value will be presented.' 'Show by dictates which columns... Arrange by decides the order... drag-and-drop deals from one column to another, allowing you to update the deal's expected close date.' Merges claims 14, 15, 16, 17.

**Sources:** https://support.pipedrive.com/en/article/the-forecast-view-revenue-projection · https://support.pipedrive.com/en/article/what-features-do-the-pipedrive-plans-have

### [confidence: high] Leads Inbox spec

Leads Inbox spec: a dedicated holding area separate from the deals pipeline for unqualified leads, converted to deals only when sales-ready (deals can also convert back). A lead must always link to a person or organization; every other field is optional. Creation is via a green '+ Lead' button with bulk import via adjacent green arrow > 'Import data'. The inbox is a customizable list view: click-to-sort column headers, gear icon to add columns from lead/organization/person fields, label + predefined/custom filters in the top-right (custom filters star-able as favorites), and export of filtered results via '...' > Export filter results. The lead detail view opens as a panel: left side shows Lead details, Person, Organization, and Smart Bcc sections with archive/convert-to-deal actions bottom-left; right side has three sections — Composer (write notes, add activities, compose emails, upload files), Focus (upcoming activities, pinned notes, email drafts, scheduled emails), and History (notes, completed activities, sent emails, uploaded files).

**Evidence:** 'The Leads Inbox... a dedicated space to store and organize your unqualified leads. When a lead is ready to move forward, you can convert it into a deal.' 'A lead must always be linked to a person or organization in Pipedrive, but all other fields are optional.' 'Click on the gear icon to customize the columns... In the top-right corner, you can filter your leads by label and predefined or custom filters.' 'The right side has three sections: Composer... Focus... History.' Article last updated February 26, 2026. Merges claims 18, 19, 20, 21.

**Sources:** https://support.pipedrive.com/en/article/leads-inbox

### [confidence: medium] Design-language architecture

Design-language architecture: Pipedrive's design system (documented by its former Design Systems Manager Priit Karu, shipped as the Classic/Modern themes and published on Figma Community) uses a three-layer token architecture — base styles, a semantic layer that doubles as the theme layer, and an application layer — modeled on IBM Carbon and Atlassian. The base palette gives each color a numeric shade scale 0-800 (initially 12 shades, later consolidated to 11, contrast-matched across colors at each level; by 2023 the Modern palette was contrast-based and WCAG 2.0 AA compliant). The semantic layer defines named groups — Surface, Fill, Divider, Text, Icon, Primary, Secondary, Active, Negative, Warning, Positive, Info — each aliased to base shades (e.g. $primary-default = $green-600, $warning-strong = $yellow-700, with secondary aliases like $text-warning → $warning-strong). For a Next.js clone this maps directly onto CSS custom properties / Tailwind theme tokens with a semantic indirection layer for theming and dark mode.

**Evidence:** 'The layered approach with base styles, theme layer and application layer... I mainly drew inspiration from IBM's Carbon, Atlassian's Design system.' 'Each color had 12 shades with numeric values from 0 to 800... by now... all colors having 11 shades, each shade level contrast-matched.' 'I defined groups like Surface, Fill, Divider, Text, Icon, Primary, Secondary, Active, Negative, Warning, Positive and Info... $primary-default would link to $green-600. $warning-strong would link to $yellow-700.' Author verified via LinkedIn as Pipedrive Design Systems Manager (2022-2024); system confirmed shipped ('the dark theme has actually been created in Figma and in code'). Medium confidence because it is a single primary source, the group list is prefaced 'groups like...' (possibly non-exhaustive), and shade-count/token details date to ~2023 so exact current values may have drifted. Merges claims 22, 23, 24.

**Sources:** https://priitkaru.com/semantic-design-system

## Open gaps

- What are the actual hex values behind Pipedrive's base palette shades (e.g. green-600) and its typography/spacing scale — retrievable from the published Pipedrive Figma Community files (figma.com/@pipedrive) or by inspecting the live app's CSS custom properties?
- Which features do Pipedrive users actually rank as most valuable on G2/Capterra/Reddit (the prioritization signal), and does that ranking match the plan-tier proxy (pipeline kanban + activities first, email/automations second)?
- What is the exact detail-page layout for deals, persons, and organizations (left summary panel, tabbed center timeline, right sidebar widgets) — only the lead detail panel's Composer/Focus/History layout was verified?
- How do the unverified feature areas work mechanically — Insights report types and chart styles, AI Sales Assistant/summaries, automation trigger/action catalog, visibility-group model, and email sync architecture (IMAP vs API, Smart Bcc fallback)?
