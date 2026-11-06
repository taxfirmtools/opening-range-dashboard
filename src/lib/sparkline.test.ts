import { describe, expect, it } from "vitest";
import { daySparkline, plotSession } from "./sparkline";
import { nyTimestamp } from "./time";
import type { Bar, SparkPoint } from "./types";

function point(ymd: string, minutes: number, price: number, opening: boolean): SparkPoint {
  return { t: nyTimestamp(ymd, minutes), price, high: price + 0.4, low: price - 0.4, opening };
}

function sessionMinutes(ymd: string, from: number, to: number): SparkPoint[] {
  const points: SparkPoint[] = [];
  for (let minutes = from; minutes <= to; minutes += 1) {
    const opening = minutes >= 9 * 60 + 30 && minutes < 9 * 60 + 45;
    points.push(point(ymd, minutes, 100 + (minutes - from) * 0.05, opening));
  }
  return points;
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

  it("uses the last session on a weekend and skips a weekend print", () => {
    const line = daySparkline({
      now: new Date("2026-11-07T12:00:00-05:00"),
      bars: [
        bar("2026-11-06T09:30:00-05:00", 40, 5),
        bar("2026-11-06T15:59:00-05:00", 41, 9),
        bar("2026-11-07T12:00:00-05:00", 99, 100),
      ],
    });
    expect(line.points.map((point) => point.price)).toEqual([40, 41]);
    expect(line.points.map((point) => point.opening)).toEqual([true, false]);
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

  it("stops the morning line at the latest print instead of filling the day", () => {
    const points = sessionMinutes("2026-11-03", 9 * 60 + 30, 9 * 60 + 40);
    const width = 390;
    const plotted = plotSession(points, width, 96, points[5]?.price ?? null);
    const last = plotted.coords.at(-1);
    expect(last).toBeDefined();
    expect(plotted.coords.every((point) => point.opening)).toBe(true);
    expect(last?.x).toBeCloseTo((10 / 390) * width, 5);
    expect(last?.x).toBeLessThan(width * 0.1);
    expect(plotted.band?.x).toBe(0);
    expect(plotted.band?.width).toBeCloseTo((11 / 390) * width, 5);
    expect(plotted.level?.x2).toBe(last?.x);
    expect(plotted.coords[10]!.y).toBeLessThan(plotted.coords[0]!.y);
  });

  it("keeps each minute the same width through the open and after it", () => {
    const points = sessionMinutes("2026-11-03", 9 * 60 + 30, 10 * 60 + 15);
    const width = 390;
    const plotted = plotSession(points, width, 96, null);
    const atOpen = plotted.coords[0]!;
    const at945 = plotted.coords[15]!;
    const at1015 = plotted.coords.at(-1)!;
    expect(at945.x - atOpen.x).toBeCloseTo((15 / 390) * width, 5);
    expect(at1015.x - at945.x).toBeCloseTo((30 / 390) * width, 5);
    expect(at1015.x).toBeLessThan(width * 0.2);
    expect(plotted.band?.width).toBeCloseTo((15 / 390) * width, 5);
  });

  it("drops premarket prints and reaches the right edge only when the session has", () => {
    const premarket = point("2026-11-03", 8 * 60, 40, false);
    const close = point("2026-11-03", 15 * 60 + 59, 55, false);
    const plotted = plotSession(
      [premarket, ...sessionMinutes("2026-11-03", 9 * 60 + 30, 9 * 60 + 31), close],
      390,
      96,
      null,
    );
    expect(plotted.coords[0]?.price).toBe(sessionMinutes("2026-11-03", 9 * 60 + 30, 9 * 60 + 30)[0]?.price);
    expect(plotted.coords.at(-1)?.x).toBeCloseTo((389 / 390) * 390, 5);
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
