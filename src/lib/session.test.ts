import { describe, expect, it } from "vitest";
import { analyzeSession, describeSession } from "./session";
import { sortQuotes } from "./sort";
import { normalizeSymbol, parseSymbolList } from "./symbols";
import type { Bar, Quote, Signal } from "./types";
import { isTradingDay, nyClock } from "./time";
import { parseYahooChart } from "./yahooParse";

function bar(iso: string, high: number, low: number, close: number): Bar {
  return { t: Date.parse(iso), high, low, close };
}

describe("New York clock", () => {
  it("reads Eastern time across DST", () => {
    const est = nyClock(new Date("2026-11-02T09:30:00-05:00"));
    expect(est.ymd).toBe("2026-11-02");
    expect(est.hour).toBe(9);
    expect(est.minute).toBe(30);

    const edt = nyClock(new Date("2026-10-27T09:44:00-04:00"));
    expect(edt.ymd).toBe("2026-10-27");
    expect(edt.hour).toBe(9);
    expect(edt.minute).toBe(44);

    const midnight = nyClock(new Date("2026-11-02T00:05:00-05:00"));
    expect(midnight.hour).toBe(0);
    expect(midnight.ymd).toBe("2026-11-02");
  });
});

describe("session calendar", () => {
  it("is forming until 9:45:00 ET and open after that", () => {
    expect(describeSession(new Date("2026-11-02T09:30:00-05:00")).phase).toBe("forming");
    expect(describeSession(new Date("2026-11-02T09:44:59-05:00")).phase).toBe("forming");
    expect(describeSession(new Date("2026-11-02T09:45:00-05:00")).phase).toBe("open");
    expect(describeSession(new Date("2026-11-02T15:59:59-05:00")).phase).toBe("open");
  });

  it("keeps the previous session before the open and today's session after the close", () => {
    const before = describeSession(new Date("2026-11-02T09:29:59-05:00"));
    expect(before.phase).toBe("closed");
    expect(before.sessionDate).toBe("2026-10-30");
    expect(before.sessionStatus).toBe("Session closed");

    const after = describeSession(new Date("2026-11-02T16:00:00-05:00"));
    expect(after.phase).toBe("closed");
    expect(after.sessionDate).toBe("2026-11-02");
  });

  it("uses the last completed session on weekends and holidays", () => {
    expect(isTradingDay("2026-11-26")).toBe(false);
    expect(isTradingDay("2026-11-25")).toBe(true);
    const sunday = describeSession(new Date("2026-11-01T12:00:00-05:00"));
    expect(sunday.sessionDate).toBe("2026-10-30");
    const thanksgiving = describeSession(new Date("2026-11-26T12:00:00-05:00"));
    expect(thanksgiving.sessionDate).toBe("2026-11-25");
  });

  it("closes an early session at 1:00pm ET", () => {
    expect(describeSession(new Date("2026-11-27T12:59:00-05:00")).phase).toBe("open");
    const closed = describeSession(new Date("2026-11-27T13:00:00-05:00"));
    expect(closed.phase).toBe("closed");
    expect(closed.sessionDate).toBe("2026-11-27");
  });
});

describe("opening range", () => {
  const bars = [
    bar("2026-11-02T09:29:00-05:00", 110, 109, 109.5),
    bar("2026-11-02T09:30:00-05:00", 101, 100, 100.4),
    bar("2026-11-02T09:44:00-05:00", 103, 99, 102),
    bar("2026-11-02T09:45:00-05:00", 120, 80, 110),
    bar("2026-11-02T15:59:00-05:00", 104, 101, 103.2),
  ];

  it("uses prints from 9:30 through 9:44 and ignores the surrounding minutes", () => {
    const result = analyzeSession({
      now: new Date("2026-11-02T10:00:00-05:00"),
      bars,
      livePrice: 102,
      liveTime: Date.parse("2026-11-02T10:00:00-05:00"),
    });
    expect(result.orHigh).toBe(103);
    expect(result.orLow).toBe(99);
    expect(result.orBarCount).toBe(2);
    expect(result.signal).toBe("inside");
    expect(result.sessionStatus).toBe("Regular hours");
  });

  it("treats the high and low as inside, and a tick beyond them as a break", () => {
    const atHigh = analyzeSession({
      now: new Date("2026-11-02T10:00:00-05:00"),
      bars,
      livePrice: 103,
    });
    const above = analyzeSession({
      now: new Date("2026-11-02T10:00:00-05:00"),
      bars,
      livePrice: 103.01,
    });
    const atLow = analyzeSession({
      now: new Date("2026-11-02T10:00:00-05:00"),
      bars,
      livePrice: 99,
    });
    const below = analyzeSession({
      now: new Date("2026-11-02T10:00:00-05:00"),
      bars,
      livePrice: 98.99,
    });
    expect(atHigh.signal).toBe("inside");
    expect(above.signal).toBe("above");
    expect(atLow.signal).toBe("inside");
    expect(below.signal).toBe("below");
  });

  it("keeps the range forming, and ignores minutes that have not printed yet", () => {
    const result = analyzeSession({
      now: new Date("2026-11-02T09:40:00-05:00"),
      bars,
      livePrice: 125,
      liveTime: Date.parse("2026-11-02T09:40:00-05:00"),
    });
    expect(result.phase).toBe("forming");
    expect(result.signal).toBe("forming");
    expect(result.orHigh).toBe(101);
    expect(result.orLow).toBe(100);
    expect(result.orBarCount).toBe(1);
  });

  it("after the close, uses the after-hours price and keeps the regular-session range", () => {
    const result = analyzeSession({
      now: new Date("2026-11-02T16:30:00-05:00"),
      bars,
      livePrice: 140,
      liveTime: Date.parse("2026-11-02T16:30:00-05:00"),
    });
    expect(result.phase).toBe("closed");
    expect(result.orHigh).toBe(103);
    expect(result.orLow).toBe(99);
    expect(result.last).toBe(140);
    expect(result.signal).toBe("above");
    expect(result.sessionDate).toBe("2026-11-02");
  });

  it("before the open, keeps the previous regular-session range and shows the premarket price", () => {
    const friday = [
      bar("2026-10-30T09:31:00-04:00", 50, 48, 49),
      bar("2026-10-30T09:44:00-04:00", 51, 49, 50),
      bar("2026-10-30T15:59:00-04:00", 52, 51, 51.5),
      bar("2026-11-02T08:00:00-05:00", 99, 98, 99),
    ];
    const result = analyzeSession({
      now: new Date("2026-11-02T08:15:00-05:00"),
      bars: friday,
      livePrice: 99,
      liveTime: Date.parse("2026-11-02T08:15:00-05:00"),
    });
    expect(result.sessionDate).toBe("2026-10-30");
    expect(result.orHigh).toBe(51);
    expect(result.orLow).toBe(48);
    expect(result.last).toBe(99);
    expect(result.signal).toBe("above");
    expect(result.sessionStatus).toBe("Session closed");
  });

  it("includes 9:30 and 9:44 bars from an EDT session", () => {
    const result = analyzeSession({
      now: new Date("2026-10-27T10:15:00-04:00"),
      bars: [
        bar("2026-10-27T09:30:00-04:00", 10, 9, 9.5),
        bar("2026-10-27T09:44:00-04:00", 12, 8, 11),
        bar("2026-10-27T09:45:00-04:00", 20, 1, 15),
      ],
      livePrice: 11,
    });
    expect(result.orHigh).toBe(12);
    expect(result.orLow).toBe(8);
    expect(result.signal).toBe("inside");
  });
});

describe("sort", () => {
  it("puts the furthest breakouts first", () => {
    const order = ["SPY", "QQQ", "AAPL", "NVDA", "META"];
    const quotes = [
      sampleQuote("SPY", "inside", 10, 9, 11),
      sampleQuote("QQQ", "above", 12, 9, 10),
      sampleQuote("NVDA", "above", 14, 9, 10),
      sampleQuote("AAPL", "below", 7, 9, 11),
      sampleQuote("META", "below", 5, 9, 11),
    ];
    const sorted = sortQuotes(quotes, "breakouts", order);
    expect(sorted.map((quote) => quote.symbol)).toEqual(["NVDA", "QQQ", "META", "AAPL", "SPY"]);
    const listed = sortQuotes(quotes, "list", order);
    expect(listed.map((quote) => quote.symbol)).toEqual(order);
  });
});

function sampleQuote(symbol: string, signal: Signal, last: number, orLow: number, orHigh: number): Quote {
  return {
    symbol,
    name: null,
    last,
    previousClose: null,
    orHigh,
    orLow,
    signal,
    phase: "open",
    sessionDate: "2026-11-02",
    sessionStatus: "Regular hours",
    orBarCount: 15,
  };
}

describe("symbols", () => {
  it("normalizes tickers and drops junk", () => {
    expect(normalizeSymbol(" aapl ")).toBe("AAPL");
    expect(normalizeSymbol("BRK.B")).toBe("BRK.B");
    expect(normalizeSymbol("")).toBeNull();
    expect(normalizeSymbol("this is not a ticker")).toBeNull();
    expect(parseSymbolList("spy, SPY, qqq, ???")).toEqual(["SPY", "QQQ"]);
  });
});

describe("yahoo chart parser", () => {
  it("reads minute bars and the regular-session price", () => {
    const parsed = parseYahooChart("SPY", {
      chart: {
        result: [
          {
            meta: {
              shortName: "SPDR S&P 500",
              regularMarketPrice: 101.5,
              regularMarketTime: 1_793_639_880,
              previousClose: 100,
            },
            timestamp: [
              Date.parse("2026-11-02T09:30:00-05:00") / 1000,
              Date.parse("2026-11-02T09:44:00-05:00") / 1000,
            ],
            indicators: {
              quote: [{ high: [102, null], low: [99, 100], close: [101, 102.5] }],
            },
          },
        ],
        error: null,
      },
    });
    expect(parsed.name).toBe("SPDR S&P 500");
    expect(parsed.livePrice).toBe(101.5);
    expect(parsed.previousClose).toBe(100);
    expect(parsed.bars).toHaveLength(2);
    expect(parsed.bars[0]?.high).toBe(102);
    expect(parsed.bars[1]?.high).toBeNull();
    expect(parsed.bars[0]?.t).toBe(Date.parse("2026-11-02T09:30:00-05:00"));
  });

  it("uses the newest premarket or after-hours price", () => {
    const afterHours = parseYahooChart("SPY", {
      chart: {
        result: [
          {
            meta: {
              regularMarketPrice: 100,
              regularMarketTime: 1_700_000_000,
              postMarketPrice: 101.25,
              postMarketTime: 1_700_003_000,
            },
            timestamp: [],
            indicators: { quote: [{ high: [], low: [], close: [] }] },
          },
        ],
      },
    });
    expect(afterHours.livePrice).toBe(101.25);
    expect(afterHours.liveTime).toBe(1_700_003_000_000);

    const regular = parseYahooChart("SPY", {
      chart: {
        result: [
          {
            meta: {
              regularMarketPrice: 101,
              regularMarketTime: 1_700_010_000,
              preMarketPrice: 90,
              preMarketTime: 1_700_000_000,
            },
            timestamp: [],
            indicators: { quote: [{ high: [], low: [], close: [] }] },
          },
        ],
      },
    });
    expect(regular.livePrice).toBe(101);
  });

  it("turns a missing symbol into a readable error", () => {
    expect(() =>
      parseYahooChart("NOPE", {
        chart: { result: null, error: { description: "No data found, symbol may be delisted" } },
      }),
    ).toThrow(/No market data for NOPE/);
  });
});
