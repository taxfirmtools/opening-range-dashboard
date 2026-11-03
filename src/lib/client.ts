import type { LevelsSnapshot } from "./levels";
import type { Snapshot } from "./types";

export async function fetchLiveQuotes(
  symbols: string[],
  signal?: AbortSignal,
  options?: { fresh?: boolean },
): Promise<Snapshot> {
  const fresh = options?.fresh ? "&fresh=1" : "";
  const response = await fetch(
    `/api/opening-range?symbols=${encodeURIComponent(symbols.join(","))}${fresh}`,
    {
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(`Market data request failed (${response.status})`);
  }
  const body: unknown = await response.json();
  if (!isSnapshot(body) || body.source !== "yahoo") {
    throw new Error("Unexpected market data response");
  }
  return body;
}

export async function fetchLevels(signal?: AbortSignal, options?: { fresh?: boolean }): Promise<LevelsSnapshot> {
  const fresh = options?.fresh ? "?fresh=1" : "";
  const response = await fetch(`/api/levels${fresh}`, { cache: "no-store", signal });
  if (!response.ok) {
    throw new Error(`Market levels request failed (${response.status})`);
  }
  const body: unknown = await response.json();
  if (!isLevels(body)) throw new Error("Unexpected market levels response");
  return body;
}

function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Snapshot;
  return (
    Array.isArray(snapshot.quotes) &&
    typeof snapshot.asOf === "string" &&
    snapshot.source === "yahoo" &&
    typeof snapshot.session?.phase === "string" &&
    typeof snapshot.session.sessionDate === "string"
  );
}

function isLevels(value: unknown): value is LevelsSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as LevelsSnapshot;
  return snapshot.source === "yahoo" && Array.isArray(snapshot.levels);
}
