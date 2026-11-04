import type { Bar, SparkPoint } from "./types";
import { OPEN_MINUTES, RANGE_LOCK_MINUTES, isTradingDay, nyClock, previousTradingDay } from "./time";

export interface SessionShape {
  /** Closes for the shape of the current session, oldest first. */
  points: SparkPoint[];
  /** Price with the most volume from the open through the latest price. */
  poc: number | null;
}

const CENT = 100;
/** One-minute bars wider than this are booked at their midpoint. */
const MAX_BIN_SPAN = 2_000;

/**
 * Closes for the shape of the current session, oldest first.
 * One point per minute bar already on the quote snapshot, plus the latest
 * price when it is newer. The point of control uses volume from 9:30 ET
 * through that latest price, not only the opening fifteen minutes.
 * Both update when the snapshot refreshes.
 */
export function daySparkline(input: {
  now: Date;
  bars: Bar[];
  livePrice?: number | null;
  liveTime?: number | null;
}): SessionShape {
  const nowMs = input.now.getTime();
  const today = nyClock(input.now).ymd;
  let day = isTradingDay(today) ? today : previousTradingDay(today);
  let closes = closesOnDay(input.bars, day, nowMs);
  if (closes.length === 0) {
    day = previousTradingDay(day);
    closes = closesOnDay(input.bars, day, nowMs);
  }

  const points: SparkPoint[] = closes.map((bar) => ({
    price: bar.close,
    opening: isOpeningWindow(bar.t),
  }));
  const live = input.livePrice;
  if (live != null && Number.isFinite(live)) {
    const liveMs = input.liveTime;
    const wrongDay = liveMs != null && (liveMs > nowMs + 60_000 || nyClock(new Date(liveMs)).ymd !== day);
    const stale = liveMs != null && liveMs < (closes.at(-1)?.t ?? -1);
    if (!wrongDay && !stale) {
      points.push({ price: live, opening: isOpeningWindow(liveMs ?? nowMs) });
    }
  }

  return { points, poc: pointOfControl(input.bars, day, nowMs) };
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

function isOpeningWindow(t: number): boolean {
  const clock = nyClock(new Date(t));
  return clock.seconds >= OPEN_MINUTES * 60 && clock.seconds < RANGE_LOCK_MINUTES * 60;
}

/**
 * Volume profile from the 9:30 open through the latest print on `day`.
 * Each minute's volume is spread evenly across the cents from its low to its high.
 * Premarket volume is excluded. The fullest cent is the point of control.
 */
function pointOfControl(bars: Bar[], day: string, nowMs: number): number | null {
  const bins = new Map<number, number>();
  for (const bar of bars) {
    if (bar.t > nowMs) continue;
    const clock = nyClock(new Date(bar.t));
    if (clock.ymd !== day || clock.seconds < OPEN_MINUTES * 60) continue;
    const volume = bar.volume;
    if (volume == null || !Number.isFinite(volume) || volume <= 0) continue;
    const close = bar.close;
    const low = bar.low ?? close;
    const high = bar.high ?? close;
    if (low == null || high == null || !Number.isFinite(low) || !Number.isFinite(high)) continue;
    addVolume(bins, low, high, volume);
  }

  let bestCents: number | null = null;
  let bestVolume = -1;
  for (const [cents, volume] of bins) {
    if (volume > bestVolume || (volume === bestVolume && bestCents != null && cents < bestCents)) {
      bestVolume = volume;
      bestCents = cents;
    }
  }
  return bestCents == null ? null : bestCents / CENT;
}

function addVolume(bins: Map<number, number>, low: number, high: number, volume: number) {
  const start = Math.round(Math.min(low, high) * CENT);
  const end = Math.round(Math.max(low, high) * CENT);
  if (end - start > MAX_BIN_SPAN) {
    const mid = Math.round(((low + high) / 2) * CENT);
    bins.set(mid, (bins.get(mid) ?? 0) + volume);
    return;
  }
  const each = volume / (end - start + 1);
  for (let cents = start; cents <= end; cents += 1) {
    bins.set(cents, (bins.get(cents) ?? 0) + each);
  }
}
