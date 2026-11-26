/** Presentation only: canonical identifiers and values remain unchanged in API data. */
export function businessText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/\s*\((?:M-\d{2}|SC-\d{2}|K-G-\d{2})(?:,\s*separate)?\)/g, '')
    .replace(/T[−–-]7 cash collection gate/g, 'Pre-event collection target')
    .replace(/\bT[−–-]7 gate\s*:?/g, 'Pre-event collection target:')
    .replace(/\bK-G-\d{2}\b/g, '')
    .replace(/\bSC-0[123]\b/g, '')
    .replace(/\bM-\d{2}\b/g, '')
    .replace(/\s+([:;,])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Rule expressions stay in expanded evidence, not in the alert headline. */
export function attentionTitle(title: string): string {
  if (!/^EX-B[\w-]+:/i.test(title)) return businessText(title);
  if (/escalate/i.test(title)) return 'Action needed';
  if (/change/i.test(title)) return 'Adjust approach';
  if (/stop/i.test(title)) return 'Pause and review';
  if (/keep/i.test(title)) return 'On track';
  return 'Review performance';
}
