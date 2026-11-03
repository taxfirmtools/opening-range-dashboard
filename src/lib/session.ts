import type { Bar, Phase, Quote, SessionStatus, Signal } from "./types";
import {
  OPEN_MINUTES,
  RANGE_LOCK_MINUTES,
  closeMinutesFor,
  isTradingDay,
  nyClock,
  previousTradingDay,
} from "./time";

export interface Analysis {
  last: number | null;
  previousClose: number | null;
  orHigh: number | null;
  orLow: number | null;
  signal: Signal;
  phase: Phase;
  sessionDate: string;
  sessionStatus: SessionStatus;
  orBarCount: number;
}

export interface AnalysisInput {
  now: Date;
  bars: Bar[];
  livePrice?: number | null;
  liveTime?: number | null;
  previousClose?: number | null;
}

const PRICE_EPS = 0.0001;

export function describeSession(now: Date): {
  phase: Phase;
  sessionDate: string;
  sessionStatus: SessionStatus;
} {
  const clock = nyClock(now);
  const trading = isTradingDay(clock.ymd);
  const openAt = OPEN_MINUTES * 60;
  const lockAt = RANGE_LOCK_MINUTES * 60;
  const closeAt = closeMinutesFor(clock.ymd) * 60;

  if (!trading || clock.seconds < openAt) {
    return {
      phase: "closed",
      sessionDate: previousTradingDay(clock.ymd),
      sessionStatus: "Session closed",
    };
  }
  if (clock.seconds >= closeAt) {
    return {
      phase: "closed",
      sessionDate: clock.ymd,
      sessionStatus: "Session closed",
    };
  }
  if (clock.seconds < lockAt) {
    return {
      phase: "forming",
      sessionDate: clock.ymd,
      sessionStatus: "Range forming",
    };
  }
  return {
    phase: "open",
    sessionDate: clock.ymd,
    sessionStatus: "Regular hours",
  };
}

export function statusHint(
  session: { phase: Phase; sessionDate: string },
  now: Date,
): string | null {
  const clock = nyClock(now);
  if (session.phase === "forming") return "High and low update until 9:45am ET";
  if (session.phase === "open") return "Outside the 9:30–9:45 band is highlighted";
  if (isTradingDay(clock.ymd) && clock.seconds < OPEN_MINUTES * 60) {
    return "Premarket price. The range is the previous regular session.";
  }
  if (isTradingDay(clock.ymd) && clock.seconds >= closeMinutesFor(clock.ymd) * 60) {
    return "After-hours price. The range is today's regular session.";
  }
  return "Showing the latest completed session";
}

export function analyzeSession(input: AnalysisInput): Analysis {
  const session = describeSession(input.now);
  const closeMinutes = closeMinutesFor(session.sessionDate);
  const cutoff = session.phase === "forming" ? input.now.getTime() : Number.POSITIVE_INFINITY;

  let orHigh: number | null = null;
  let orLow: number | null = null;
  let orBarCount = 0;
  let latestClose: number | null = null;
  let latestCloseTime = -1;

  for (const bar of input.bars) {
    // Latest print may be premarket or after-hours. The range below stays regular session only.
    if (bar.t <= input.now.getTime() && bar.close != null && bar.t >= latestCloseTime) {
      latestClose = bar.close;
      latestCloseTime = bar.t;
    }

    if (bar.t > cutoff) continue;
    const clock = nyClock(new Date(bar.t));
    if (clock.ymd !== session.sessionDate) continue;
    if (clock.seconds < OPEN_MINUTES * 60 || clock.seconds >= closeMinutes * 60) continue;
    if (clock.seconds >= RANGE_LOCK_MINUTES * 60) continue;
    if (bar.high == null || bar.low == null) continue;
    orHigh = orHigh == null ? bar.high : Math.max(orHigh, bar.high);
    orLow = orLow == null ? bar.low : Math.min(orLow, bar.low);
    orBarCount += 1;
  }

  let last = latestClose;
  const live = input.livePrice;
  if (live != null && Number.isFinite(live) && (input.liveTime == null || input.liveTime >= latestCloseTime)) {
    last = live;
  }

  return {
    last,
    previousClose: finiteOrNull(input.previousClose),
    orHigh,
    orLow,
    signal: signalFor(session.phase, last, orHigh, orLow),
    phase: session.phase,
    sessionDate: session.sessionDate,
    sessionStatus: session.sessionStatus,
    orBarCount,
  };
}

export function toQuote(
  symbol: string,
  name: string | null,
  analysis: Analysis,
  error?: string,
): Quote {
  return {
    symbol,
    name,
    ...analysis,
    ...(error ? { error } : {}),
  };
}

export function unavailableQuote(symbol: string, now: Date, error: string): Quote {
  const session = describeSession(now);
  return {
    symbol,
    name: null,
    last: null,
    previousClose: null,
    orHigh: null,
    orLow: null,
    signal: "unavailable",
    phase: session.phase,
    sessionDate: session.sessionDate,
    sessionStatus: session.sessionStatus,
    orBarCount: 0,
    error,
  };
}

function signalFor(
  phase: Phase,
  last: number | null,
  high: number | null,
  low: number | null,
): Signal {
  if (phase === "forming") return "forming";
  if (last == null || high == null || low == null) return "unavailable";
  if (last > high + PRICE_EPS) return "above";
  if (last < low - PRICE_EPS) return "below";
  return "inside";
}

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}
