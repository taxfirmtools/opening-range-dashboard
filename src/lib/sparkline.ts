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

/** Share of the sparkline width reserved for the 9:30–9:45 stretch. */
export const OPENING_LANE_SHARE = 0.34;
const BEFORE_LANE_SHARE = 0.14;

export interface PlottedPoint {
  x: number;
  y: number;
  opening: boolean;
  price: number;
}

export interface PlottedSession {
  coords: PlottedPoint[];
  /** Amber window. Wide enough to read those fifteen minutes, not a time-proportional sliver. */
  band: { x: number; width: number } | null;
  /** Closest print to the point of control, sitting on the line. */
  mark: { x: number; y: number } | null;
  /** Vertical position of the point-of-control price. */
  levelY: number | null;
}

/**
 * Lay out the session line. The opening window gets a fixed share of the width
 * so the amber stretch stays readable. The other prints share what's left.
 */
export function plotSession(
  points: SparkPoint[],
  width: number,
  height: number,
  poc: number | null,
): PlottedSession {
  const pad = 16;
  const prices = points.map((point) => point.price);
  if (poc != null && Number.isFinite(poc)) prices.push(poc);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const span = max - min;
  const yOf = (price: number) =>
    span === 0 ? height / 2 : pad + (1 - (price - min) / span) * (height - pad * 2);

  const first = points.findIndex((point) => point.opening);
  const last = lastOpeningIndex(points);
  const shares = laneShares(first, last, points.length);
  const beforeW = shares.before * width;
  const openW = shares.open * width;
  const afterW = shares.after * width;

  const coords = points.map((point, index) => ({
    x: xFor(index, points.length, first, last, width, beforeW, openW, afterW),
    y: yOf(point.price),
    opening: point.opening,
    price: point.price,
  }));

  const levelY = poc != null && Number.isFinite(poc) ? yOf(poc) : null;
  return {
    coords,
    band: first < 0 ? null : { x: beforeW, width: openW },
    mark: closestMark(coords, poc),
    levelY,
  };
}

function lastOpeningIndex(points: SparkPoint[]): number {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].opening) return index;
  }
  return -1;
}

function laneShares(first: number, last: number, count: number) {
  if (first < 0 || last < 0) return { before: 0, open: 0, after: 1 };
  const hasBefore = first > 0;
  const hasAfter = last < count - 1;
  if (!hasBefore && !hasAfter) return { before: 0, open: 1, after: 0 };
  if (!hasBefore) return { before: 0, open: OPENING_LANE_SHARE, after: 1 - OPENING_LANE_SHARE };
  if (!hasAfter) return { before: 0.22, open: 0.78, after: 0 };
  return { before: BEFORE_LANE_SHARE, open: OPENING_LANE_SHARE, after: 1 - BEFORE_LANE_SHARE - OPENING_LANE_SHARE };
}

function xFor(
  index: number,
  count: number,
  first: number,
  last: number,
  width: number,
  beforeW: number,
  openW: number,
  afterW: number,
): number {
  if (count <= 1) return width / 2;
  if (first < 0) return (index / (count - 1)) * width;
  if (last === first && index === first) return beforeW + openW / 2;
  if (index <= first) return first === 0 ? beforeW : (index / first) * beforeW;
  if (index <= last) return beforeW + ((index - first) / (last - first)) * openW;
  return beforeW + openW + ((index - last) / (count - 1 - last)) * afterW;
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
