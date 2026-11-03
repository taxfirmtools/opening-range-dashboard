import { useEffect, useState } from "react";
import { fetchLiveQuotes } from "../lib/client";
import { buildDemoSnapshot } from "../lib/demo";
import type { DemoScenario, Snapshot } from "../lib/types";

const POLL_MS = 20_000;

export type DataMode = "live" | "demo";

export function useQuotes(symbols: string[], mode: DataMode, scenario: DemoScenario) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const symbolKey = symbols.join(",");

  useEffect(() => {
    const requested = symbolKey.length === 0 ? [] : symbolKey.split(",");
    const controller = new AbortController();
    let ignore = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hasData = false;

    async function load() {
      if (requested.length === 0) {
        setError(null);
        setStale(false);
        return;
      }
      try {
        const next =
          mode === "demo"
            ? buildDemoSnapshot(requested, scenario)
            : await fetchLiveQuotes(requested, controller.signal);
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
      }
      if (!ignore && mode === "live" && requested.length > 0) {
        timer = setTimeout(() => {
          void load();
        }, POLL_MS);
      }
    }

    setError(null);
    setStale(false);
    void load();

    return () => {
      ignore = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [symbolKey, mode, scenario, reloadToken]);

  return {
    snapshot,
    error,
    stale,
    reload: () => setReloadToken((value) => value + 1),
  };
}
