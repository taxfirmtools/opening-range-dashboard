import { formatPrice, formatSessionDay } from "../lib/format";
import type { MarketLevel } from "../lib/levels";
import { useLevels } from "../hooks/useLevels";

export function MarketLevels({ refreshToken = 0 }: { refreshToken?: number }) {
  const { snapshot, error } = useLevels(refreshToken);

  if (!snapshot && error) {
    return (
      <section className="levels" aria-label="Oil and the 10-year Treasury">
        <p className="level-error" role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="levels" aria-label="Oil and the 10-year Treasury" aria-busy="true">
        <p className="level-loading">Loading oil and the 10-year…</p>
      </section>
    );
  }

  return (
    <section className="levels" aria-label="Oil and the 10-year Treasury" data-testid="market-levels">
      {snapshot.levels.map((level) => (
        <LevelCard key={level.id} level={level} />
      ))}
    </section>
  );
}

function LevelCard({ level }: { level: MarketLevel }) {
  const direction = trendDirection(level.change);
  return (
    <article className="level" data-testid={`level-${level.id}`}>
      <h2>{level.label}</h2>
      <p className="level-symbol">{level.symbol}</p>
      {level.error ? (
        <p className="level-error">{level.error}</p>
      ) : (
        <>
          <p className="level-price">
            <span>{formatLevel(level.unit, level.last)}</span>
            <DayChange level={level} />
          </p>
          <p className={`level-trend ${direction ?? "flat"}`}>
            {trendCopy(level)}
          </p>
          {level.days.length > 0 ? (
            <ol className="level-days">
              {level.days.map((day) => (
                <li key={day.date}>
                  <span>{formatSessionDay(day.date)}</span>
                  <strong>{formatLevel(level.unit, day.close)}</strong>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </article>
  );
}

function DayChange({ level }: { level: MarketLevel }) {
  const direction = trendDirection(level.dayChange);
  if (level.dayChange == null || direction == null) return <span className="level-day flat">—</span>;
  const move = formatMove(level.unit, level.dayChange);
  const percent =
    level.dayPercent != null ? ` (${formatSignedPercent(level.dayPercent)})` : "";
  return (
    <span className={`level-day ${direction}`}>
      {move}
      {percent} day
    </span>
  );
}

function trendDirection(change: number | null): "up" | "down" | "flat" | null {
  if (change == null || !Number.isFinite(change)) return null;
  if (change > 0) return "up";
  if (change < 0) return "down";
  return "flat";
}

function trendCopy(level: MarketLevel): string {
  if (level.change == null || !Number.isFinite(level.change) || level.days.length < 2) {
    return "Not enough sessions for a 3-day trend.";
  }
  const move = formatMove(level.unit, level.change);
  const percent =
    level.unit === "usd" && level.percent != null ? ` (${formatSignedPercent(level.percent)})` : "";
  const span = level.days.length === 3 ? "the last 3 sessions" : `the last ${level.days.length} sessions`;
  return `${move}${percent} over ${span}`;
}

function formatLevel(unit: MarketLevel["unit"], value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (unit === "usd") return formatPrice(value);
  return `${value.toFixed(3)}%`;
}

function formatMove(unit: MarketLevel["unit"], value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (unit === "usd") return `${sign}${formatPrice(abs)}`;
  return `${sign}${abs.toFixed(3)} pt`;
}

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
