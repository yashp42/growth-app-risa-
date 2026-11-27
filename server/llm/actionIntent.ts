const WRITE_VERBS =
  'create|add|update|change|move|assign|log|record|send|delete|confirm|execute|apply|schedule|book|mark';

/** True only when the current message asks the Analyst to perform a write. */
export function isExplicitWriteRequest(question: string): boolean {
  const q = question.toLowerCase().replace(/[’]/g, "'");
  // Require an instruction-like clause and a concrete operational object. This
  // keeps discussion, analysis, and draft-only requests read-only.
  const command = new RegExp(
    `(?:^|[.!?]\\s*|\\b(?:please|can you|could you|i want you to|we need to)\\s+)` +
      `(${WRITE_VERBS})\\b[\\s\\S]{0,120}?\\b(?:task|reminder|follow[- ]?up|meeting|interaction|note|outreach|opportunity|sponsor|campaign|stage|record|receipt|payment|invoice|contract|balance)\\b`,
    'gi',
  );
  const cancellations = (verb: string) => new RegExp(
    `\\b(?:but\\s+|and\\s+|however\\s+|yet\\s+)?(?:do not|don't|dont|never|not yet|i do not want to|i don't want to|wait until|wait for my confirmation before)\\s+(?:actually\\s+|really\\s+)?${verb}\\b`,
    'i',
  );
  for (const match of q.matchAll(command)) {
    const verb = match[1].toLowerCase();
    const after = q.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 120);
    if (!cancellations(verb).test(after)) return true;
  }
  return false;
}

/** View changes are allowed only when the user asks to alter or open a view. */
export function isExplicitViewChangeRequest(question: string): boolean {
  const q = question.toLowerCase().replace(/[’]/g, "'");
  const command = /(?:^|[.!?]\s*|\b(?:please|can you|could you|i want you to)\s+)(create|save|set|update|pin|add|remove|clear|filter|open)\b[\s\S]{0,100}?\b(?:dashboard|view|widget|layout|filter)\b/gi;
  for (const match of q.matchAll(command)) {
    const verb = match[1].toLowerCase();
    const after = q.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 100);
    if (!/\b(?:but\s+|and\s+|however\s+)?(?:do not|don't|dont|never|not yet|i do not want to|i don't want to)\s+(?:actually\s+)?(?:create|save|set|update|pin|add|remove|clear|filter|open)\b/i.test(after) || !new RegExp(`\\b(?:do not|don't|dont|never|not yet|i do not want to|i don't want to)\\s+(?:actually\\s+)?${verb}\\b`,'i').test(after)) return true;
  }
  return /\bshow me\b[\s\S]{0,60}\b(?:dashboard|saved view|widget layout)\b/i.test(q) && !/\b(?:do not|don't|dont|never|not yet)\s+show me\b/i.test(q);
}

/** Return only deadline text explicitly supplied by the user. */
export function explicitTaskDeadline(question: string): string | null {
  const match = /\b(?:due(?:\s+on)?\s+)?((?:in|within|by)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:hours?|days?|weeks?)|today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{4}-\d{2}-\d{2})\b/i.exec(question);
  return match?.[1] ?? null;
}
