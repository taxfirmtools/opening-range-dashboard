import type { Bar, SymbolBars } from "./types";

export function parseYahooChart(symbol: string, payload: unknown): SymbolBars {
  if (!payload || typeof payload !== "object") {
    throw new Error(`Unexpected response for ${symbol}`);
  }
  const chart = (payload as { chart?: YahooChart }).chart;
  if (!chart) throw new Error(`Unexpected response for ${symbol}`);
  if (chart.error) {
    const description = chart.error.description || chart.error.code || "No data";
    throw new Error(friendlyYahooError(symbol, description));
  }
  const result = chart.result?.[0];
  if (!result) throw new Error(`No market data for ${symbol}`);

  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  const bars: Bar[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const stamp = timestamps[i];
    if (typeof stamp !== "number") continue;
    bars.push({
      t: stamp < 1e12 ? stamp * 1000 : stamp,
      high: finite(quote?.high?.[i]),
      low: finite(quote?.low?.[i]),
      close: finite(quote?.close?.[i]),
    });
  }

  const meta = result.meta ?? {};
  const liveTime = typeof meta.regularMarketTime === "number" ? meta.regularMarketTime * 1000 : null;
  return {
    name: typeof meta.shortName === "string" ? meta.shortName : null,
    bars,
    livePrice: finite(meta.regularMarketPrice),
    liveTime,
    previousClose: finite(meta.previousClose),
  };
}

function friendlyYahooError(symbol: string, description: string): string {
  if (/not found|delisted|no data/i.test(description)) return `No market data for ${symbol}`;
  return description;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

interface YahooChart {
  result?: Array<{
    meta?: {
      shortName?: string;
      regularMarketPrice?: number;
      regularMarketTime?: number;
      previousClose?: number;
    };
    timestamp?: number[];
    indicators?: {
      quote?: Array<{
        high?: Array<number | null>;
        low?: Array<number | null>;
        close?: Array<number | null>;
      }>;
    };
  }> | null;
  error?: { code?: string; description?: string } | null;
}
