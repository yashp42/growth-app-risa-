# Dynamic data and Analyst reliability plan

## Goal

Make every user-visible decision trace back to the current workspace state. A user can add records, import a CSV, or replace a reference file; the dashboard, outlook, and Growth Analyst must then use that state without a redeploy or hard-coded answer.

## Delivery sequence

1. **Verify the write path.** Exercise campaign, sponsor, opportunity, task, and import writes against the same API used by the product. Preserve audit history, permissions, and record-class boundaries.
2. **Harden ingestion.** Keep arbitrary CSV columns intact for Analyst reference uploads; replace a previous same-name snapshot rather than presenting stale copies. For operational imports, validate required fields and resolve channels, categories, owners, sponsors, and campaigns exactly before the first write.
3. **Keep derived views current.** Operational writes bump the workspace data version. Reference-upload revisions are included in Analyst cache identity, so a new file cannot reuse an old answer. Outlook and performance endpoints calculate from the current records on every request.
4. **Make Analyst answers useful without a provider.** Use deterministic data answers for known metric and operational questions, concise product guidance for generic questions, and a readable summary before any supporting table. A provider is an enhancement, never the only route to an answer.
5. **Control answer size and evidence.** Normal replies target 180 words or fewer. Numbers state their scope and source; an uploaded file is labelled as reference data rather than silently treated as cash or a confirmed deal.
6. **Prove it.** Compile the application and run focused regression checks for CSV parsing/mapping, duplicate or replacement uploads, current-data cache identity, generic-provider fallback, malformed CSV, unknown references, and dynamic outlook/metric behaviour.

## Acceptance checks

- Adding or editing a campaign, sponsor, opportunity, or task is persisted, audited, and reflected after refresh.
- A newly imported CSV is queryable by the Analyst; re-importing a revised file with the same name supersedes the old snapshot for normal discovery.
- Invalid CSV, ambiguous names, missing required data, duplicate rows, unsupported record classes, and partial operational failures produce actionable messages without silently creating incorrect records.
- A data change produces a new version or upload revision, preventing stale Analyst answers and recalculating read-time outlooks.
- The Analyst returns a concise, reasoned answer when a provider is available and a specific, useful local answer when it is not.
