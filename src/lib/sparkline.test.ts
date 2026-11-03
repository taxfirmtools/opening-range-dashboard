import { describe, expect, it } from "vitest";
import { daySparkline } from "./sparkline";
import type { Bar } from "./types";

function bar(iso: string, close: number): Bar {
  return { t: Date.parse(iso), high: close, low: close, close };
}

describe("day sparkline", () => {
  const bars = [
    bar("2026-11-02T15:59:00-05:00", 50),
    bar("2026-11-03T08:00:00-05:00", 51),
    bar("2026-11-03T09:30:00-05:00", 52),
    bar("2026-11-03T15:59:00-05:00", 54),
    bar("2026-11-03T18:00:00-05:00", 53),
  ];

  it("draws today's prints and ends on a newer live price", () => {
    const line = daySparkline({
      now: new Date("2026-11-03T18:05:00-05:00"),
      bars,
      livePrice: 53.4,
      liveTime: Date.parse("2026-11-03T18:05:00-05:00"),
    });
    expect(line).toEqual([51, 52, 54, 53, 53.4]);
  });

  it("uses the last session on a weekend and skips a weekend print", () => {
    const line = daySparkline({
      now: new Date("2026-11-07T12:00:00-05:00"),
      bars: [
        bar("2026-11-06T09:30:00-05:00", 40),
        bar("2026-11-06T15:59:00-05:00", 41),
        bar("2026-11-07T12:00:00-05:00", 99),
      ],
    });
    expect(line).toEqual([40, 41]);
  });

  it("falls back to the previous session before today's first print", () => {
    const line = daySparkline({
      now: new Date("2026-11-03T03:00:00-05:00"),
      bars: [bar("2026-11-02T10:00:00-05:00", 49), bar("2026-11-02T15:00:00-05:00", 50)],
    });
    expect(line).toEqual([49, 50]);
  });
});