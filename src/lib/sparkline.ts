import type { Bar, SparkPoint } from "./types";
import { OPEN_MINUTES, RANGE_LOCK_MINUTES, isTradingDay, nyClock, nyTimestamp, previousTradingDay } from "./time";

export interface SessionShape {
  /** Closes for the last 24 hours, oldest first. */
  points: SparkPoint[];
  /** Price with the most volume from the open through the latest price. */
  poc: number | null;
}

const CENT = 100;
/** One-minute bars wider than this are booked at their midpoint. */
const MAX_BIN_SPAN = 2_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One continuous line for the last 24 hours ending at the latest real print.
 * The latest 9:30–9:45 ET window is marked. Nothing after that print is included.
 * The point of control stays the regular session from the open through the latest price.
 */
export function daySparkline(input: {
  now: Date;
  bars: Bar[];
  livePrice?: number | null;
  liveTime?: number | null;
}): SessionShape {
  const nowMs = input.now.getTime();
  const prints = printsThrough(input.bars, nowMs);
  let end = prints.at(-1)?.t ?? -1;
  const live = livePrint(input.livePrice, input.liveTime, nowMs, end);
  if (live && live.t >= end) end = live.t;

  const points: SparkPoint[] = [];
  if (end >= 0) {
    const start = end - DAY_MS;
    for (const bar of prints) {
      if (bar.t < start || bar.t > end) continue;
      points.push({ t: bar.t, price: bar.close, high: bar.high, low: bar.low, opening: false });
    }
    if (live && live.t >= start && live.t >= (points.at(-1)?.t ?? -1) && points.at(-1)?.t !== live.t) {
      points.push({ t: live.t, price: live.price, high: live.price, low: live.price, opening: false });
    }
    const opening = latestOpening(end);
    for (const point of points) {
      point.opening = point.t >= opening.start && point.t < opening.end;
    }
  }

  const sessionDay = end >= 0 ? latestOpening(end).day : previousTradingDay(nyClock(input.now).ymd);
  return { points, poc: pointOfControl(input.bars, sessionDay, nowMs) };
}

function printsThrough(
  bars: Bar[],
  nowMs: number,
): Array<{ t: number; close: number; high: number; low: number }> {
  const prints: Array<{ t: number; close: number; high: number; low: number }> = [];
  for (const bar of bars) {
    if (bar.close == null || !Number.isFinite(bar.close) || bar.t > nowMs) continue;
    const high = bar.high != null && Number.isFinite(bar.high) ? bar.high : bar.close;
    const low = bar.low != null && Number.isFinite(bar.low) ? bar.low : bar.close;
    prints.push({ t: bar.t, close: bar.close, high, low });
  }
  prints.sort((a, b) => a.t - b.t);
  return prints;
}

function livePrint(
  price: number | null | undefined,
  time: number | null | undefined,
  nowMs: number,
  lastBar: number,
): { t: number; price: number } | null {
  if (price == null || !Number.isFinite(price)) return null;
  const t = time ?? nowMs;
  if (t > nowMs + 60_000 || (lastBar >= 0 && t < lastBar)) return null;
  return { t: Math.min(t, nowMs), price };
}

/** The 9:30–9:45 ET window for the session that contains `end`, or the previous one if the open has not arrived. */
function latestOpening(endMs: number): { day: string; start: number; end: number } {
  const clock = nyClock(new Date(endMs));
  const openToday = nyTimestamp(clock.ymd, OPEN_MINUTES);
  const day = isTradingDay(clock.ymd) && endMs >= openToday ? clock.ymd : previousTradingDay(clock.ymd);
  return {
    day,
    start: nyTimestamp(day, OPEN_MINUTES),
    end: nyTimestamp(day, RANGE_LOCK_MINUTES),
  };
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

export interface PlottedPoint {
  x: number;
  y: number;
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
 * Draw the last 24 hours as one line ending at the latest print.
 * Height is the high and low of that window, so the move fills the chart.
 * The opening-range highlight sits on the right just after 9:45 and shifts left as the day goes on.
 */
export function plotSession(
  points: SparkPoint[],
  width: number,
  height: number,
  poc: number | null,
): PlottedSession {
  const ordered = points
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.price))
    .slice()
    .sort((a, b) => a.t - b.t);
  if (ordered.length === 0) return EMPTY_PLOT;

  const lastMs = ordered[ordered.length - 1].t;
  const axisStart = lastMs - DAY_MS;
  const visible = ordered.filter((point) => point.t >= axisStart && point.t <= lastMs);
  if (visible.length === 0) return EMPTY_PLOT;
  const xOf = (t: number) => ((t - axisStart) / DAY_MS) * width;

  const pad = Math.max(1.5, height * 0.08);
  const prices = visible.map((point) => point.price).filter((price) => Number.isFinite(price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min;
  const yOf = (price: number) =>
    span === 0 ? height / 2 : pad + (1 - (price - min) / span) * (height - pad * 2);

  const coords = visible.map((point) => ({
    x: xOf(point.t),
    y: yOf(point.price),
    opening: point.opening,
    price: point.price,
    t: point.t,
  }));

  const opening = visible.filter((point) => point.opening);
  const band = openingBand(opening, lastMs, xOf);
  const levelY = poc != null && Number.isFinite(poc) ? yOf(clamp(poc, min, max)) : null;
  return {
    coords,
    band,
    mark: closestMark(coords, poc),
    level: levelY == null ? null : { x1: coords[0].x, x2: coords[coords.length - 1].x, y: levelY },
  };
}

/** Keep the 15-minute mark visible on a short chart without stretching the line. */
const MIN_BAND = 6;

function openingBand(
  opening: SparkPoint[],
  lastMs: number,
  xOf: (t: number) => number,
): { x: number; width: number } | null {
  if (opening.length === 0) return null;
  let x = xOf(opening[0].t);
  let right = xOf(Math.min(opening[opening.length - 1].t + MINUTE_MS, lastMs));
  if (right - x < MIN_BAND) {
    const mid = (x + right) / 2;
    x = mid - MIN_BAND / 2;
    right = mid + MIN_BAND / 2;
    const edge = xOf(lastMs);
    if (right > edge) {
      right = edge;
      x = edge - MIN_BAND;
    }
    if (x < 0) {
      x = 0;
      right = Math.min(edge, MIN_BAND);
    }
  }
  return { x, width: Math.max(right - x, 0) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
