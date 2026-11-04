import { useEffect, useState } from "react";
import { fetchLevels } from "../lib/client";
import type { LevelsSnapshot } from "../lib/levels";

const POLL_MS = 10_000;

export function useLevels(refreshToken = 0) {
  const [snapshot, setSnapshot] = useState<LevelsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load(fresh: boolean) {
      if (fresh) setRefreshing(true);
      try {
        const next = await fetchLevels(controller.signal, { fresh });
        if (ignore) return;
        setSnapshot(next);
        setError(null);
      } catch (err) {
        if (ignore || (err instanceof Error && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Could not load oil and the 10-year");
      } finally {
        if (!ignore && fresh) setRefreshing(false);
      }
      if (!ignore) {
        timer = setTimeout(() => {
          void load(false);
        }, POLL_MS);
      }
    }

    void load(refreshToken > 0);
    return () => {
      ignore = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [refreshToken]);

  return { snapshot, error, refreshing };
}
