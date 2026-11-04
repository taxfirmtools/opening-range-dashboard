export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
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
