export interface NyClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  ymd: string;
  /** Seconds since midnight in America/New_York. */
  seconds: number;
}

const nyFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * NYSE full-day closures, 2025–2027.
 * Outside this window the app still skips weekends, but it does not know holidays.
 */
const HOLIDAYS = new Set([
  "2025-01-01",
  "2025-01-09",
  "2025-01-20",
  "2025-02-17",
  "2025-04-18",
  "2025-05-26",
  "2025-06-19",
  "2025-07-04",
  "2025-09-01",
  "2025-11-27",
  "2025-12-25",
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  "2027-06-18",
  "2027-07-05",
  "2027-09-06",
  "2027-11-25",
  "2027-12-24",
]);

/** Days the cash session closes at 1:00pm ET. */
const EARLY_CLOSES = new Set([
  "2025-07-03",
  "2025-11-28",
  "2025-12-24",
  "2026-11-27",
  "2026-12-24",
  "2027-11-26",
  "2027-12-23",
]);

export const REGULAR_CLOSE_MINUTES = 16 * 60;
export const EARLY_CLOSE_MINUTES = 13 * 60;
export const OPEN_MINUTES = 9 * 60 + 30;
export const RANGE_LOCK_MINUTES = 9 * 60 + 45;

export function nyClock(date: Date): NyClock {
  const parts = nyFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const ymd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    ymd,
    seconds: hour * 3600 + minute * 60 + second,
  };
}

export function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function weekdayOf(ymd: string): number {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isWeekend(ymd: string): boolean {
  const day = weekdayOf(ymd);
  return day === 0 || day === 6;
}

export function isHoliday(ymd: string): boolean {
  return HOLIDAYS.has(ymd);
}

export function isTradingDay(ymd: string): boolean {
  return !isWeekend(ymd) && !isHoliday(ymd);
}

export function closeMinutesFor(ymd: string): number {
  return EARLY_CLOSES.has(ymd) ? EARLY_CLOSE_MINUTES : REGULAR_CLOSE_MINUTES;
}

export function previousTradingDay(ymd: string): string {
  let cursor = ymd;
  for (let i = 0; i < 14; i += 1) {
    cursor = addDays(cursor, -1);
    if (isTradingDay(cursor)) return cursor;
  }
  return addDays(ymd, -1);
}
