import { summarizeThreeDayTrend, type LevelsSnapshot, type MarketLevel } from "../src/lib/levels";
import { fetchYahooChart } from "./yahoo";
import { parseYahooChart } from "../src/lib/yahooParse";

const SPECS: Array<Pick<MarketLevel, "id" | "label" | "symbol" | "unit">> = [
  { id: "oil", label: "Oil", symbol: "CL=F", unit: "usd" },
  { id: "yield10y", label: "10-year Treasury", symbol: "^TNX", unit: "percent" },
];

const DAILY_QUERY = "interval=1d&range=1mo&includePrePost=true";

export async function loadMarketLevels(
  now = new Date(),
  options?: { fresh?: boolean },
): Promise<LevelsSnapshot> {
  const levels = await Promise.all(SPECS.map((spec) => loadOne(spec, now, options?.fresh === true)));
  return { source: "yahoo", asOf: now.toISOString(), levels };
}

async function loadOne(
  spec: Pick<MarketLevel, "id" | "label" | "symbol" | "unit">,
  now: Date,
  fresh: boolean,
): Promise<MarketLevel> {
  try {
    const payload = await fetchYahooChart(spec.symbol, DAILY_QUERY, { fresh });
    const parsed = parseYahooChart(spec.symbol, payload);
    const trend = summarizeThreeDayTrend({
      bars: parsed.bars,
      livePrice: parsed.livePrice,
      liveTime: parsed.liveTime,
      now,
    });
    return { ...spec, ...trend };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quote unavailable";
    return { ...spec, last: null, change: null, percent: null, days: [], error: message };
  }
}
