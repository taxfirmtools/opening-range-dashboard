import { analyzeSession, describeSession, toQuote } from "./session";
import type { Bar, DemoScenario, Quote, Snapshot } from "./types";

export type { DemoScenario };

/** Fixed scenario clocks. The session date is a real weekday so the calendar logic applies. */
export const DEMO_NOW: Record<DemoScenario, string> = {
  forming: "2026-11-02T09:40:30-05:00",
  open: "2026-11-02T10:32:00-05:00",
  closed: "2026-11-02T16:10:00-05:00",
};

interface DemoSpec {
  name: string;
  orLow: number;
  orHigh: number;
  last: number;
  previousClose: number;
}

/**
 * Illustrative levels for demo mode only. They are not quotes and must stay
 * behind the demo label in the UI.
 */
const DEMO_SPECS: Record<string, DemoSpec> = {
  SPY: { name: "SPDR S&P 500", orLow: 560.2, orHigh: 562.8, last: 561.4, previousClose: 559.1 },
  QQQ: { name: "Invesco QQQ", orLow: 490.1, orHigh: 493.4, last: 496.85, previousClose: 491.2 },
  AAPL: { name: "Apple", orLow: 228.4, orHigh: 231.1, last: 226.05, previousClose: 229.8 },
  MSFT: { name: "Microsoft", orLow: 430.5, orHigh: 434.2, last: 433.1, previousClose: 428.4 },
  NVDA: { name: "NVIDIA", orLow: 132.4, orHigh: 135.9, last: 139.2, previousClose: 133.5 },
  AMZN: { name: "Amazon", orLow: 198.2, orHigh: 201.0, last: 199.4, previousClose: 197.1 },
  META: { name: "Meta Platforms", orLow: 580.0, orHigh: 586.5, last: 574.3, previousClose: 582.2 },
  TSLA: { name: "Tesla", orLow: 248.6, orHigh: 255.4, last: 252.9, previousClose: 246.8 },
};

const SESSION_OPEN = Date.parse("2026-11-02T09:30:00-05:00");

export function buildDemoSnapshot(symbols: string[], scenario: DemoScenario): Snapshot {
  const now = new Date(DEMO_NOW[scenario]);
  const session = describeSession(now);
  const quotes = symbols.map((symbol) => quoteFor(symbol, scenario, now));
  return {
    source: "demo",
    delayed: false,
    asOf: now.toISOString(),
    scenario,
    note: "Demo data is simulated so the dashboard can be tried without a feed. These are not live prices.",
    session: {
      phase: session.phase,
      sessionDate: session.sessionDate,
      sessionStatus: session.sessionStatus,
    },
    quotes,
  };
}

function quoteFor(symbol: string, scenario: DemoScenario, now: Date): Quote {
  const spec = specFor(symbol);
  const bars = buildBars(spec, scenario);
  const livePrice = scenario === "forming" ? (bars[bars.length - 1]?.close ?? spec.last) : spec.last;
  const analysis = analyzeSession({
    now,
    bars,
    livePrice,
    liveTime: now.getTime(),
    previousClose: spec.previousClose,
  });
  return toQuote(symbol, spec.name, analysis);
}

function specFor(symbol: string): DemoSpec {
  const known = DEMO_SPECS[symbol];
  if (known) return known;
  let hash = 0;
  for (const char of symbol) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  const orLow = 40 + (hash % 180);
  const orHigh = orLow + 2 + (hash % 4);
  return {
    name: symbol,
    orLow,
    orHigh,
    last: Number(((orLow + orHigh) / 2).toFixed(2)),
    previousClose: orLow - 0.8,
  };
}

function buildBars(spec: DemoSpec, scenario: DemoScenario): Bar[] {
  const minutes = scenario === "forming" ? 10 : 15;
  const bars: Bar[] = [];
  for (let i = 0; i < minutes; i += 1) {
    const span = spec.orHigh - spec.orLow;
    let high = spec.orLow + span * 0.72;
    let low = spec.orLow + span * 0.28;
    if (i === 3) {
      low = spec.orLow;
      high = spec.orLow + span * 0.2;
    }
    if (i === 12) {
      high = spec.orHigh;
      low = spec.orHigh - span * 0.25;
    }
    const close = (high + low) / 2;
    bars.push({
      t: SESSION_OPEN + i * 60_000,
      high: round2(high),
      low: round2(low),
      close: round2(close),
    });
  }
  if (scenario !== "forming") {
    bars.push({
      t: Date.parse("2026-11-02T10:31:00-05:00"),
      high: round2(spec.last + 0.05),
      low: round2(spec.last - 0.05),
      close: round2(spec.last),
    });
  }
  return bars;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
