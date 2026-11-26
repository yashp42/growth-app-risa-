# Sponsorship Growth Platform — UI design guidelines

Implemented direction: 27 November 2026. This is an operational sponsorship product. The interface leads with business decisions and current source data, while making detailed provenance accessible on demand.

## Visual language

The forest-green identity is retained with a cleaner green-neutral canvas. Design tokens live in `src/index.css`; module components reference those tokens rather than maintaining separate palettes.

| Token | Value | Purpose |
|---|---|---|
| Canvas | #F6F8F5 | Application background |
| Surface | #FFFFFF | Tables, forms, overlays |
| Subtle surface | #F0F4F0 | Navigation and secondary groupings |
| Ink | #172D25 | Primary information |
| Muted ink | #52635B | Supporting information |
| Subtle ink | #687B70 | Secondary labels |
| Accent | #245C45 | Primary actions and selected state |
| Accent hover | #194631 | Interactive emphasis |
| Accent soft | #E5EFE7 | Selected and conversational surfaces |
| Border | #D9E2DA | Structural boundaries |
| Subtle border | #E9EEE9 | Row separators |

Use semantic warning/error colours for actual states. Do not use decorative badges to fill space. Prefer separators and whitespace over nested cards. Shadows belong primarily to floating menus, drawers and dialogs.

Body defaults to 16px; routine controls and table content use approximately 14px, with 12–13px reserved for secondary metadata. Headings have compact tracking. Tabular numbers align financial columns; monospace is reserved for diagnostics rather than every amount.

Use 8px control radii, 12px structural surfaces and 16–24px major overlays. Shared button classes have 40px minimum height; coarse-pointer controls target 44px. Desktop content has a 1440px maximum width. Sidebar navigation collapses on desktop and becomes a focus-managed mobile drawer below the large breakpoint. Tables and stage lanes scroll locally rather than widening the entire page.

## Application shell

The header contains context, search, Quick Add, notifications and account access. Sign out belongs in the account menu. The sidebar owns primary navigation. The selected edition and historical/demo/live distinction remain accessible. A skip link and visible keyboard focus support navigation.

Use real controls only. Retain the existing search API, role-sensitive Quick Add behavior, edition switching, notifications and profile actions. No redesign feature changes authentication or permissions.

## Module hierarchy

- Overview: season measures first; pacing and exceptions together; funnel and campaign comparisons next; strategic bets and team execution further down. Each measure retains its server-derived value and inspection action.
- Campaigns: a readable core portfolio table by default; users can reveal all existing metric columns. Sorting, filters, owners and edit/detail links remain functional.
- Sponsors: distinguish identity, relationship state and ownership; compact name-derived identity marks aid scanning. Contacts and relationship history remain in existing detail flows.
- Pipeline: stage lanes scroll horizontally within a named keyboard-focusable region. Each lane has its own vertically scrollable deal list. Table mode and explicit stage updates remain available.
- Tasks: readable owners, deadlines and linked records, with shared form/drawer patterns. Preserve all current filters and task operations.
- Collections: collected cash is prominent. Signed cash, invoices, receipts and in-kind support remain distinct. Allocation without available linked records has a contextual empty state. Provenance is disclosed without hiding financial qualifications.
- Analytics: business metric titles and values lead; formulas, raw filters, IDs and source versions sit behind calculation/source disclosures. Existing diagnostic tabs, comparisons, exports and Metric Explorer remain available.

## Growth Analyst

Conversation is the main surface. Starter prompts are secondary suggestions. Context controls live in a compact disclosure; daily quotas, thread IDs and source versions belong in diagnostics. Evidence opens only when relevant; actions stay with the conversation turn that proposed them. Never duplicate an empty permanent action workspace.

Answers preserve their content and server-built tables/charts. Source details and metric verification remain accessible. Verification failures and financial qualifications must stay visible. Raw provider errors belong behind diagnostic disclosure, with a useful primary message.

The orb is one material sphere with a restrained green/cyan surface. It has no decorative particles, continuous idle glow or animated blur. Movement uses transforms/opacity; reduced-motion preferences remove animation. State derives from actual mic/request/answer/confirmation/error events. Speaking derives from speech-synthesis start/end/error, with cancellation and stale-event protection.

Focused voice mode uses a native modal dialog, actual local microphone level, recognised transcript, response text, and explicit mic/stop/close controls. It uses existing browser-native speech APIs, with no application transcription service. Unsupported browsers and playback failures get useful feedback. Closing voice mode stops input/playback; confirmation remains in the existing human-review flow.

## Accessibility and implementation boundaries

Keep labels, focus visibility, keyboard activation and dialog focus restoration. New drawers/search/confirmation use shared focus management; voice uses the browser's native modal behavior. Motion must respect reduced motion. Do not communicate state with colour alone.

No hardcoded performance statistics or replacement mock data. Do not compute new business metrics in presentation code. Do not change backend contracts, financial formulas, approved D-009/D-010 assumptions, permissions, authentication, datasets, simulation or action allowlists.

## Verification

TypeScript, build and existing regressions run in GitHub CI. New tests exercise speech lifecycle, cancellation/replacement races, speaking-state precedence and the empty Analyst composition. These are MOCKED checks. Actual microphone permission, speech playback quality, responsive screenshots and deployed route checks require LIVE browser validation. Never describe source inspection or server-rendered markup as a visual browser pass.
