import type { Bar, SparkPoint } from "./types";
import {
  OPEN_MINUTES,
  RANGE_LOCK_MINUTES,
  closeMinutesFor,
  isTradingDay,
  nyClock,
  nyTimestamp,
  previousTradingDay,
} from "./time";

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
    t: bar.t,
    price: bar.close,
    high: bar.high,
    low: bar.low,
    opening: isOpeningWindow(bar.t),
  }));
  const live = input.livePrice;
  if (live != null && Number.isFinite(live)) {
    const liveMs = input.liveTime;
    const wrongDay = liveMs != null && (liveMs > nowMs + 60_000 || nyClock(new Date(liveMs)).ymd !== day);
    const stale = liveMs != null && liveMs < (closes.at(-1)?.t ?? -1);
    if (!wrongDay && !stale) {
      const t = liveMs ?? nowMs;
      points.push({ t, price: live, high: live, low: live, opening: isOpeningWindow(t) });
    }
  }

  return { points, poc: pointOfControl(input.bars, day, nowMs) };
}

function closesOnDay(
  bars: Bar[],
  day: string,
  nowMs: number,
): Array<{ t: number; close: number; high: number; low: number }> {
  const closes: Array<{ t: number; close: number; high: number; low: number }> = [];
  for (const bar of bars) {
    if (bar.close == null || !Number.isFinite(bar.close) || bar.t > nowMs) continue;
    if (nyClock(new Date(bar.t)).ymd !== day) continue;
    const high = bar.high != null && Number.isFinite(bar.high) ? bar.high : bar.close;
    const low = bar.low != null && Number.isFinite(bar.low) ? bar.low : bar.close;
    closes.push({ t: bar.t, close: bar.close, high, low });
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

const MINUTE_MS = 60_000;
/** Do not bridge a halt or a missing stretch with a long segment. */
export const MAX_CONNECTED_GAP_MS = 2 * MINUTE_MS;

export interface PlottedPoint {
  x: number;
  y: number;
  /** Top of the minute bar. High price, so the smaller SVG y. */
  yTop: number;
  /** Bottom of the minute bar. */
  yBottom: number;
  opening: boolean;
  price: number;
  t: number;
}

export interface PlottedSession {
  coords: PlottedPoint[];
  /** Amber window, only through minutes that have actually printed. */
  band: { x: number; width: number } | null;
  /** Closest print to the point of control, sitting on that minute. */
  mark: { x: number; y: number } | null;
  /** Point-of-control level, drawn only across the minutes that exist. */
  level: { x1: number; x2: number; y: number } | null;
}

const EMPTY_PLOT: PlottedSession = { coords: [], band: null, mark: null, level: null };

/**
 * Place each minute at its real time. The axis runs from the 9:30 open through
 * the regular close, so a morning chart stops at the latest print and leaves
 * the rest of the day blank. Nothing is resampled to fill the width.
 */
export function plotSession(
  points: SparkPoint[],
  width: number,
  height: number,
  poc: number | null,
): PlottedSession {
  const session = points
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.price) && isSessionPrint(point.t))
    .slice()
    .sort((a, b) => a.t - b.t);
  if (session.length === 0) return EMPTY_PLOT;

  const day = nyClock(new Date(session[session.length - 1].t)).ymd;
  const openMs = nyTimestamp(day, OPEN_MINUTES);
  const closeMs = nyTimestamp(day, closeMinutesFor(day));
  const lastMs = session[session.length - 1].t;
  const axisStart = openMs;
  const axisEnd = Math.max(closeMs, lastMs);
  const spanT = Math.max(axisEnd - axisStart, MINUTE_MS);
  const xOf = (t: number) => ((t - axisStart) / spanT) * width;

  const pad = Math.min(16, height * 0.2);
  const prices = session.flatMap((point) => [point.price, point.high, point.low]);
  if (poc != null && Number.isFinite(poc)) prices.push(poc);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min;
  const yOf = (price: number) =>
    span === 0 ? height / 2 : pad + (1 - (price - min) / span) * (height - pad * 2);

  const coords = session.map((point) => {
    const y = yOf(point.price);
    const top = yOf(Math.max(point.high, point.price));
    const bottom = yOf(Math.min(point.low, point.price));
    const bar = Math.max(bottom - top, 1.2);
    return {
      x: xOf(point.t),
      y,
      yTop: top,
      yBottom: top + bar,
      opening: point.opening,
      price: point.price,
      t: point.t,
    };
  });

  const openingEnds = openMs + (RANGE_LOCK_MINUTES - OPEN_MINUTES) * MINUTE_MS;
  const bandEndMs = Math.min(openingEnds, lastMs + MINUTE_MS);
  const band =
    lastMs < openMs || bandEndMs <= openMs ? null : { x: xOf(openMs), width: Math.max(xOf(bandEndMs) - xOf(openMs), 0) };
  const levelY = poc != null && Number.isFinite(poc) ? yOf(poc) : null;
  return {
    coords,
    band,
    mark: closestMark(coords, poc),
    level: levelY == null ? null : { x1: coords[0].x, x2: coords[coords.length - 1].x, y: levelY },
  };
}

function isSessionPrint(t: number): boolean {
  return nyClock(new Date(t)).seconds >= OPEN_MINUTES * 60;
}

function closestMark(coords: PlottedPoint[], poc: number | null): { x: number; y: number } | null {
  if (poc == null || !Number.isFinite(poc) || coords.length === 0) return null;
  let best = coords[0];
  let bestDistance = Math.abs(best.price - poc);
  for (const point of coords) {
    const distance = Math.abs(point.price - poc);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return { x: best.x, y: best.y };
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
