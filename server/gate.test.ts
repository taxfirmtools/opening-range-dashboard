import { describe, expect, it } from "vitest";
import {
  createAttemptLimiter,
  gateDecision,
  passwordMatches,
  readCookie,
  readDashboardPassword,
  sessionCookieMatches,
  sessionToken,
} from "./gate";
import { loginDocument } from "./loginPage";

describe("dashboard password", () => {
  it("treats a missing or blank password as unset", () => {
    expect(readDashboardPassword({})).toBeNull();
    expect(readDashboardPassword({ DASHBOARD_PASSWORD: "" })).toBeNull();
    expect(readDashboardPassword({ DASHBOARD_PASSWORD: "   " })).toBeNull();
    expect(readDashboardPassword({ DASHBOARD_PASSWORD: "keep me" })).toBe("keep me");
  });

  it("accepts only the configured password", () => {
    expect(passwordMatches("correct horse", "correct horse")).toBe(true);
    expect(passwordMatches("wrong", "correct horse")).toBe(false);
    expect(passwordMatches("correct horse ", "correct horse")).toBe(false);
  });

  it("keeps a browser signed in only for the current password", () => {
    const token = sessionToken("correct horse");
    const header = `theme=dark; orb_session=${encodeURIComponent(token)}`;
    expect(readCookie(header, "orb_session")).toBe(token);
    expect(sessionCookieMatches(token, "correct horse")).toBe(true);
    expect(sessionCookieMatches(token, "other password")).toBe(false);
    expect(sessionCookieMatches("nope", "correct horse")).toBe(false);
    expect(gateDecision(header, "correct horse")).toBe("allow");
    expect(gateDecision(header, "other password")).toBe("login");
    expect(gateDecision(undefined, null)).toBe("setup");
    expect(gateDecision(header, null)).toBe("setup");
  });

  it("slows repeated wrong passwords", () => {
    const limiter = createAttemptLimiter(2, 1_000);
    expect(limiter.blocked("1.2.3.4", 0)).toBe(false);
    limiter.record("1.2.3.4", 0);
    limiter.record("1.2.3.4", 10);
    expect(limiter.blocked("1.2.3.4", 20)).toBe(true);
    expect(limiter.blocked("5.6.7.8", 20)).toBe(false);
    expect(limiter.blocked("1.2.3.4", 1_001)).toBe(false);
    limiter.record("1.2.3.4", 1_100);
    limiter.clear("1.2.3.4");
    expect(limiter.blocked("1.2.3.4", 1_100)).toBe(false);
  });
});

describe("login page", () => {
  it("shows setup instructions or a password form, and nothing else", () => {
    const setup = loginDocument("setup");
    expect(setup).toContain("Piper Terminal");
    expect(setup).not.toContain("Opening range");
    expect(setup).toContain("DASHBOARD_PASSWORD");
    expect(setup).not.toContain("<form");
    expect(setup).not.toContain("id=\"root\"");

    const wrong = loginDocument("wrong");
    expect(wrong).toContain("Piper Terminal");
    expect(wrong).not.toContain("Opening range");
    expect(wrong).toContain("Wrong password.");
    expect(wrong).toContain('type="password"');
    expect(wrong).toContain('action="/api/login"');
    expect(wrong.toLowerCase()).not.toContain("sign up");
    expect(wrong.toLowerCase()).not.toContain("forgot");
  });
});
