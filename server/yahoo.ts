import { parseYahooChart } from "../src/lib/yahooParse";
import type { BarsProvider, SymbolBars } from "../src/lib/types";

const TTL_MS = 15_000;
const USER_AGENT = "Mozilla/5.0 (compatible; OpeningRangeDashboard/1.0)";

const cache = new Map<string, { expires: number; value: SymbolBars }>();
const inflight = new Map<string, Promise<SymbolBars>>();

export const yahooProvider: BarsProvider = {
  id: "yahoo",
  label: "Yahoo Finance",
  delayed: true,
  getSymbol(symbol: string) {
    const cached = cache.get(symbol);
    if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
    const pending = inflight.get(symbol);
    if (pending) return pending;
    const request = fetchSymbol(symbol)
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

async function fetchSymbol(symbol: string): Promise<SymbolBars> {
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    `${encodeURIComponent(symbol)}?interval=1m&range=5d&includePrePost=false`;
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
  const payload: unknown = await response.json();
  return parseYahooChart(symbol, payload);
}
