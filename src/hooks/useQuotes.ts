import { useEffect, useState } from "react";
import { fetchLiveQuotes } from "../lib/client";
import type { Snapshot } from "../lib/types";

const POLL_MS = 10_000;

export function useQuotes(symbols: string[]) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const symbolKey = symbols.join(",");

  useEffect(() => {
    const requested = symbolKey.length === 0 ? [] : symbolKey.split(",");
    const controller = new AbortController();
    let ignore = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hasData = false;

    async function load(fresh: boolean) {
      if (requested.length === 0) {
        setError(null);
        setStale(false);
        setRefreshing(false);
        return;
      }
      if (fresh) setRefreshing(true);
      try {
        const next = await fetchLiveQuotes(requested, controller.signal, { fresh });
        if (ignore) return;
        setSnapshot(next);
        setError(null);
        setStale(false);
        hasData = true;
      } catch (err) {
        if (ignore || (err instanceof Error && err.name === "AbortError")) return;
        const message = err instanceof Error ? err.message : "Could not load market data";
        setError(message);
        setStale(hasData);
      } finally {
        if (!ignore && fresh) setRefreshing(false);
      }
      if (!ignore && requested.length > 0) {
        timer = setTimeout(() => {
          void load(false);
        }, POLL_MS);
      }
    }

    setError(null);
    setStale(false);
    void load(reloadToken > 0);

    return () => {
      ignore = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [symbolKey, reloadToken]);

  return {
    snapshot,
    error,
    stale,
    refreshing,
    reload: () => setReloadToken((value) => value + 1),
  };
}
