import type { ReactNode } from "react";
import { formatChange, formatPrice } from "../lib/format";
import { plotSession } from "../lib/sparkline";
import { sortQuotes, type SortMode } from "../lib/sort";
import type { Quote, Signal, SparkPoint } from "../lib/types";

export type SignalFilter = "all" | "above" | "below" | "inside";
export type QuoteLayout = "expanded" | "condensed";

interface QuoteTableProps {
  symbols: string[];
  quotes: Quote[] | null;
  sortMode: SortMode;
  filter: SignalFilter;
  layout: QuoteLayout;
  onRemove: (symbol: string) => void;
}

export function QuoteTable({ symbols, quotes, sortMode, filter, layout, onRemove }: QuoteTableProps) {
  if (!quotes) {
    return (
      <TableShell testId="loading-state" busy layout={layout}>
        {symbols.map((symbol) => (
          <SkeletonRow key={symbol} symbol={symbol} layout={layout} />
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
    <TableShell testId="quote-table" layout={layout}>
      {rows.map((row) =>
        row.kind === "loading" ? (
          <SkeletonRow key={row.symbol} symbol={row.symbol} layout={layout} />
        ) : (
          <QuoteRow key={row.quote.symbol} quote={row.quote} layout={layout} onRemove={onRemove} />
        ),
      )}
    </TableShell>
  );
}

function TableShell({
  children,
  testId,
  layout,
  busy = false,
}: {
  children: ReactNode;
  testId: string;
  layout: QuoteLayout;
  busy?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table data-testid={testId} data-layout={layout} aria-busy={busy} className={`layout-${layout}`}>
        <caption className="sr-only">Opening range by symbol</caption>
        <thead>
          <tr>
            <th scope="col">Symbol</th>
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
            <th scope="col" className="spark-col">
              <span className="sr-only">Last 24 hours and point of control</span>
            </th>
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

function QuoteRow({
  quote,
  layout,
  onRemove,
}: {
  quote: Quote;
  layout: QuoteLayout;
  onRemove: (symbol: string) => void;
}) {
  const change = formatChange(quote.last, quote.previousClose);
  const outside = quote.signal === "above" || quote.signal === "below";
  const cells = (
    <>
      <td>
        <span className="symbol">{quote.symbol}</span>
        {quote.name ? <span className="name">{quote.name}</span> : null}
        {quote.error ? <span className="extension">{quote.error}</span> : null}
      </td>
      <td className="num price">{formatPrice(quote.last)}</td>
      <td className={change ? `num chg ${change.direction}` : "num chg flat"}>{change ? change.text : "—"}</td>
      <td className="num">{formatPrice(quote.orHigh)}</td>
      <td className="num">{formatPrice(quote.orLow)}</td>
      <td>
        <RangeTrack quote={quote} />
      </td>
      <td>
        <Sparkline points={quote.sparkline} poc={quote.poc} layout={layout} />
      </td>
      <td>
        <button type="button" className="remove" onClick={() => onRemove(quote.symbol)} aria-label={`Remove ${quote.symbol}`}>
          ×
        </button>
      </td>
    </>
  );
  return (
    <tr data-signal={quote.signal} data-testid={`row-${quote.symbol}`} className={outside ? "is-outside" : undefined}>
      {cells}
    </tr>
  );
}

function SkeletonRow({ symbol, layout }: { symbol: string; layout: QuoteLayout }) {
  const cells = (
    <>
      <td>
        <span className="symbol">{symbol}</span>
        <span className="skeleton name-bar" />
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
        <span className={`skeleton spark-bar spark-bar-${layout}`} />
      </td>
      <td />
    </>
  );
  return (
    <tr className="is-loading" data-testid="loading-row">
      {cells}
    </tr>
  );
}

const CHARTS = {
  expanded: { width: 132, height: 40, ring: 3.6, dot: 2 },
  condensed: { width: 104, height: 28, ring: 3.2, dot: 1.8 },
} as const;

function Sparkline({
  points,
  poc,
  layout,
}: {
  points: SparkPoint[] | undefined;
  poc: number | null;
  layout: QuoteLayout;
}) {
  const values = (points ?? []).filter((point) => Number.isFinite(point.price) && Number.isFinite(point.t));
  const chart = CHARTS[layout];
  const plotted = values.length === 0 ? null : plotSession(values, chart.width, chart.height, poc);
  const label = layout === "expanded" ? "Point of control" : "POC";
  return (
    <div className="spark-cell">
      {plotted && plotted.coords.length >= 2 ? (
        <SparkChart plotted={plotted} layout={layout} />
      ) : (
        <span className={`sparkline sparkline-empty sparkline-${layout}`} aria-hidden="true" />
      )}
      <p className="poc poc-inline" data-testid="poc">
        <span className="poc-label">{label}</span>
        <span className="poc-price">{formatPrice(poc)}</span>
      </p>
    </div>
  );
}

function SparkChart({
  plotted,
  layout,
}: {
  plotted: ReturnType<typeof plotSession>;
  layout: QuoteLayout;
}) {
  const chart = CHARTS[layout];
  const paths = coloredPaths(plotted.coords);
  return (
    <svg
      className={`sparkline sparkline-${layout}`}
      viewBox={`0 0 ${chart.width} ${chart.height}`}
      width={chart.width}
      height={chart.height}
      aria-hidden="true"
    >
      {plotted.band ? (
        <rect className="spark-open-band" x={plotted.band.x} y={0} width={plotted.band.width} height={chart.height} />
      ) : null}
      {plotted.level ? (
        <line className="poc-level" x1={plotted.level.x1} x2={plotted.level.x2} y1={plotted.level.y} y2={plotted.level.y} />
      ) : null}
      {paths.map((path) => (
        <path key={path.key} className={path.opening ? "spark-open" : "spark-rest"} d={path.d} />
      ))}
      {plotted.mark ? (
        <>
          <circle className="poc-mark-ring" cx={plotted.mark.x} cy={plotted.mark.y} r={chart.ring} />
          <circle className="poc-mark" cx={plotted.mark.x} cy={plotted.mark.y} r={chart.dot} />
        </>
      ) : null}
    </svg>
  );
}

function coloredPaths(coords: Array<{ x: number; y: number; opening: boolean }>) {
  const paths: Array<{ key: string; opening: boolean; d: string }> = [];
  let start = 0;
  for (let index = 1; index <= coords.length; index += 1) {
    const next = coords[index];
    if (next != null && next.opening === coords[index - 1].opening) continue;
    const draw = start > 0 ? [coords[start - 1], ...coords.slice(start, index)] : coords.slice(start, index);
    if (draw.length >= 2) {
      paths.push({
        key: `${start}-${index}`,
        opening: coords[start].opening,
        d: draw.map((point, i) => `${i === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" "),
      });
    }
    start = index;
  }
  return paths;
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
