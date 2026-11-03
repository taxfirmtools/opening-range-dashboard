import { useEffect, useState } from "react";
import { fetchLevels } from "../lib/client";
import type { LevelsSnapshot } from "../lib/levels";

const POLL_MS = 20_000;

export function useLevels() {
  const [snapshot, setSnapshot] = useState<LevelsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const next = await fetchLevels(controller.signal);
        if (ignore) return;
        setSnapshot(next);
        setError(null);
      } catch (err) {
        if (ignore || (err instanceof Error && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Could not load oil and the 10-year");
      }
      if (!ignore) {
        timer = setTimeout(() => {
          void load();
        }, POLL_MS);
      }
    }

    void load();
    return () => {
      ignore = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { snapshot, error };
}
