import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "orb_session";

const SESSION_LABEL = "opening-range-session-v1";

/** Blank or missing means the dashboard stays closed. The value itself is not trimmed. */
export function readDashboardPassword(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const value = env.DASHBOARD_PASSWORD;
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

export function passwordMatches(input: string, expected: string): boolean {
  const actual = createHash("sha256").update(input, "utf8").digest();
  const wanted = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actual, wanted);
}

export function sessionToken(password: string): string {
  return createHmac("sha256", password).update(SESSION_LABEL).digest("base64url");
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function sessionCookieMatches(token: string | undefined, password: string): boolean {
  if (!token) return false;
  const expected = Buffer.from(sessionToken(password));
  const actual = Buffer.from(token);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export type GateDecision = "allow" | "setup" | "login";

export function gateDecision(cookieHeader: string | undefined, password: string | null): GateDecision {
  if (!password) return "setup";
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (sessionCookieMatches(token, password)) return "allow";
  return "login";
}

export function sessionCookieHeader(password: string, secure: boolean): string {
  const token = encodeURIComponent(sessionToken(password));
  const parts = [`${SESSION_COOKIE}=${token}`, "HttpOnly", "SameSite=Lax", "Path=/"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export interface AttemptLimiter {
  blocked(key: string, now?: number): boolean;
  record(key: string, now?: number): void;
  clear(key: string): void;
}

export function createAttemptLimiter(max: number, windowMs: number): AttemptLimiter {
  const failures = new Map<string, { count: number; resetAt: number }>();
  return {
    blocked(key, now = Date.now()) {
      const entry = failures.get(key);
      if (!entry) return false;
      if (entry.resetAt <= now) {
        failures.delete(key);
        return false;
      }
      return entry.count >= max;
    },
    record(key, now = Date.now()) {
      const entry = failures.get(key);
      if (!entry || entry.resetAt <= now) {
        failures.set(key, { count: 1, resetAt: now + windowMs });
        return;
      }
      entry.count += 1;
    },
    clear(key) {
      failures.delete(key);
    },
  };
}
