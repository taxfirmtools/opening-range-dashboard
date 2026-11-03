export interface Bar {
  /** Unix epoch milliseconds at the start of the one-minute bar. */
  t: number;
  high: number | null;
  low: number | null;
  close: number | null;
}

export type Phase = "forming" | "open" | "closed";

export type Signal = "above" | "below" | "inside" | "forming" | "unavailable";

export type SessionStatus = "Range forming" | "Regular hours" | "Session closed";

export type DataSource = "yahoo";

export interface SessionInfo {
  phase: Phase;
  /** ET calendar date (YYYY-MM-DD) of the opening range being shown. */
  sessionDate: string;
  sessionStatus: SessionStatus;
}

export interface Quote {
  symbol: string;
  name: string | null;
  last: number | null;
  previousClose: number | null;
  orHigh: number | null;
  orLow: number | null;
  signal: Signal;
  phase: Phase;
  sessionDate: string;
  sessionStatus: SessionStatus;
  /** One-minute bars that fell inside 9:30–9:44 ET. */
  orBarCount: number;
  error?: string;
}

export interface Snapshot {
  source: DataSource;
  delayed: boolean;
  asOf: string;
  note: string;
  session: SessionInfo;
  quotes: Quote[];
}

export interface SymbolBars {
  name: string | null;
  bars: Bar[];
  livePrice: number | null;
  /** Unix epoch milliseconds of the live price, when the feed provides it. */
  liveTime: number | null;
  previousClose: number | null;
}

export interface BarsProvider {
  readonly id: string;
  readonly label: string;
  /** True when this is not a brokerage real-time feed. */
  readonly delayed: boolean;
  getSymbol(symbol: string): Promise<SymbolBars>;
}
