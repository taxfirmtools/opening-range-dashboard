import express from "express";
import path from "node:path";
import { analyzeSession, describeSession, toQuote, unavailableQuote } from "../src/lib/session";
import { parseSymbolList } from "../src/lib/symbols";
import type { Snapshot } from "../src/lib/types";
import { loginHandler, requireSession } from "./auth";
import { resolveDistDir } from "./distPath";
import { yahooProvider } from "./yahoo";

export const app = express();
app.set("trust proxy", 1);

// Netlify may pass the function path through. Local requests are unchanged.
app.use((req, _res, next) => {
  const prefix = "/.netlify/functions/server";
  if (req.url === prefix || req.url.startsWith(`${prefix}/`) || req.url.startsWith(`${prefix}?`)) {
    const rest = req.url.slice(prefix.length);
    req.url = rest.startsWith("/") ? rest : `/${rest || ""}`;
  }
  next();
});

app.post(
  "/api/login",
  express.urlencoded({ extended: false, limit: "2kb" }),
  express.json({ limit: "2kb" }),
  loginHandler,
);
app.use(requireSession);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, provider: yahooProvider.id });
});

app.get("/api/opening-range", async (req, res) => {
  const symbols = parseSymbolList(req.query.symbols);
  if (symbols.length === 0) {
    res.status(400).json({ error: "Add at least one symbol." });
    return;
  }

  const now = new Date();
  const session = describeSession(now);
  const quotes = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const data = await yahooProvider.getSymbol(symbol);
        const analysis = analyzeSession({
          now,
          bars: data.bars,
          livePrice: data.livePrice,
          liveTime: data.liveTime,
          previousClose: data.previousClose,
        });
        return toQuote(symbol, data.name, analysis);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Quote unavailable";
        return unavailableQuote(symbol, now, message);
      }
    }),
  );

  const body: Snapshot = {
    source: "yahoo",
    delayed: yahooProvider.delayed,
    asOf: now.toISOString(),
    note: "Unofficial Yahoo Finance data. Quotes may be delayed and are not a brokerage feed.",
    session: {
      phase: session.phase,
      sessionDate: session.sessionDate,
      sessionStatus: session.sessionStatus,
    },
    quotes,
  };
  res.set("Cache-Control", "no-store");
  res.json(body);
});

const distDir = resolveDistDir();
if (distDir) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(distDir, "index.html"));
  });
}
