import { useEffect, useState, type FormEvent } from "react";
import { DEMO_NOW, type DemoScenario } from "../lib/demo";
import { formatEtClock, formatSessionDay } from "../lib/format";
import { describeSession, statusHint } from "../lib/session";
import type { SortMode } from "../lib/sort";
import type { Quote, SessionInfo, Snapshot } from "../lib/types";
import { useQuotes, type DataMode } from "../hooks/useQuotes";
import { useWatchlist } from "../hooks/useWatchlist";
import { QuoteTable, type SignalFilter } from "./QuoteTable";

export function Dashboard() {
  const watchlist = useWatchlist();
  const [mode, setMode] = useStoredState<DataMode>("opening-range-mode", "live", ["live", "demo"]);
  const [scenario, setScenario] = useStoredState<DemoScenario>("opening-range-scenario", "open", [
    "forming",
    "open",
    "closed",
  ]);
  const [sortMode, setSortMode] = useStoredState<SortMode>("opening-range-sort", "breakouts", [
    "breakouts",
    "list",
  ]);
  const [filter, setFilter] = useState<SignalFilter>("all");
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const { snapshot, error, stale, reload } = useQuotes(watchlist.symbols, mode, scenario);

  const view = snapshotMatches(snapshot, mode, scenario) ? snapshot : null;
  const listedQuotes = view
    ? view.quotes.filter((quote) => watchlist.symbols.includes(quote.symbol))
    : null;
  const quotesForTable =
    listedQuotes == null || (listedQuotes.length === 0 && watchlist.symbols.length > 0) ? null : listedQuotes;
  const session = view
    ? view.session
    : describeSession(mode === "demo" ? new Date(DEMO_NOW[scenario]) : new Date());
  const clockAt = mode === "demo" ? new Date(DEMO_NOW[scenario]) : null;
  const hintNow = clockAt ?? new Date();
  const activeFilter = session.phase === "forming" ? "all" : filter;

  useEffect(() => {
    if (mode === "demo") {
      document.title = "Opening range (demo)";
      return;
    }
    const outside =
      quotesForTable?.filter((quote) => quote.signal === "above" || quote.signal === "below").length ?? 0;
    document.title = outside > 0 ? `${outside} outside · Opening range` : "Opening range";
  }, [mode, quotesForTable]);

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
            <h1>Opening range</h1>
            <p className="lede">
              High and low from 9:30 to 9:45am Eastern. Names trading outside that band are highlighted.
            </p>
          </div>
        </div>
        <div className="status-block">
          <MarketClock mode={mode} at={clockAt} />
          <p className="session" data-testid="session-status">
            <span className={`status-dot ${session.phase}`} />
            {session.sessionStatus}
            <span className="session-date"> · {formatSessionDay(session.sessionDate)}</span>
          </p>
          <p className="hint">{statusHint(session, hintNow)}</p>
        </div>
      </header>

      {mode === "demo" ? (
        <p className="banner demo" role="status">
          <strong>Demo data.</strong> These prices are simulated, not the market.
        </p>
      ) : null}

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
          <div className="segment" role="group" aria-label="Sort">
            <button type="button" aria-pressed={sortMode === "breakouts"} onClick={() => setSortMode("breakouts")}>
              Breakouts first
            </button>
            <button type="button" aria-pressed={sortMode === "list"} onClick={() => setSortMode("list")}>
              List order
            </button>
          </div>
          <div className="segment" role="group" aria-label="Data source">
            <button type="button" data-testid="mode-live" aria-pressed={mode === "live"} onClick={() => setMode("live")}>
              Live
            </button>
            <button type="button" data-testid="mode-demo" aria-pressed={mode === "demo"} onClick={() => setMode("demo")}>
              Demo
            </button>
          </div>
          {mode === "demo" ? (
            <div className="segment" role="group" aria-label="Demo session">
              <button type="button" aria-pressed={scenario === "forming"} onClick={() => setScenario("forming")}>
                Forming
              </button>
              <button type="button" aria-pressed={scenario === "open"} onClick={() => setScenario("open")}>
                Open
              </button>
              <button type="button" aria-pressed={scenario === "closed"} onClick={() => setScenario("closed")}>
                Closed
              </button>
            </div>
          ) : null}
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
          <FeedError message={error} onRetry={reload} onDemo={() => setMode("demo")} />
        ) : (
          <QuoteTable
            symbols={watchlist.symbols}
            quotes={quotesForTable}
            sortMode={sortMode}
            filter={activeFilter}
            onRemove={watchlist.remove}
          />
        )}
        <footer className="panel-foot">
          {mode === "demo"
            ? "Simulated 1-minute prints. Switch to Live for Yahoo Finance prices."
            : "Yahoo Finance, unofficial and sometimes delayed. Refreshes about every 20 seconds. Range is 9:30:00–9:44:59 ET."}
          {view && mode === "live" ? ` Updated ${formatEtClock(new Date(view.asOf))}.` : ""}
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
      <StatButton label="Above the range" count={above} tone="above" pressed={filter === "above"} onClick={() => onFilter(filter === "above" ? "all" : "above")} />
      <StatButton label="Below the range" count={below} tone="below" pressed={filter === "below"} onClick={() => onFilter(filter === "below" ? "all" : "below")} />
      <StatButton label="Inside" count={inside} tone="inside" pressed={filter === "inside"} onClick={() => onFilter(filter === "inside" ? "all" : "inside")} />
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
  tone: "above" | "below" | "inside";
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

function FeedError({
  message,
  onRetry,
  onDemo,
}: {
  message: string;
  onRetry: () => void;
  onDemo: () => void;
}) {
  return (
    <div className="empty" data-testid="feed-error">
      <h2>Couldn’t load market data</h2>
      <p>{message}</p>
      <div className="empty-actions">
        <button type="button" className="btn primary" onClick={onRetry}>
          Try again
        </button>
        <button type="button" className="btn" onClick={onDemo}>
          Use demo data
        </button>
      </div>
    </div>
  );
}

function MarketClock({ mode, at }: { mode: DataMode; at: Date | null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (mode !== "live") return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [mode]);
  const shown = at ?? now;
  return (
    <div className="clock-block">
      <p className="clock">{formatEtClock(shown)}</p>
      <p className="clock-caption">{mode === "demo" ? "Scenario time" : "New York"}</p>
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

function snapshotMatches(
  snapshot: Snapshot | null,
  mode: DataMode,
  scenario: DemoScenario,
): snapshot is Snapshot {
  if (!snapshot) return false;
  if (mode === "demo") return snapshot.source === "demo" && snapshot.scenario === scenario;
  return snapshot.source === "yahoo";
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
