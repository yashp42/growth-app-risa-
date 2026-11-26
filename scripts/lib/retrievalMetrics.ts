/**
 * Retrieval scoring helpers for scripts/eval-retrieval.ts (no AI requests).
 * Pure functions so the arithmetic is unit-tested separately from the DB run.
 */

/** Minimal RFC-4180 CSV parser (quoted fields, doubled quotes, newlines in quotes). */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/** KB references named in a citation string: "M-02; KB-02.1; KB-15" -> ["KB-02.1", "KB-15"]. */
export function expectedKbRefs(citation: string): string[] {
  const refs = citation.match(/\bKB-\d{1,2}(?:\.\d+)?\b/g) ?? [];
  return Array.from(new Set(refs));
}

/** A chunk satisfies a ref if it is that chunk, or (doc-level ref "KB-15") any chunk of that doc. */
export function chunkMatchesRef(chunkId: string, ref: string): boolean {
  if (ref.includes('.')) return chunkId === ref;
  return chunkId === ref || chunkId.startsWith(`${ref}.`);
}

export interface CaseScore {
  recall: number;
  precision: number;
  matchedRefs: string[];
  missedRefs: string[];
  relevantRetrieved: number;
}

/**
 * recall@k = share of expected refs satisfied by the top-k retrieved chunks;
 * precision@k = share of retrieved chunks (up to k) that satisfy some expected ref.
 * With nothing retrieved, precision is 0.
 */
export function scoreCase(expected: string[], retrieved: string[], k = 6): CaseScore {
  const top = retrieved.slice(0, k);
  const matchedRefs = expected.filter((ref) => top.some((c) => chunkMatchesRef(c, ref)));
  const relevantRetrieved = top.filter((c) => expected.some((ref) => chunkMatchesRef(c, ref))).length;
  return {
    recall: expected.length === 0 ? 1 : matchedRefs.length / expected.length,
    precision: top.length === 0 ? 0 : relevantRetrieved / top.length,
    matchedRefs,
    missedRefs: expected.filter((r) => !matchedRefs.includes(r)),
    relevantRetrieved,
  };
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}
