import type { Plugin } from "vite";
import { gateDecision, readDashboardPassword } from "./gate";
import { loginDocument } from "./loginPage";

/** Blocks the dev page, source, and demo bundle until the shared password is set and the browser has signed in. */
export function dashboardDevGate(): Plugin {
  return {
    name: "dashboard-gate",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "/").split("?")[0] || "/";
        if (path.startsWith("/api/") || path === "/favicon.svg") {
          next();
          return;
        }
        const decision = gateDecision(req.headers.cookie, readDashboardPassword());
        if (decision === "allow") {
          next();
          return;
        }
        const state = decision === "setup" ? "setup" : "login";
        res.statusCode = decision === "setup" ? 503 : 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.end(loginDocument(state));
      });
    },
  };
}
