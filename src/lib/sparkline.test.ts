import { describe, expect, it } from "vitest";
import { daySparkline, plotSession } from "./sparkline";
import { nyTimestamp } from "./time";
import type { Bar, SparkPoint } from "./types";

function point(ymd: string, minutes: number, price: number, opening: boolean): SparkPoint {
  return { t: nyTimestamp(ymd, minutes), price, high: price + 0.4, low: price - 0.4, opening };
}

function bar(iso: string, close: number, volume = 0, high = close, low = close): Bar {
  return { t: Date.parse(iso), high, low, close, volume };
}

describe("day sparkline", () => {
  const bars = [
    bar("2026-11-02T15:59:00-05:00", 50, 10),
    bar("2026-11-03T08:00:00-05:00", 51, 10),
    bar("2026-11-03T09:30:00-05:00", 52, 10),
    bar("2026-11-03T15:59:00-05:00", 54, 10),
    bar("2026-11-03T18:00:00-05:00", 53, 80),
  ];

  it("draws today's prints and ends on a newer live price", () => {
    const line = daySparkline({
      now: new Date("2026-11-03T18:05:00-05:00"),
      bars,
      livePrice: 53.4,
      liveTime: Date.parse("2026-11-03T18:05:00-05:00"),
    });
    expect(line.points.map((point) => point.price)).toEqual([51, 52, 54, 53, 53.4]);
    expect(line.points.map((point) => point.opening)).toEqual([false, true, false, false, false]);
    expect(line.poc).toBe(53);
  });

  it("keeps the last 24 hours through the latest print and skips a future bar", () => {
    const line = daySparkline({
      now: new Date("2026-11-03T18:05:00-05:00"),
      bars: [
        bar("2026-11-02T10:00:00-05:00", 1, 1),
        ...bars,
        bar("2026-11-03T19:00:00-05:00", 99, 1),
      ],
      livePrice: 53.4,
      liveTime: Date.parse("2026-11-03T18:05:00-05:00"),
    });
    expect(line.points.map((point) => point.price)).toEqual([51, 52, 54, 53, 53.4]);
    expect(line.points.some((point) => point.price === 99 || point.price === 1)).toBe(false);
  });

  it("uses Friday's point of control on a weekend", () => {
    const line = daySparkline({
      now: new Date("2026-11-07T12:00:00-05:00"),
      bars: [
        bar("2026-11-06T09:30:00-05:00", 40, 5),
        bar("2026-11-06T15:59:00-05:00", 41, 9),
        bar("2026-11-07T12:00:00-05:00", 99, 100),
      ],
    });
    expect(line.points.map((point) => point.price)).toEqual([41, 99]);
    expect(line.poc).toBe(41);
  });

  it("falls back to the previous session before today's first print", () => {
    const line = daySparkline({
      now: new Date("2026-11-03T03:00:00-05:00"),
      bars: [bar("2026-11-02T10:00:00-05:00", 49, 3), bar("2026-11-02T15:00:00-05:00", 50, 4)],
    });
    expect(line.points.map((point) => point.price)).toEqual([49, 50]);
    expect(line.poc).toBe(50);
  });

  it("colors only 9:30 through 9:44 and ignores premarket volume", () => {
    const line = daySparkline({
      now: new Date("2026-11-03T16:00:00-05:00"),
      bars: [
        bar("2026-11-03T08:00:00-05:00", 40, 50_000),
        bar("2026-11-03T09:30:00-05:00", 52, 100),
        bar("2026-11-03T09:44:00-05:00", 52.5, 100),
        bar("2026-11-03T09:45:00-05:00", 53, 100),
        bar("2026-11-03T11:00:00-05:00", 55, 5_000),
        bar("2026-11-03T15:59:00-05:00", 54, 200),
      ],
      livePrice: 54.2,
      liveTime: Date.parse("2026-11-03T16:00:00-05:00"),
    });
    expect(line.points.map((point) => point.price)).toEqual([40, 52, 52.5, 53, 55, 54, 54.2]);
    expect(line.points.map((point) => point.opening)).toEqual([false, true, true, false, false, false, false]);
    expect(line.poc).toBe(55);
  });

  it("spreads a bar's volume across its high-low range", () => {
    const line = daySparkline({
      now: new Date("2026-11-03T12:00:00-05:00"),
      bars: [
        bar("2026-11-03T10:00:00-05:00", 10.01, 300, 10.02, 10),
        bar("2026-11-03T10:01:00-05:00", 10, 150),
      ],
    });
    expect(line.poc).toBe(10);
  });

  it("puts the opening highlight on the right just after the open, then moves it left", () => {
    const width = 1_440;
    const early = plotSession(
      [
        point("2026-11-02", 10 * 60, 90, false),
        point("2026-11-03", 9 * 60 + 30, 100, true),
        point("2026-11-03", 9 * 60 + 44, 101, true),
        point("2026-11-03", 9 * 60 + 50, 102, false),
      ],
      width,
      40,
      null,
    );
    const later = plotSession(
      [
        point("2026-11-02", 16 * 60, 90, false),
        point("2026-11-03", 9 * 60 + 30, 100, true),
        point("2026-11-03", 9 * 60 + 44, 101, true),
        point("2026-11-03", 16 * 60, 110, false),
      ],
      width,
      40,
      null,
    );
    expect(early.coords.at(-1)?.x).toBeCloseTo(width, 5);
    expect(early.band!.x).toBeGreaterThan(width * 0.9);
    expect(later.band!.x).toBeLessThan(early.band!.x);
    expect(later.coords.at(-1)?.x).toBeCloseTo(width, 5);
    expect(later.coords.at(-1)!.t).toBeLessThan(nyTimestamp("2026-11-03", 16 * 60) + 60_000);
  });

  it("scales the height to the high and low of the window", () => {
    const plotted = plotSession(
      [
        { t: nyTimestamp("2026-11-03", 10 * 60), price: 100, high: 110, low: 99, opening: false },
        { t: nyTimestamp("2026-11-03", 12 * 60), price: 90, high: 91, low: 80, opening: false },
      ],
      120,
      40,
      null,
    );
    expect(plotted.coords[0]!.y).toBeLessThan(6);
    expect(plotted.coords[1]!.y).toBeGreaterThan(34);
  });

  it("keeps a short-chart opening mark on the right edge in the morning", () => {
    const plotted = plotSession(
      [
        point("2026-11-02", 10 * 60, 90, false),
        point("2026-11-03", 9 * 60 + 30, 100, true),
        point("2026-11-03", 9 * 60 + 44, 101, true),
        point("2026-11-03", 9 * 60 + 50, 102, false),
      ],
      132,
      40,
      null,
    );
    expect(plotted.band!.width).toBeGreaterThanOrEqual(6);
    expect(plotted.band!.x + plotted.band!.width).toBeCloseTo(132, 5);
    expect(plotted.coords.at(-1)?.x).toBeCloseTo(132, 5);
  });

  it("has no point of control before the open", () => {
    const line = daySparkline({
      now: new Date("2026-11-03T08:30:00-05:00"),
      bars: [bar("2026-11-03T08:00:00-05:00", 40, 50_000)],
    });
    expect(line.points.map((point) => point.price)).toEqual([40]);
    expect(line.poc).toBeNull();
  });
});
