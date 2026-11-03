import type { Bar } from "./types";
import { isTradingDay, nyClock, previousTradingDay } from "./time";

/**
 * Closes for the shape of the current session, oldest first.
 * One point per minute bar already on the quote snapshot, plus the latest
 * price when it is newer. It updates when that snapshot refreshes.
 */
export function daySparkline(input: {
  now: Date;
  bars: Bar[];
  livePrice?: number | null;
  liveTime?: number | null;
}): number[] {
  const nowMs = input.now.getTime();
  const today = nyClock(input.now).ymd;
  let day = isTradingDay(today) ? today : previousTradingDay(today);
  let closes = closesOnDay(input.bars, day, nowMs);
  if (closes.length === 0) {
    day = previousTradingDay(day);
    closes = closesOnDay(input.bars, day, nowMs);
  }

  const points = closes.map((bar) => bar.close);
  const live = input.livePrice;
  if (live == null || !Number.isFinite(live)) return points;
  const liveMs = input.liveTime;
  if (liveMs != null && (liveMs > nowMs + 60_000 || nyClock(new Date(liveMs)).ymd !== day)) return points;
  const lastT = closes.at(-1)?.t ?? -1;
  if (liveMs != null && liveMs < lastT) return points;
  points.push(live);
  return points;
}

function closesOnDay(bars: Bar[], day: string, nowMs: number): Array<{ t: number; close: number }> {
  const closes: Array<{ t: number; close: number }> = [];
  for (const bar of bars) {
    if (bar.close == null || !Number.isFinite(bar.close) || bar.t > nowMs) continue;
    if (nyClock(new Date(bar.t)).ymd !== day) continue;
    closes.push({ t: bar.t, close: bar.close });
  }
  closes.sort((a, b) => a.t - b.t);
  return closes;
}
