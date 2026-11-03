import type { Quote, Signal } from "./types";

export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPoints(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatSessionDay(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatEtClock(date: Date): string {
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
  return `${time} ET`;
}

export function formatChange(
  last: number | null,
  previousClose: number | null,
): { text: string; direction: "up" | "down" | "flat" } | null {
  if (
    last == null ||
    previousClose == null ||
    !Number.isFinite(last) ||
    !Number.isFinite(previousClose) ||
    previousClose === 0
  ) {
    return null;
  }
  const pct = ((last - previousClose) / previousClose) * 100;
  const direction = pct > 0.005 ? "up" : pct < -0.005 ? "down" : "flat";
  const sign = pct > 0 ? "+" : "";
  return { text: `${sign}${pct.toFixed(2)}%`, direction };
}

export function signalLabel(signal: Signal): string {
  switch (signal) {
    case "above":
      return "Above the range";
    case "below":
      return "Below the range";
    case "inside":
      return "Inside";
    case "forming":
      return "Forming";
    case "unavailable":
      return "Unavailable";
  }
}

export function extensionText(quote: Quote): string {
  if (quote.error) return quote.error;
  if (quote.signal === "forming") {
    if (quote.orBarCount === 0) return "Waiting for the first print";
    const partial = quote.orBarCount < 15 ? ` · ${quote.orBarCount}/15 min` : "";
    return `Locks at 9:45am ET${partial}`;
  }
  if (quote.signal === "unavailable" || quote.last == null || quote.orHigh == null || quote.orLow == null) {
    return quote.orBarCount > 0 && quote.orBarCount < 15
      ? `Partial opening prints (${quote.orBarCount}/15)`
      : "No opening range";
  }
  if (quote.signal === "above") return `${formatPoints(quote.last - quote.orHigh)} above the high`;
  if (quote.signal === "below") return `${formatPoints(quote.orLow - quote.last)} below the low`;
  const toHigh = quote.orHigh - quote.last;
  const toLow = quote.last - quote.orLow;
  const partial = quote.orBarCount > 0 && quote.orBarCount < 15 ? ` · ${quote.orBarCount}/15 min` : "";
  const distance =
    toHigh <= toLow
      ? `${formatPoints(toHigh)} under the high`
      : `${formatPoints(toLow)} over the low`;
  return `${distance}${partial}`;
}
