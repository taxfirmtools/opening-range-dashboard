import { describe, expect, it } from "vitest";
import { OPENING_LANE_SHARE, daySparkline, plotSession } from "./sparkline";
import type { Bar, SparkPoint } from "./types";

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

  it("gives the opening stretch a readable share of the sparkline", () => {
    const points: SparkPoint[] = [
      ...Array.from({ length: 5 }, (_, index) => ({ price: 10 + index, opening: false })),
      ...Array.from({ length: 4 }, (_, index) => ({ price: 20 + index, opening: true })),
      ...Array.from({ length: 10 }, (_, index) => ({ price: 30 + index, opening: false })),
    ];
    const width = 1_000;
    const plotted = plotSession(points, width, 96, 22);
    expect(plotted.band).not.toBeNull();
    expect(plotted.band?.width).toBeCloseTo(OPENING_LANE_SHARE * width, 5);
    expect(plotted.coords[5]?.x).toBeCloseTo(plotted.band?.x ?? -1, 5);
    expect(plotted.coords[8]?.x).toBeCloseTo((plotted.band?.x ?? 0) + (plotted.band?.width ?? 0), 5);
    expect(plotted.coords[0]?.x).toBe(0);
    expect(plotted.coords.at(-1)?.x).toBe(width);
    expect(plotted.coords[8]!.y).toBeLessThan(plotted.coords[5]!.y);
    expect(plotted.mark).not.toBeNull();
    expect(plotted.levelY).not.toBeNull();
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
