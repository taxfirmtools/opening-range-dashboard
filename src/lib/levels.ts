import { nyClock } from "./time";

export interface LevelPoint {
  /** ET calendar date, YYYY-MM-DD. */
  date: string;
  close: number;
}

export interface LevelTrend {
  last: number | null;
  /** Newest minus the oldest of the last three trading days. */
  change: number | null;
  percent: number | null;
  days: LevelPoint[];
}

export type LevelUnit = "usd" | "percent";

export interface MarketLevel extends LevelTrend {
  id: "oil" | "yield10y";
  label: string;
  symbol: string;
  unit: LevelUnit;
  error?: string;
}

export interface LevelsSnapshot {
  source: "yahoo";
  asOf: string;
  levels: MarketLevel[];
}

/**
 * Last price and the move across the last three trading sessions.
 * Daily bars are already one per session. A newer live quote replaces that session's close.
 */
export function summarizeThreeDayTrend(input: {
  bars: Array<{ t: number; close: number | null }>;
  livePrice?: number | null;
  liveTime?: number | null;
  now?: Date;
}): LevelTrend {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const byDate = new Map<string, { t: number; close: number }>();

  for (const bar of input.bars) {
    if (bar.close == null || !Number.isFinite(bar.close) || bar.t > nowMs) continue;
    const date = nyClock(new Date(bar.t)).ymd;
    const existing = byDate.get(date);
    if (!existing || bar.t >= existing.t) byDate.set(date, { t: bar.t, close: bar.close });
  }

  const live = input.livePrice;
  if (live != null && Number.isFinite(live)) {
    const liveMs = input.liveTime ?? nowMs;
    if (liveMs <= nowMs + 60_000) {
      const date = nyClock(new Date(liveMs)).ymd;
      const existing = byDate.get(date);
      if (!existing || liveMs >= existing.t) byDate.set(date, { t: liveMs, close: live });
    }
  }

  const ordered = [...byDate.entries()].sort((a, b) => a[1].t - b[1].t);
  const days = ordered.slice(-3).map(([date, point]) => ({ date, close: point.close }));
  const last = days.at(-1)?.close ?? null;
  const oldest = days.length >= 2 ? days[0]?.close : undefined;
  if (last == null || oldest == null) {
    return { last, change: null, percent: null, days };
  }
  const change = last - oldest;
  const percent = oldest !== 0 ? (change / oldest) * 100 : null;
  return { last, change, percent, days };
}
