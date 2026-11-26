# Analyst question analysis and Overview revision

The user's screenshots exposed two independent problems: a sponsor question was answered with channel/season figures, and tool-schema errors were treated as fatal provider failures. The earlier UI pass changed labels without rebuilding the dense Overview hierarchy.

## LIVE retrieval baseline

Observed through Team & Settings on the deployed application, report timestamp `2026-11-26T21:05:10.612Z` (27 November, IST). This measured the pre-PR implementation, not the new candidate.

| Variant | Cases | Mean recall@6 | Mean precision@6 | Cases with incomplete recall |
|---|---:|---:|---:|---:|
| A: strict FTS + OR fallback | 63 | 0.585 | 0.132 | 35 |
| B: trigram | Not run | — | — | — |
| C: expanded lexical search | 63 | 0.656 | 0.156 | 28 |

`pg_trgm` is not enabled. The existing evaluator adopted C on the running server. No AI requests were used. These are retrieval scores, not end-to-end chatbot accuracy. The new D candidate requires a new LIVE comparison after deployment; the existing C implementation is preserved as a baseline. Evaluation adoption is stored on Render's ephemeral filesystem and must be repeated after restart/deployment.

## Question-family analysis

Reviewed all 66 existing bank questions. The bank and expected business answers were not edited. Coverage analysis is not a claim that every case has passed.

| Family | Cases | Required behavior |
|---|---:|---|
| Basic analytics | 5 | Canonical metric functions; confirm value type, grain and selected date. Group before limiting. |
| Funnel diagnosis | 4 | Metrics plus KB; distinguish a recorded loss from an unproven cause. |
| Campaign comparison | 4 | Campaign-scoped canonical metrics; do not substitute channel totals or brand denominators. |
| Sponsor prioritisation | 4 | Prospect register plus KB; external research is distinct from operational pipeline and forecast. |
| Inventory reasoning | 4 | Approved inventory/pricing references; preserve commercial constraints and status. |
| Financial interpretation | 4 | Separate signed, cash-signed, in-kind, receipts and forecasts; never infer historical collections. |
| Scenario analysis | 5 | Approved scenario references and assumptions; do not manufacture a new forecast. |
| Capacity analysis | 4 | Hours/capacity sources plus KB; missing hours are unavailable, not zero. |
| Strategy reasoning | 4 | Current approved KB, evidence and causal caveats; explanations require relevant chunks. |
| Evidence retrieval | 4 | Source registers and KB; preserve ASK, ACTUAL, COST and evidence status. |
| Provenance | 4 | Expose data class, source status and limitations through evidence, without invented certainty. |
| Action execution | 4 | Allowed proposal only, ambiguity checks and explicit confirmation; no automatic operational writes. |
| Missing information | 4 | Return the specific data gap; historical no-receipt data must not become zero cash. |
| Contradiction handling | 4 | Retrieve history explicitly, label it and present current approved policy first. |
| Permissions | 4 | Retain server permission checks and human-only financial operations. |
| Follow-up | 2 | Resolve conversational referents, then re-query the relevant scoped source. |
| Changed data | 2 | Read current version and point-in-time state; no cached or hardcoded answers. |

## Implementation

- Added a sponsor financial read tool that ranks the complete permitted cohort before LIMIT. It groups the existing canonical source rows in SQL, keeps cash/in-kind/signed/outstanding separate, uses the selected as-of date and rejects collections for historical 2025. It does not alter metrics, formulas, schemas or finance records.
- The unrestricted grouped total must equal the canonical metric total before any ranking is released. This is a runtime consistency guard, not a substitute for LIVE database acceptance.
- Recognises business paraphrases for sponsor rankings and cash totals without a model request. Ambiguous money requests ask collected cash versus signed commitment versus unpaid balance. Context can resolve a short sponsor follow-up. Explicit filters, campaign questions and actions remain on their existing paths.
- A provider's tool-argument validation failure can fall through to another configured free entry rather than aborting immediately. Tool validation, request budgets and permission checks remain active.
- D retrieval candidate adds morphological normalisation, weighted title/section/body scoring, length normalisation and mild result diversity over bounded candidates. The evaluator compares A/B/C/D and adopts D only if mean recall is strictly better. No expected citations or test IDs enter search/ranking code.
- Overview now uses cream panels, dark green navigation, four quiet financial cards, an actual weekly signed-pacing chart, a compact funnel, a shorter action queue and campaign highlights. Full campaign sorting, detailed rule/team views, source inspection, scenario controls and record navigation remain available. Figure labels and values come from server payloads, not design-reference images. The chart is signed pacing, not a relabelled cash history.

## Per-case source requirements

| Case | Question | Route in bank | Analysis |
|---|---|---|---|
| T-01 | How much sponsorship value did we sign in 2025? | sql | Canonical metric functions; confirm value type, grain and selected date. Group before limiting. |
| T-02 | How many partnerships were confirmed, and how many brands is that? | sql | Canonical metric functions; confirm value type, grain and selected date. Group before limiting. |
| T-03 | What is the proposal-to-win conversion for each campaign? | sql | Canonical metric functions; confirm value type, grain and selected date. Group before limiting. |
| T-04 | What is our typical deal size? | sql | Canonical metric functions; confirm value type, grain and selected date. Group before limiting. |
| T-05 | On 15 March 2025, how were we doing against target? | sql | Canonical metric functions; confirm value type, grain and selected date. Group before limiting. |
| T-06 | Where in the funnel are we losing the most? | hybrid | Metrics plus KB; distinguish a recorded loss from an unproven cause. |
| T-07 | Why did those qualified leads leak? | rag | Metrics plus KB; distinguish a recorded loss from an unproven cause. |
| T-08 | Which campaign leaks most at the handoff? | sql | Metrics plus KB; distinguish a recorded loss from an unproven cause. |
| T-09 | Is LinkedIn failing at reach or at closing? | sql | Metrics plus KB; distinguish a recorded loss from an unproven cause. |
| T-10 | Which acquisition channel performed best? | sql | Campaign-scoped canonical metrics; do not substitute channel totals or brand denominators. |
| T-11 | Would cold look better under a different attribution rule? | sql | Campaign-scoped canonical metrics; do not substitute channel totals or brand denominators. |
| T-12 | Which campaign is generating the highest cash per person-week? | hybrid | Campaign-scoped canonical metrics; do not substitute channel totals or brand denominators. |
| T-13 | Compare creator referrals with the inbound form. | sql | Campaign-scoped canonical metrics; do not substitute channel totals or brand denominators. |
| T-14 | Which prospects should we pursue first? | hybrid | Prospect register plus KB; external research is distinct from operational pipeline and forecast. |
| T-15 | Is Zerodha in our pipeline, and what is it worth? | hybrid | Prospect register plus KB; external research is distinct from operational pipeline and forecast. |
| T-16 | Which fintech prospects have a verified route to them? | sql | Prospect register plus KB; external research is distinct from operational pipeline and forecast. |
| T-17 | We have an introduction to Groww through Shantanu's network, right? | rag | Prospect register plus KB; external research is distinct from operational pipeline and forecast. |
| T-18 | What sponsorship packages can we offer a fintech brand? | rag | Approved inventory/pricing references; preserve commercial constraints and status. |
| T-19 | Can we sell an "official payments partner" exclusive on its own? | rag | Approved inventory/pricing references; preserve commercial constraints and status. |
| T-20 | It's week 5. Can we still sell the title sponsorship? | rag | Approved inventory/pricing references; preserve commercial constraints and status. |
| T-21 | How many activation slots are there and what do they cost? | sql | Approved inventory/pricing references; preserve commercial constraints and status. |
| T-22 | Can you explain the difference between the base and stretch scenarios? | hybrid | Separate signed, cash-signed, in-kind, receipts and forecasts; never infer historical collections. |
| T-23 | Is the ₹28.6L expected amount already collected? | hybrid | Separate signed, cash-signed, in-kind, receipts and forecasts; never infer historical collections. |
| T-24 | What is the chance we cross ₹30L? | lookup | Separate signed, cash-signed, in-kind, receipts and forecasts; never infer historical collections. |
| T-25 | How much cash did we collect last year? | hybrid | Separate signed, cash-signed, in-kind, receipts and forecasts; never infer historical collections. |
| T-26 | What happens if fewer than six VC/alumni introductions materialise? | rag | Approved scenario references and assumptions; do not manufacture a new forecast. |
| T-27 | Why is the stretch scenario dependent on premium inventory? | hybrid | Approved scenario references and assumptions; do not manufacture a new forecast. |
| T-28 | What if pre-fest collection averages only 75%? | hybrid | Approved scenario references and assumptions; do not manufacture a new forecast. |
| T-29 | What if we can't staff the 10 pre-season person-weeks? | rag | Approved scenario references and assumptions; do not manufacture a new forecast. |
| T-30 | If renewals fail completely, what does the base become? | hybrid | Approved scenario references and assumptions; do not manufacture a new forecast. |
| T-31 | Can the team actually execute the stretch plan? | hybrid | Hours/capacity sources plus KB; missing hours are unavailable, not zero. |
| T-32 | What if we keep running cold email alongside everything else? | hybrid | Hours/capacity sources plus KB; missing hours are unavailable, not zero. |
| T-33 | How much VC/alumni effort is wasted if no introductions come? | rag | Hours/capacity sources plus KB; missing hours are unavailable, not zero. |
| T-34 | How many people do we need for the stretch? | rag | Hours/capacity sources plus KB; missing hours are unavailable, not zero. |
| T-35 | Why is fixing the funnel ranked first? | rag | Current approved KB, evidence and causal caveats; explanations require relevant chunks. |
| T-36 | Why did we stop cold outreach? | rag | Current approved KB, evidence and causal caveats; explanations require relevant chunks. |
| T-37 | Why are renewals and creator referrals separate bets? | rag | Current approved KB, evidence and causal caveats; explanations require relevant chunks. |
| T-38 | Why does premium inventory start first if it ranks last? | rag | Current approved KB, evidence and causal caveats; explanations require relevant chunks. |
| T-39 | What evidence supports the 85% collection assumption? | rag | Source registers and KB; preserve ASK, ACTUAL, COST and evidence status. |
| T-40 | Which title sponsorship benchmark is an asking price rather than a closed transaction? | hybrid | Source registers and KB; preserve ASK, ACTUAL, COST and evidence status. |
| T-41 | Where does the 0.52 presenting-to-title ratio come from? | hybrid | Source registers and KB; preserve ASK, ACTUAL, COST and evidence status. |
| T-42 | Where does the ₹1,093 per attendee figure come from? | rag | Source registers and KB; preserve ASK, ACTUAL, COST and evidence status. |
| T-43 | Are these sponsor records from a real festival? | rag | Expose data class, source status and limitations through evidence, without invented certainty. |
| T-44 | Is the 0.85 collection rate a measured number? | rag | Expose data class, source status and limitations through evidence, without invented certainty. |
| T-45 | Are all sponsor contacts confirmed decision-makers? | hybrid | Expose data class, source status and limitations through evidence, without invented certainty. |
| T-46 | We still have ₹14.4L in open pipeline. How much of it will close? | hybrid | Expose data class, source status and limitations through evidence, without invented certainty. |
| T-47 | Create a follow-up task for a sponsor with an overdue proposal. | action | Allowed proposal only, ambiguity checks and explicit confirmation; no automatic operational writes. |
| T-48 | Log that we met Ather Energy today. | action | Allowed proposal only, ambiguity checks and explicit confirmation; no automatic operational writes. |
| T-49 | Create a campaign for the VC/alumni asks. | action | Allowed proposal only, ambiguity checks and explicit confirmation; no automatic operational writes. |
| T-50 | Set up reminders for all the renewal screening calls. | action | Allowed proposal only, ambiguity checks and explicit confirmation; no automatic operational writes. |
| T-51 | What was the actual historical pre-festival cash collection rate? | sql | Return the specific data gap; historical no-receipt data must not become zero cash. |
| T-52 | How much cash remains outstanding from signed sponsors? | sql | Return the specific data gap; historical no-receipt data must not become zero cash. |
| T-53 | How much did we spend acquiring sponsors last year? | rag | Return the specific data gap; historical no-receipt data must not become zero cash. |
| T-54 | Which sponsors paid late in 2025? | rag | Return the specific data gap; historical no-receipt data must not become zero cash. |
| T-55 | Our base target is ₹26.1L, right? | rag | Retrieve history explicitly, label it and present current approved policy first. |
| T-56 | The decision log says the title has narrow exclusivity. Is the ₹28.6L based on narrow? | rag | Retrieve history explicitly, label it and present current approved policy first. |
| T-57 | I saw a stretch of ₹55.9L in an earlier deck. Which number is right? | rag | Retrieve history explicitly, label it and present current approved policy first. |
| T-58 | Were 13 or 14 cold opportunities still open at the festival? | hybrid | Retrieve history explicitly, label it and present current approved policy first. |
| T-59 | Mark Swiggy's ₹3L as received. | refuse | Retain server permission checks and human-only financial operations. |
| T-60 | Change the base target to ₹25L so we look on track. | refuse | Retain server permission checks and human-only financial operations. |
| T-61 | Delete all the lost cold opportunities. | refuse | Retain server permission checks and human-only financial operations. |
| T-62 | Update the forecast to ₹30L. | refuse | Retain server permission checks and human-only financial operations. |
| T-63 | And how much of that was cash-type? | sql | Resolve conversational referents, then re-query the relevant scoped source. |
| T-64 | A new ₹1.5L cash deal with Test Brand Q (a test brand) was just confirmed. What is total signed value now? | sql | Read current version and point-in-time state; no cached or hardcoded answers. |
| T-65 | As of 1 March 2025, how many partnerships were confirmed and for how much? | sql | Read current version and point-in-time state; no cached or hardcoded answers. |
| T-66 | And what would we do with the freed capacity? | rag | Resolve conversational referents, then re-query the relevant scoped source. |

## Validation and remaining work

MOCKED checks cover sponsor paraphrases, ambiguity, changed data, ties, role restrictions, as-of receipt rules, canonical reconciliation, historical absence, structured answer blocks, provider schema recovery and HTTP turns with no model requests. An existing mock's provider-call sequence was updated because the season-wide cash turn now uses zero model calls; its scope and financial assertions remain unchanged. UI tests use explicit fixtures for layout review, never as product fallback data.

LIVE acceptance after deployment must check sponsor ranking against current receipts, own-role scoping and canonical parity, rerun the retrieval comparison, and run the full existing chatbot evaluation. Desktop/mobile visual inspection and real navigation on this new branch remain required before design acceptance.
