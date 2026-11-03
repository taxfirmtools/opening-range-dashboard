import { describe, expect, it } from "vitest";
import { summarizeThreeDayTrend } from "./levels";

describe("three-day level trend", () => {
  it("uses the last three sessions and replaces today with the live quote", () => {
    const trend = summarizeThreeDayTrend({
      bars: [
        { t: Date.parse("2026-11-02T00:00:00-05:00"), close: 70 },
        { t: Date.parse("2026-11-03T00:00:00-05:00"), close: 72 },
        { t: Date.parse("2026-11-04T00:00:00-05:00"), close: 71 },
        { t: Date.parse("2026-11-05T00:00:00-05:00"), close: 74 },
      ],
      livePrice: 75,
      liveTime: Date.parse("2026-11-05T14:00:00-05:00"),
      now: new Date("2026-11-05T14:00:00-05:00"),
    });

    expect(trend.days.map((day) => day.date)).toEqual(["2026-11-03", "2026-11-04", "2026-11-05"]);
    expect(trend.days.map((day) => day.close)).toEqual([72, 71, 75]);
    expect(trend.last).toBe(75);
    expect(trend.change).toBeCloseTo(3);
    expect(trend.percent).toBeCloseTo((3 / 72) * 100);
  });

  it("does not invent a trend from a single session", () => {
    const trend = summarizeThreeDayTrend({
      bars: [{ t: Date.parse("2026-11-05T00:00:00-05:00"), close: 4.9 }],
      now: new Date("2026-11-05T16:00:00-05:00"),
    });
    expect(trend.last).toBe(4.9);
    expect(trend.change).toBeNull();
    expect(trend.days).toHaveLength(1);
  });
});
