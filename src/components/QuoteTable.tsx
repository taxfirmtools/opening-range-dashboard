import type { ReactNode } from "react";
import { extensionText, formatChange, formatPrice, signalLabel } from "../lib/format";
import { sortQuotes, type SortMode } from "../lib/sort";
import type { Quote, Signal } from "../lib/types";

export type SignalFilter = "all" | "above" | "below" | "inside";

interface QuoteTableProps {
  symbols: string[];
  quotes: Quote[] | null;
  sortMode: SortMode;
  filter: SignalFilter;
  onRemove: (symbol: string) => void;
}

export function QuoteTable({ symbols, quotes, sortMode, filter, onRemove }: QuoteTableProps) {
  if (!quotes) {
    return (
      <TableShell testId="loading-state" busy>
        {symbols.map((symbol) => (
          <SkeletonRow key={symbol} symbol={symbol} />
        ))}
      </TableShell>
    );
  }

  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const ready = symbols.flatMap((symbol) => {
    const quote = bySymbol.get(symbol);
    return quote ? [quote] : [];
  });
  const filtered = ready.filter((quote) => matchesFilter(quote.signal, filter));
  const sorted = sortQuotes(filtered, sortMode, symbols);
  const pending =
    filter === "all" ? symbols.filter((symbol) => !bySymbol.has(symbol)) : [];

  if (sorted.length === 0 && pending.length === 0) {
    return (
      <div className="filter-empty" data-testid="filter-empty">
        <p>{emptyFilterCopy(filter)}</p>
      </div>
    );
  }

  const rows = [
    ...sorted.map((quote) => ({ kind: "quote" as const, quote })),
    ...pending.map((symbol) => ({ kind: "loading" as const, symbol })),
  ];

  return (
    <TableShell testId="quote-table">
      {rows.map((row) =>
        row.kind === "loading" ? (
          <SkeletonRow key={row.symbol} symbol={row.symbol} />
        ) : (
          <QuoteRow key={row.quote.symbol} quote={row.quote} onRemove={onRemove} />
        ),
      )}
    </TableShell>
  );
}

function TableShell({
  children,
  testId,
  busy = false,
}: {
  children: ReactNode;
  testId: string;
  busy?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table data-testid={testId} aria-busy={busy}>
        <caption className="sr-only">Opening range by symbol</caption>
        <thead>
          <tr>
            <th scope="col">Symbol</th>
            <th scope="col" className="spark-col">
              <span className="sr-only">Today</span>
            </th>
            <th scope="col" className="num">
              Last
            </th>
            <th scope="col" className="num">
              Day
            </th>
            <th scope="col" className="num">
              OR high
            </th>
            <th scope="col" className="num">
              OR low
            </th>
            <th scope="col" className="track-col">
              Versus range
            </th>
            <th scope="col">Signal</th>
            <th scope="col">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function QuoteRow({ quote, onRemove }: { quote: Quote; onRemove: (symbol: string) => void }) {
  const change = formatChange(quote.last, quote.previousClose);
  const outside = quote.signal === "above" || quote.signal === "below";
  return (
    <tr data-signal={quote.signal} data-testid={`row-${quote.symbol}`} className={outside ? "is-outside" : undefined}>
      <td>
        <span className="symbol">{quote.symbol}</span>
        {quote.name ? <span className="name">{quote.name}</span> : null}
      </td>
      <td>
        <Sparkline points={quote.sparkline} />
      </td>
      <td className="num price">{formatPrice(quote.last)}</td>
      <td className={change ? `num chg ${change.direction}` : "num chg flat"}>{change ? change.text : "—"}</td>
      <td className="num">{formatPrice(quote.orHigh)}</td>
      <td className="num">{formatPrice(quote.orLow)}</td>
      <td>
        <RangeTrack quote={quote} />
      </td>
      <td>
        <span className={`pill ${quote.signal}`} data-testid={`signal-${quote.symbol}`}>
          {signalLabel(quote.signal)}
        </span>
        <span className="extension">{extensionText(quote)}</span>
      </td>
      <td>
        <button type="button" className="remove" onClick={() => onRemove(quote.symbol)} aria-label={`Remove ${quote.symbol}`}>
          ×
        </button>
      </td>
    </tr>
  );
}

function SkeletonRow({ symbol }: { symbol: string }) {
  return (
    <tr className="is-loading" data-testid="loading-row">
      <td>
        <span className="symbol">{symbol}</span>
        <span className="skeleton name-bar" />
      </td>
      <td>
        <span className="skeleton spark-bar" />
      </td>
      <td className="num">
        <span className="skeleton price-bar" />
      </td>
      <td className="num">
        <span className="skeleton change-bar" />
      </td>
      <td className="num">
        <span className="skeleton price-bar" />
      </td>
      <td className="num">
        <span className="skeleton price-bar" />
      </td>
      <td>
        <span className="skeleton track-bar" />
      </td>
      <td>
        <span className="skeleton pill-bar" />
      </td>
      <td />
    </tr>
  );
}

function Sparkline({ points }: { points: number[] | undefined }) {
  const values = (points ?? []).filter((value) => Number.isFinite(value));
  if (values.length < 2) return <span className="sparkline sparkline-empty" aria-hidden="true" />;
  const width = 84;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = 2;
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = span === 0 ? height / 2 : pad + (1 - (value - min) / span) * (height - pad * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function RangeTrack({ quote }: { quote: Quote }) {
  const { orLow, orHigh, last, signal } = quote;
  if (orLow == null || orHigh == null || last == null || !(orHigh > orLow)) {
    return <span className="muted">—</span>;
  }
  const pad = Math.max(orHigh - orLow, Math.abs(last - orHigh), Math.abs(orLow - last)) * 0.2;
  const min = Math.min(orLow, last) - pad;
  const max = Math.max(orHigh, last) + pad;
  const width = max - min || 1;
  const pct = (value: number) => ((value - min) / width) * 100;
  const left = pct(orLow);
  const band = Math.max(pct(orHigh) - left, 2);
  return (
    <div className="track" aria-hidden="true">
      <div className="track-base" />
      <div className="track-range" style={{ left: `${left}%`, width: `${band}%` }} />
      <div className={`track-mark ${signal}`} style={{ left: `${pct(last)}%` }} />
    </div>
  );
}

function matchesFilter(signal: Signal, filter: SignalFilter): boolean {
  if (filter === "all") return true;
  return signal === filter;
}

function emptyFilterCopy(filter: SignalFilter): string {
  if (filter === "above") return "No names are above the range.";
  if (filter === "below") return "No names are below the range.";
  if (filter === "inside") return "No names are still inside the range.";
  return "Nothing to show.";
}
