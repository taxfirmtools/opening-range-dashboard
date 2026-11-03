import { useEffect, useState } from "react";
import { DEFAULT_WATCHLIST, MAX_WATCHLIST } from "../config/watchlist";
import { normalizeSymbol } from "../lib/symbols";

const STORAGE_KEY = "opening-range-watchlist";

export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>(readWatchlist);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
    } catch {
      // Private mode can reject storage. The list still works for this visit.
    }
  }, [symbols]);

  function add(raw: string): string | null {
    const symbol = normalizeSymbol(raw);
    if (!symbol) return "Enter a ticker like AAPL";
    if (symbols.includes(symbol)) return `${symbol} is already on the list`;
    if (symbols.length >= MAX_WATCHLIST) return `The list holds ${MAX_WATCHLIST} symbols`;
    setSymbols((current) => [...current, symbol]);
    return null;
  }

  function remove(symbol: string) {
    setSymbols((current) => current.filter((item) => item !== symbol));
  }

  function reset() {
    setSymbols([...DEFAULT_WATCHLIST]);
  }

  const isDefault =
    symbols.length === DEFAULT_WATCHLIST.length &&
    symbols.every((symbol, index) => symbol === DEFAULT_WATCHLIST[index]);

  return { symbols, add, remove, reset, isDefault };
}

function readWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_WATCHLIST];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_WATCHLIST];
    const symbols: string[] = [];
    for (const item of parsed) {
      const symbol = normalizeSymbol(String(item));
      if (!symbol || symbols.includes(symbol)) continue;
      symbols.push(symbol);
      if (symbols.length >= MAX_WATCHLIST) break;
    }
    return symbols;
  } catch {
    return [...DEFAULT_WATCHLIST];
  }
}
