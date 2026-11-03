import { describe, expect, it } from "vitest";
import { DEFAULT_WATCHLIST } from "../config/watchlist";
import { applyWatchlist, readStoredWatchlist, serializeWatchlist } from "./watchlistStorage";

describe("watchlist storage", () => {
  it("keeps header edits in order and restores the default list", () => {
    expect(readStoredWatchlist(null)).toEqual([...DEFAULT_WATCHLIST]);

    const added = applyWatchlist([...DEFAULT_WATCHLIST], { type: "add", raw: " ibm " });
    expect(added.error).toBeNull();
    expect(added.symbols.at(-1)).toBe("IBM");

    const removed = applyWatchlist(added.symbols, { type: "remove", symbol: "AAPL" });
    expect(removed.symbols).not.toContain("AAPL");
    expect(removed.symbols.at(-1)).toBe("IBM");

    const stored = serializeWatchlist(removed.symbols);
    expect(readStoredWatchlist(stored)).toEqual(removed.symbols);

    const restored = applyWatchlist(removed.symbols, { type: "reset" });
    expect(restored.symbols).toEqual([...DEFAULT_WATCHLIST]);
  });

  it("ignores a stored value that is not a symbol list", () => {
    expect(readStoredWatchlist("not-json")).toEqual([...DEFAULT_WATCHLIST]);
    expect(readStoredWatchlist("{\"mode\":\"demo\"}")).toEqual([...DEFAULT_WATCHLIST]);
  });
});
