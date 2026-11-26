# Stage 4D: AI orb interface, answers as tables and charts, retrieval scoring

Paste this only after the 4B report has been accepted. Before Part 4C.
Rules as before:
- No number is computed by the client or the model.
- Work in small steps and run tsc after every few files.
- Label every test LIVE or MOCKED.

## 1. The AI orb: one visual identity for the analyst
Build one reusable `<AnalystOrb state=…>` component. It is used:
- in the floating "Ask" button, present on every screen;
- as the centrepiece of the Growth Analyst screen.

The orb is a soft, glowing, blurred sphere.

**Technique**
- Layered radial gradients with `filter: blur()` and `mix-blend-mode: screen`, animated with Framer Motion (`motion` package).
- Optionally, a small canvas or WebGL noise shader, only if it stays under 60 KB gzipped.
- **No three.js and no web3 libraries.** They're unneeded weight.
- Colours: the app's accent green with violet and cyan highlights, on a frosted-glass panel (`backdrop-filter: blur(16px)`, translucent background, a 1 px light border).

**States, driven by real events, not timers**

| State | Trigger | Look |
|---|---|---|
| idle | nothing happening | A slow "breathing" scale, 0.98→1.02 over 4 s, with a faint glow. |
| hover | pointer over the orb | The glow brightens, the orb leans slightly toward the cursor, and a tooltip reads "Ask or speak". |
| listening | the mic is on | The orb pulses with the **live microphone level**, read from the Web Audio `AnalyserNode` on the local stream. Audio never leaves the browser. A ring ripples outward. The interim transcript appears under the orb. |
| thinking | `/api/ai/ask` is in flight | The gradient swirls (it rotates hue), with small orbiting particles. The status text shows the real tool steps as they happen: "Looking up M-01…" or "Searching the strategy notes…". |
| answering | the response arrives | The orb shrinks and fades (blur 0 → 24 px, opacity 1 → 0) while the answer card fades in from blur 12 px to 0 with a slight upward slide, about 450 ms in total. |
| confirm | a change card is pending | The orb shows a steady amber ring until Accept or Cancel. |
| error or quota out | an error | A brief red flicker, then idle. The message says what happened. |

**Requirements**
- Respect `prefers-reduced-motion`: no animation, colour change only.
- Full keyboard access. The space bar toggles the mic when the orb has focus.
- `aria-live` announces state changes.
- Animations at 60 fps on a mid-range laptop. Use `transform` and `opacity` only; animate no layout properties.

## 2. Answers rendered as tables and charts, from server data only
- When a turn's tool results contain lists (`list_records`, `metric_by`, `get_series`, and `get_dataset` once added), the server returns them as structured `blocks` next to the text:
  - `{type: "table", columns, rows, source}`;
  - `{type: "bar" | "line", series, source}`;
  - `{type: "kpi", metric_id, value, unit, label}`.
- The client renders the blocks: tables that sort, and bar and line charts in the app's existing chart style, each with its source chip and data version.
- The model only chooses which block to show. It never supplies the numbers in a block.
- **LIVE test:** "Show cash collected by campaign as a chart" gives a bar chart whose values equal the Overview campaign table. "List our open deals" gives a table that matches the Pipeline screen.

## 3. Retrieval quality score (Part 4C addition; uses no AI requests)
- Add `scripts/eval-retrieval.ts`. For every test-bank case with an `expected_citation` that names a KB chunk:
  - call `search_knowledge` directly, with no model involved;
  - use the case's question as the query, and `include_history` true for the Contradiction-handling cases;
  - compute **recall@6** (the share of expected chunks retrieved) and **precision@6**.
- Report the per-case values and the averages, and list the cases with recall below 1.0, along with what was retrieved instead.
- Run it twice:
  - with the current search (strict search with an OR fallback);
  - with a variant that also ranks by trigram similarity on title and section (`pg_trgm`, if it is enabled in Supabase; if not, say so).

  Keep whichever variant scores higher on recall. Report both.
