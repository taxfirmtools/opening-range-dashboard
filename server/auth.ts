import type { NextFunction, Request, Response } from "express";
import {
  createAttemptLimiter,
  gateDecision,
  passwordMatches,
  readDashboardPassword,
  sessionCookieHeader,
  type AttemptLimiter,
} from "./gate";
import { loginDocument } from "./loginPage";

const attempts: AttemptLimiter = createAttemptLimiter(8, 10 * 60 * 1000);

export function loginHandler(req: Request, res: Response): void {
  const password = readDashboardPassword();
  const html = wantsHtml(req);
  if (!password) {
    sendClosed(res, html, 503, loginDocument("setup"), {
      error: "Set DASHBOARD_PASSWORD to open this dashboard.",
    });
    return;
  }

  const key = clientKey(req);
  if (attempts.blocked(key)) {
    sendClosed(res, html, 429, loginDocument("limited"), {
      error: "Too many tries. Wait a few minutes.",
    });
    return;
  }

  const submitted = readSubmittedPassword(req.body);
  if (!passwordMatches(submitted, password)) {
    attempts.record(key);
    sendClosed(res, html, 401, loginDocument("wrong"), { error: "Wrong password." });
    return;
  }

  attempts.clear(key);
  res.setHeader("Set-Cookie", sessionCookieHeader(password, requestIsSecure(req)));
  res.setHeader("Cache-Control", "no-store");
  res.redirect(303, "/");
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  const password = readDashboardPassword();
  const decision = gateDecision(req.headers.cookie, password);
  if (decision === "allow") {
    next();
    return;
  }

  const api = req.path.startsWith("/api/");
  if (decision === "setup") {
    sendClosed(res, !api, 503, loginDocument("setup"), {
      error: "Set DASHBOARD_PASSWORD to open this dashboard.",
    });
    return;
  }

  sendClosed(res, !api, api ? 401 : 200, loginDocument("login"), { error: "Sign in required." });
}

function sendClosed(
  res: Response,
  html: boolean,
  status: number,
  document: string,
  json: { error: string },
): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (html) {
    res.status(status).type("html").send(document);
    return;
  }
  res.status(status).json(json);
}

function wantsHtml(req: Request): boolean {
  const type = headerValue(req.headers["content-type"]);
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) return true;
  const accept = headerValue(req.headers.accept);
  return accept.includes("text/html");
}

function readSubmittedPassword(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const value = (body as { password?: unknown }).password;
  return typeof value === "string" ? value : "";
}

function clientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function requestIsSecure(req: Request): boolean {
  if (req.secure) return true;
  const proto = headerValue(req.headers["x-forwarded-proto"]).split(",")[0]?.trim();
  return proto === "https";
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
