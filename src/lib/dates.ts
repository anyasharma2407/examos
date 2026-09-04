/**
 * Date helpers for exam scheduling.
 *
 * Exam dates are calendar dates, not instants: "25 October" must read the same
 * for a student in Brisbane and one in Berlin. Everything here therefore works
 * in UTC, and dates from `<input type="date">` are anchored at UTC midnight.
 */

/** Milliseconds in a day. Exam dates never straddle a DST change in UTC. */
const DAY_MS = 86_400_000;

/**
 * Parses a `YYYY-MM-DD` string (the format `<input type="date">` submits) into
 * a UTC-midnight Date. Returns null for anything malformed, including dates
 * that look valid but do not exist, such as 2026-02-30.
 */
export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  // Date.UTC rolls overflow forward (Feb 30 becomes Mar 2); reject that.
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return date;
}

/** Strips the time component, keeping the UTC calendar day. */
export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/**
 * Whole calendar days from `from` until `to`. Today is 0, tomorrow is 1, and a
 * date that has passed is negative.
 */
export function daysUntil(to: Date, from: Date = new Date()): number {
  return Math.round(
    (startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / DAY_MS,
  );
}

/** "17 days remaining", "Tomorrow", "Today", "Passed". */
export function countdownLabel(examDate: Date, from: Date = new Date()): string {
  const days = daysUntil(examDate, from);
  if (days < 0) return "Exam has passed";
  if (days === 0) return "Exam is today";
  if (days === 1) return "Tomorrow";
  return `${days} days remaining`;
}

/** "25 October 2026", rendered in UTC so the calendar day never shifts. */
export function formatExamDate(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Value for an `<input type="date">`, e.g. "2026-10-25". */
export function toDateInputValue(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

/** "8 hours", "8.5 hours", "45 minutes" — for study-time summaries. */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  const rounded = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${rounded} ${rounded === "1" ? "hour" : "hours"}`;
}
