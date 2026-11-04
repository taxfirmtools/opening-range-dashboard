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
      volume: finite(quote?.volume?.[i]),
    });
  }

  const meta = result.meta ?? {};
  const live = latestExtendedPrice(meta);
  return {
    name: typeof meta.shortName === "string" ? meta.shortName : null,
    bars,
    livePrice: live.price,
    liveTime: live.time,
    previousClose: finite(meta.previousClose) ?? finite(meta.chartPreviousClose),
  };
}

function latestExtendedPrice(meta: YahooMeta): { price: number | null; time: number | null } {
  const points = [
    { price: finite(meta.regularMarketPrice), time: stampMs(meta.regularMarketTime) },
    { price: finite(meta.preMarketPrice), time: stampMs(meta.preMarketTime) },
    { price: finite(meta.postMarketPrice), time: stampMs(meta.postMarketTime) },
  ].filter((point): point is { price: number; time: number | null } => point.price != null);
  if (points.length === 0) return { price: null, time: null };
  points.sort((a, b) => (a.time ?? -1) - (b.time ?? -1));
  const latest = points[points.length - 1];
  return { price: latest.price, time: latest.time };
}

function stampMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value < 1e12 ? value * 1000 : value;
}

function friendlyYahooError(symbol: string, description: string): string {
  if (/not found|delisted|no data/i.test(description)) return `No market data for ${symbol}`;
  return description;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

interface YahooMeta {
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  preMarketPrice?: number;
  preMarketTime?: number;
  postMarketPrice?: number;
  postMarketTime?: number;
  previousClose?: number;
  chartPreviousClose?: number;
}

interface YahooChart {
  result?: Array<{
    meta?: YahooMeta;
    timestamp?: number[];
    indicators?: {
      quote?: Array<{
        high?: Array<number | null>;
        low?: Array<number | null>;
        close?: Array<number | null>;
        volume?: Array<number | null>;
      }>;
    };
  }> | null;
  error?: { code?: string; description?: string } | null;
}
