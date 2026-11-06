export interface Bar {
  /** Unix epoch milliseconds at the start of the one-minute bar. */
  t: number;
  high: number | null;
  low: number | null;
  close: number | null;
  /** Share volume for this minute, when the feed sends it. */
  volume?: number | null;
}

/** One real minute bar, oldest first. */
export interface SparkPoint {
  /** Unix epoch milliseconds at the start of the minute. */
  t: number;
  /** Close of the minute. */
  price: number;
  high: number;
  low: number;
  /** True for a print inside the 9:30–9:45 ET opening window. The 9:45 bar is not included. */
  opening: boolean;
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
  /** Intraday closes for the sparkline, oldest first. */
  sparkline: SparkPoint[];
  /**
   * Point of control: the price with the most volume from the 9:30 open
   * through the latest price. Null before the open or when volume is missing.
   */
  poc: number | null;
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
  getSymbol(symbol: string, options?: { fresh?: boolean }): Promise<SymbolBars>;
}
