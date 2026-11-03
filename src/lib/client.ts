import type { Snapshot } from "./types";

export async function fetchLiveQuotes(symbols: string[], signal?: AbortSignal): Promise<Snapshot> {
  const response = await fetch(`/api/opening-range?symbols=${encodeURIComponent(symbols.join(","))}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Market data request failed (${response.status})`);
  }
  const body: unknown = await response.json();
  if (!isSnapshot(body) || body.source !== "yahoo") {
    throw new Error("Unexpected market data response");
  }
  return body;
}

function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Snapshot;
  return (
    Array.isArray(snapshot.quotes) &&
    typeof snapshot.asOf === "string" &&
    (snapshot.source === "yahoo" || snapshot.source === "demo") &&
    typeof snapshot.session?.phase === "string" &&
    typeof snapshot.session.sessionDate === "string"
  );
}
