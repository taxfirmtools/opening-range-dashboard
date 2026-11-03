import { MAX_WATCHLIST } from "../config/watchlist";

const SYMBOL = /^[A-Z][A-Z0-9.-]{0,9}$/;

export function normalizeSymbol(raw: string): string | null {
  const symbol = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!SYMBOL.test(symbol)) return null;
  return symbol;
}

export function parseSymbolList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(",") : String(value ?? "");
  const symbols: string[] = [];
  for (const part of raw.split(",")) {
    const symbol = normalizeSymbol(part);
    if (!symbol || symbols.includes(symbol)) continue;
    symbols.push(symbol);
    if (symbols.length >= MAX_WATCHLIST) break;
  }
  return symbols;
}
