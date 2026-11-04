import { useEffect, useState, type FormEvent } from "react";
import { formatEtClock, formatSessionDay } from "../lib/format";
import { describeSession, statusHint } from "../lib/session";
import type { SortMode } from "../lib/sort";
import type { Quote, SessionInfo } from "../lib/types";
import { useQuotes } from "../hooks/useQuotes";
import { useWatchlist } from "../hooks/useWatchlist";
import { MarketLevels } from "./MarketLevels";
import { QuoteTable, type SignalFilter } from "./QuoteTable";

export function Dashboard() {
  const watchlist = useWatchlist();
  const [sortMode, setSortMode] = useStoredState<SortMode>("opening-range-sort", "breakouts", [
    "breakouts",
    "list",
  ]);
  const [filter, setFilter] = useState<SignalFilter>("all");
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [levelRefresh, setLevelRefresh] = useState(0);
  const { snapshot, error, stale, refreshing, reload } = useQuotes(watchlist.symbols);

  function refreshNow() {
    reload();
    setLevelRefresh((value) => value + 1);
  }

  useEffect(() => {
    try {
      localStorage.removeItem("opening-range-mode");
      localStorage.removeItem("opening-range-scenario");
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const view = snapshot?.source === "yahoo" ? snapshot : null;
  const listedQuotes = view
    ? view.quotes.filter((quote) => watchlist.symbols.includes(quote.symbol))
    : null;
  const quotesForTable =
    listedQuotes == null || (listedQuotes.length === 0 && watchlist.symbols.length > 0) ? null : listedQuotes;
  const session = view ? view.session : describeSession(new Date());
  const activeFilter = session.phase === "forming" ? "all" : filter;

  useEffect(() => {
    const outside =
      quotesForTable?.filter((quote) => quote.signal === "above" || quote.signal === "below").length ?? 0;
    document.title = outside > 0 ? `${outside} outside · Piper Terminal` : "Piper Terminal";
  }, [quotesForTable]);

  function submitSymbol(event: FormEvent) {
    event.preventDefault();
    const message = watchlist.add(draft);
    setAddError(message);
    if (!message) setDraft("");
  }

  return (
    <div className="page">
      <header className="top">
        <div className="brand">
          <Logo />
          <div>
            <h1>Piper Terminal</h1>
            <p className="lede">
              High and low from 9:30 to 9:45am Eastern. Names trading outside that band are highlighted.
            </p>
          </div>
        </div>
        <div className="status-block">
          <MarketClock />
          <p className="session" data-testid="session-status">
            <span className={`status-dot ${session.phase}`} />
            {session.sessionStatus}
            <span className="session-date"> · {formatSessionDay(session.sessionDate)}</span>
          </p>
          <p className="hint">{statusHint(session, new Date())}</p>
        </div>
      </header>

      {stale && view ? (
        <p className="banner warn" role="status">
          Couldn’t refresh. Showing the last prices from {formatEtClock(new Date(view.asOf))}.{" "}
          <button type="button" className="text-button" onClick={reload}>
            Try again
          </button>
        </p>
      ) : null}

      <div className="toolbar">
        <Stats
          quotes={quotesForTable}
          phase={session.phase}
          filter={activeFilter}
          onFilter={setFilter}
          ready={quotesForTable != null}
        />
        <div className="toolbar-actions">
          <button type="button" className="btn" onClick={refreshNow} disabled={refreshing} data-testid="refresh">
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <div className="segment" role="group" aria-label="Sort">
            <button type="button" aria-pressed={sortMode === "breakouts"} onClick={() => setSortMode("breakouts")}>
              Breakouts first
            </button>
            <button type="button" aria-pressed={sortMode === "list"} onClick={() => setSortMode("list")}>
              List order
            </button>
          </div>
          <form className="add-form" onSubmit={submitSymbol}>
            <label className="sr-only" htmlFor="add-symbol">
              Add symbol
            </label>
            <input
              id="add-symbol"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value.toUpperCase());
                if (addError) setAddError(null);
              }}
              placeholder="Add ticker"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={10}
              aria-invalid={addError ? true : undefined}
              aria-describedby={addError ? "add-symbol-error" : undefined}
            />
            <button type="submit" className="btn primary">
              Add
            </button>
          </form>
          {watchlist.isDefault ? null : (
            <button type="button" className="btn" onClick={watchlist.reset}>
              Reset list
            </button>
          )}
        </div>
      </div>
      {addError ? (
        <p id="add-symbol-error" className="form-error" role="alert">
          {addError}
        </p>
      ) : null}

      <section className="panel" aria-live="polite">
        {watchlist.symbols.length === 0 ? (
          <EmptyState onReset={watchlist.reset} />
        ) : !view && error ? (
          <FeedError message={error} onRetry={reload} />
        ) : (
          <QuoteTable
            symbols={watchlist.symbols}
            quotes={quotesForTable}
            sortMode={sortMode}
            filter={activeFilter}
            onRemove={watchlist.remove}
          />
        )}
        <MarketLevels refreshToken={levelRefresh} />
        <footer className="panel-foot">
          Yahoo Finance, unofficial and sometimes delayed. Refreshes about every 10 seconds, or when you choose Refresh.
          The last price includes
          premarket and after-hours. The opening range is regular session only, 9:30:00–9:44:59 ET.
          {view ? ` Updated ${formatEtClock(new Date(view.asOf))}.` : ""}
        </footer>
      </section>

      <p className="legal">For scanning the open. Not a recommendation to buy or sell.</p>
    </div>
  );
}

function Stats({
  quotes,
  phase,
  filter,
  onFilter,
  ready,
}: {
  quotes: Quote[] | null;
  phase: SessionInfo["phase"];
  filter: SignalFilter;
  onFilter: (filter: SignalFilter) => void;
  ready: boolean;
}) {
  if (!ready || !quotes) {
    return <p className="stats-loading">Loading the watchlist…</p>;
  }
  if (phase === "forming") {
    return (
      <div className="stats">
        <div className="stat forming">
          <strong>Forming</strong>
          <span>Locks at 9:45am ET</span>
        </div>
      </div>
    );
  }
  const above = quotes.filter((quote) => quote.signal === "above").length;
  const below = quotes.filter((quote) => quote.signal === "below").length;
  const inside = quotes.filter((quote) => quote.signal === "inside").length;
  return (
    <div className="stats" role="group" aria-label="Filter by signal">
      <StatButton
        label="Full list"
        count={quotes.length}
        tone="all"
        pressed={filter === "all"}
        onClick={() => onFilter("all")}
      />
      <StatButton label="Above the range" count={above} tone="above" pressed={filter === "above"} onClick={() => onFilter("above")} />
      <StatButton label="Below the range" count={below} tone="below" pressed={filter === "below"} onClick={() => onFilter("below")} />
      <StatButton label="Inside" count={inside} tone="inside" pressed={filter === "inside"} onClick={() => onFilter("inside")} />
    </div>
  );
}

function StatButton({
  label,
  count,
  tone,
  pressed,
  onClick,
}: {
  label: string;
  count: number;
  tone: "all" | "above" | "below" | "inside";
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`stat ${tone}`} aria-pressed={pressed} onClick={onClick}>
      <strong>{count}</strong>
      <span>{label}</span>
    </button>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="empty" data-testid="empty-state">
      <h2>No symbols on the list</h2>
      <p>Add a ticker above, or restore the default watchlist.</p>
      <button type="button" className="btn primary" onClick={onReset}>
        Restore SPY, QQQ, and the rest
      </button>
    </div>
  );
}

function FeedError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="empty" data-testid="feed-error">
      <h2>Couldn’t load market data</h2>
      <p>{message}</p>
      <div className="empty-actions">
        <button type="button" className="btn primary" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}

function MarketClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="clock-block">
      <p className="clock">{formatEtClock(now)}</p>
      <p className="clock-caption">New York</p>
    </div>
  );
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 42 42" aria-hidden="true">
      <rect width="42" height="42" rx="12" fill="#171d26" stroke="rgba(255,255,255,0.08)" />
      <path d="M10 27h22" stroke="#8ea0b8" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="13" y="18" width="12" height="8" rx="2" fill="#243044" stroke="#d5e2f4" />
      <circle cx="30" cy="14" r="3" fill="#3ddc97" />
    </svg>
  );
}

function useStoredState<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback, allowed));
  useEffect(() => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore storage failures.
    }
  }, [key, value]);
  return [value, setValue] as const;
}

function readStored<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored && (allowed as readonly string[]).includes(stored)) return stored as T;
  } catch {
    // Ignore storage failures.
  }
  return fallback;
}
