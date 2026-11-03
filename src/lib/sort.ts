import type { Quote, Signal } from "./types";

const SIGNAL_RANK: Record<Signal, number> = {
  above: 0,
  below: 1,
  inside: 2,
  forming: 3,
  unavailable: 4,
};

export type SortMode = "breakouts" | "list";

export function extensionSize(quote: Quote): number {
  if (quote.last == null || quote.orHigh == null || quote.orLow == null) return 0;
  if (quote.last > quote.orHigh) return quote.last - quote.orHigh;
  if (quote.last < quote.orLow) return quote.orLow - quote.last;
  return 0;
}

export function sortQuotes(quotes: Quote[], mode: SortMode, listOrder: string[]): Quote[] {
  const index = new Map(listOrder.map((symbol, position) => [symbol, position]));
  const listRank = (symbol: string) => index.get(symbol) ?? listOrder.length;
  return [...quotes].sort((a, b) => {
    if (mode === "breakouts") {
      const bySignal = SIGNAL_RANK[a.signal] - SIGNAL_RANK[b.signal];
      if (bySignal !== 0) return bySignal;
      const byExtension = extensionSize(b) - extensionSize(a);
      if (byExtension !== 0) return byExtension;
    }
    return listRank(a.symbol) - listRank(b.symbol);
  });
}
