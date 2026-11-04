import { parseYahooChart } from "../src/lib/yahooParse";
import type { BarsProvider, SymbolBars } from "../src/lib/types";

/** Shorter than the 10-second client poll so each refresh gets a new quote. */
const TTL_MS = 8_000;
const USER_AGENT = "Mozilla/5.0 (compatible; OpeningRangeDashboard/1.0)";

const cache = new Map<string, { expires: number; value: SymbolBars }>();
const inflight = new Map<string, Promise<SymbolBars>>();
const chartCache = new Map<string, { expires: number; value: unknown }>();
const chartInflight = new Map<string, Promise<unknown>>();

export const yahooProvider: BarsProvider = {
  id: "yahoo",
  label: "Yahoo Finance",
  delayed: true,
  getSymbol(symbol: string, options?: { fresh?: boolean }) {
    const fresh = options?.fresh === true;
    if (!fresh) {
      const cached = cache.get(symbol);
      if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
    }
    const pending = inflight.get(symbol);
    if (pending) return pending;
    const request = fetchSymbol(symbol, fresh)
      .then((value) => {
        cache.set(symbol, { expires: Date.now() + TTL_MS, value });
        return value;
      })
      .finally(() => {
        inflight.delete(symbol);
      });
    inflight.set(symbol, request);
    return request;
  },
};

async function fetchSymbol(symbol: string, fresh = false): Promise<SymbolBars> {
  const payload = await fetchYahooChart(symbol, "interval=1m&range=5d&includePrePost=true", { fresh });
  return parseYahooChart(symbol, payload);
}

/** Yahoo chart JSON. `includePrePost=true` keeps premarket and after-hours prints. */
export async function fetchYahooChart(
  symbol: string,
  query: string,
  options?: { fresh?: boolean },
): Promise<unknown> {
  const key = `${symbol}?${query}`;
  if (!options?.fresh) {
    const cached = chartCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
  }
  const pending = chartInflight.get(key);
  if (pending) return pending;
  const request = requestChart(symbol, query)
    .then((value) => {
      chartCache.set(key, { expires: Date.now() + TTL_MS, value });
      return value;
    })
    .finally(() => {
      chartInflight.delete(key);
    });
  chartInflight.set(key, request);
  return request;
}

async function requestChart(symbol: string, query: string): Promise<unknown> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new Error(`Could not reach Yahoo Finance for ${symbol}`);
  }
  if (response.status === 404) throw new Error(`No market data for ${symbol}`);
  if (response.status === 429) throw new Error(`Yahoo Finance is busy for ${symbol}. Try again in a moment.`);
  if (!response.ok) throw new Error(`Yahoo Finance returned ${response.status} for ${symbol}`);
  return response.json();
}
