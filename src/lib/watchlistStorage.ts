import { DEFAULT_WATCHLIST, MAX_WATCHLIST } from "../config/watchlist";
import { normalizeSymbol } from "./symbols";

/** Survives refresh and signing in again. This is not the login cookie. */
export const WATCHLIST_STORAGE_KEY = "opening-range-watchlist";

export type WatchlistEdit =
  | { type: "add"; raw: string }
  | { type: "remove"; symbol: string }
  | { type: "reset" };

export function readStoredWatchlist(raw: string | null): string[] {
  if (!raw) return [...DEFAULT_WATCHLIST];
  try {
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

export function serializeWatchlist(symbols: readonly string[]): string {
  return JSON.stringify(symbols);
}

export function applyWatchlist(
  symbols: readonly string[],
  edit: WatchlistEdit,
): { symbols: string[]; error: string | null } {
  if (edit.type === "reset") return { symbols: [...DEFAULT_WATCHLIST], error: null };
  if (edit.type === "remove") {
    return { symbols: symbols.filter((symbol) => symbol !== edit.symbol), error: null };
  }
  const symbol = normalizeSymbol(edit.raw);
  if (!symbol) return { symbols: [...symbols], error: "Enter a ticker like AAPL" };
  if (symbols.includes(symbol)) return { symbols: [...symbols], error: `${symbol} is already on the list` };
  if (symbols.length >= MAX_WATCHLIST) {
    return { symbols: [...symbols], error: `The list holds ${MAX_WATCHLIST} symbols` };
  }
  return { symbols: [...symbols, symbol], error: null };
}
