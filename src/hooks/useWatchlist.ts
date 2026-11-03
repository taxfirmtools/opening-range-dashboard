import { useEffect, useState } from "react";
import { DEFAULT_WATCHLIST } from "../config/watchlist";
import {
  WATCHLIST_STORAGE_KEY,
  applyWatchlist,
  readStoredWatchlist,
  serializeWatchlist,
} from "../lib/watchlistStorage";

export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>(() => readStoredWatchlist(readRaw()));

  useEffect(() => {
    writeRaw(serializeWatchlist(symbols));
  }, [symbols]);

  function add(raw: string): string | null {
    const next = applyWatchlist(symbols, { type: "add", raw });
    if (!next.error) commit(next.symbols);
    return next.error;
  }

  function remove(symbol: string) {
    commit(applyWatchlist(symbols, { type: "remove", symbol }).symbols);
  }

  function reset() {
    commit(applyWatchlist(symbols, { type: "reset" }).symbols);
  }

  function commit(next: string[]) {
    writeRaw(serializeWatchlist(next));
    setSymbols(next);
  }

  const isDefault =
    symbols.length === DEFAULT_WATCHLIST.length &&
    symbols.every((symbol, index) => symbol === DEFAULT_WATCHLIST[index]);

  return { symbols, add, remove, reset, isDefault };
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(WATCHLIST_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRaw(value: string) {
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, value);
  } catch {
    // Private mode can reject storage. The list still works for this visit.
  }
}
