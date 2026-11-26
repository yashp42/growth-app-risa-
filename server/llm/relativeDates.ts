/**
 * Server-side resolution of relative dates in proposed changes ("today",
 * "tomorrow", "by Friday", "next week", "in 3 days", "27 Nov", "5pm Friday").
 *
 * Everything is computed on the Asia/Kolkata calendar date given as `asOf`
 * (YYYY-MM-DD), never on the server clock or the model's arithmetic. Due-style
 * timestamps default to 18:00 IST.
 *
 * Conventions (documented in the README):
 * - "<weekday>", "by/on/this <weekday>": the next such day on or after as-of
 *   (Thu 26 Nov: "Friday" = Fri 27 Nov; "Thursday" = today).
 * - "next <weekday>": that weekday in the following Mon–Sun week
 *   (Thu 26 Nov: "next Friday" = Fri 4 Dec, "next Monday" = Mon 30 Nov).
 * - "next week": Monday of the following week; "end of (this) week": Friday of
 *   this week; "end of next week": Friday of next week.
 * - "27 Nov" / "Nov 27": as-of year, or the next year if that date has passed.
 */

export const IST_OFFSET = '+05:30';
export const DEFAULT_DUE_TIME = '18:00';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_ALIASES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

export interface ResolvedDate {
  date: string; // YYYY-MM-DD (IST calendar date)
  time: string | null; // HH:MM if the phrase named a time
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

function weekday(iso: string): number {
  return parseIso(iso).getUTCDay();
}

/** Monday (ISO week start) of the week containing iso. */
function mondayOf(iso: string): string {
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

function onOrAfter(asOf: string, targetWd: number): string {
  const diff = (targetWd - weekday(asOf) + 7) % 7;
  return addDays(asOf, diff);
}

function parseTime(text: string): { time: string | null; rest: string } {
  const m = /\b(?:at|by|before)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text) ??
    /\b(?:at|by|before)\s+(\d{1,2}):(\d{2})\b()/i.exec(text);
  if (!m) {
    if (/\b(noon|midday)\b/i.test(text)) return { time: '12:00', rest: text.replace(/\b(at\s+)?(noon|midday)\b/i, ' ') };
    if (/\b(eod|end of day|tonight)\b/i.test(text)) return { time: '18:00', rest: text };
    return { time: null, rest: text };
  }
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ampm = (m[3] || '').toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return { time: null, rest: text };
  return {
    time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
    rest: text.replace(m[0], ' '),
  };
}

export function isIsoDateOnly(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function isAbsoluteTimestamp(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s);
}

/** Resolve a relative or partial date phrase against the IST as-of date. */
export function resolveRelativeDate(phrase: string, asOf: string): ResolvedDate | null {
  if (!isIsoDateOnly(asOf)) return null;
  const { time, rest } = parseTime(phrase.toLowerCase());
  const t = rest
    .replace(/[,.]/g, ' ')
    .replace(/\b(by|on|due|before|until|till|for|at)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let date: string | null = null;
  let m: RegExpExecArray | null;

  if (isIsoDateOnly(t)) date = t;
  else if (/^(today|tonight|eod|end of day|end of today)$/.test(t)) date = asOf;
  else if (/^(tomorrow|tmrw|tmr)$/.test(t)) date = addDays(asOf, 1);
  else if (/^(the )?day after tomorrow$/.test(t)) date = addDays(asOf, 2);
  else if (/^next week$/.test(t)) date = addDays(mondayOf(asOf), 7);
  else if (/^(the )?end of (the |this )?week$|^this week$|^eow$/.test(t)) date = addDays(mondayOf(asOf), 4);
  else if (/^(the )?end of next week$/.test(t)) date = addDays(mondayOf(asOf), 11);
  else if ((m = /^in (\d{1,2}) days?$/.exec(t))) date = addDays(asOf, Number(m[1]));
  else if ((m = /^in (a|one|1|two|2) weeks?$/.exec(t))) date = addDays(asOf, /two|2/.test(m[1]) ? 14 : 7);
  else if ((m = /^next ([a-z]+)$/.exec(t)) && m[1] in WEEKDAY_ALIASES) {
    const nextMonday = addDays(mondayOf(asOf), 7);
    const wd = WEEKDAY_ALIASES[m[1]];
    date = addDays(nextMonday, wd === 0 ? 6 : wd - 1);
  } else if ((m = /^(?:this |coming |the )?([a-z]+)$/.exec(t)) && m[1] in WEEKDAY_ALIASES) {
    date = onOrAfter(asOf, WEEKDAY_ALIASES[m[1]]);
  } else if (
    (m = /^(\d{1,2})(?:st|nd|rd|th)? (?:of )?([a-z]+)(?: (\d{4}))?$/.exec(t)) ||
    (m = /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/.exec(t))
  ) {
    const [a, b, yRaw] = [m[1], m[2], m[3]];
    const dayStr = /^\d/.test(a) ? a : b;
    const monStr = /^\d/.test(a) ? b : a;
    const mon = MONTHS[monStr];
    const day = Number(dayStr);
    if (mon && day >= 1 && day <= 31) {
      const asOfYear = Number(asOf.slice(0, 4));
      let year = yRaw ? Number(yRaw) : asOfYear;
      let candidate = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (toIso(parseIso(candidate)) !== candidate) return null; // e.g. 31 Nov
      if (!yRaw && candidate < asOf) {
        year += 1;
        candidate = `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      date = candidate;
    }
  }

  return date ? { date, time } : null;
}

/** Fields holding a timestamp (default 18:00 IST) or a plain date. */
export const TIMESTAMP_FIELDS = [
  'due_at',
  'scheduled_at',
  'occurred_at',
  'planned_start',
  'planned_end',
  'started_at',
  'committed_at',
  'ask_sent_at',
] as const;
export const DATE_ONLY_FIELDS = ['work_date', 'signed_at'] as const;

export interface DateResolution {
  field: string;
  input: string;
  resolved: string;
  display: string;
  source: 'phrase' | 'question';
}

export function formatIstDisplay(value: string): string {
  const dateOnly = isIsoDateOnly(value);
  const d = new Date(dateOnly ? `${value}T00:00:00${IST_OFFSET}` : value);
  if (Number.isNaN(d.getTime())) return value;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const day = `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
  return dateOnly ? day : `${day}, ${parts.hour}:${parts.minute} IST`;
}

function toFieldValue(field: string, r: ResolvedDate): string {
  if ((DATE_ONLY_FIELDS as readonly string[]).includes(field)) return r.date;
  return `${r.date}T${r.time ?? DEFAULT_DUE_TIME}:00${IST_OFFSET}`;
}

const QUESTION_DATE_PHRASE =
  /\b(?:by|on|before|due|until|till|for)?\s*(?:(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)\s+)?(?:today|tonight|tomorrow|the day after tomorrow|next week|end of (?:this |next )?week|in \d{1,2} days?|(?:next|this|coming)\s+(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?)(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm))?)\b/gi;

/** Relative date phrases the user typed, e.g. ["by Friday"]. */
export function extractQuestionDatePhrases(question: string): string[] {
  return Array.from(question.matchAll(QUESTION_DATE_PHRASE))
    .map((m) => m[0].trim())
    .filter((p) => /[a-z]/i.test(p) && p.length > 2);
}

/**
 * Resolve every date field in a proposed payload. Relative phrases are
 * resolved; absolute values pass through. If the user's question contains
 * exactly one relative phrase and the model wrote a different absolute date
 * into the single date field it set, the server's resolution wins.
 */
export function resolvePayloadDates(
  payload: Record<string, unknown>,
  asOf: string,
  question?: string
): { payload: Record<string, unknown>; resolutions: DateResolution[]; unresolved: Array<{ field: string; input: string }> } {
  const out = { ...payload };
  const resolutions: DateResolution[] = [];
  const unresolved: Array<{ field: string; input: string }> = [];
  const allFields = [...TIMESTAMP_FIELDS, ...DATE_ONLY_FIELDS] as readonly string[];
  const camel = (f: string) => f.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

  const present: string[] = [];
  for (const field of allFields) {
    const key = field in out ? field : camel(field) in out ? camel(field) : null;
    if (!key) continue;
    const raw = out[key];
    if (typeof raw !== 'string' || !raw.trim()) continue;
    present.push(field);
    const value = raw.trim();
    if (key !== field) {
      delete out[key];
    }
    if (isAbsoluteTimestamp(value)) {
      out[field] = value;
      continue;
    }
    if (isIsoDateOnly(value)) {
      out[field] = (DATE_ONLY_FIELDS as readonly string[]).includes(field)
        ? value
        : `${value}T${DEFAULT_DUE_TIME}:00${IST_OFFSET}`;
      continue;
    }
    const r = resolveRelativeDate(value, asOf);
    if (!r) {
      unresolved.push({ field, input: value });
      continue;
    }
    out[field] = toFieldValue(field, r);
    resolutions.push({
      field,
      input: value,
      resolved: String(out[field]),
      display: formatIstDisplay(String(out[field])),
      source: 'phrase',
    });
  }

  // Guard against the model doing its own (wrong) date arithmetic.
  if (question && present.length === 1 && resolutions.length === 0 && unresolved.length === 0) {
    const phrases = extractQuestionDatePhrases(question);
    if (phrases.length === 1) {
      const r = resolveRelativeDate(phrases[0], asOf);
      const field = present[0];
      if (r) {
        const serverValue = toFieldValue(field, r);
        const modelValue = String(out[field]);
        if (serverValue.slice(0, 10) !== modelValue.slice(0, 10)) {
          out[field] = serverValue;
        }
        resolutions.push({
          field,
          input: phrases[0],
          resolved: String(out[field]),
          display: formatIstDisplay(String(out[field])),
          source: 'question',
        });
      }
    }
  }

  return { payload: out, resolutions, unresolved };
}

export const WEEKDAY_NAMES = WEEKDAYS;
