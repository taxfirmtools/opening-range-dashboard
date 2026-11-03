import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "./app";
import { handler } from "../netlify/functions/server";

const originalPassword = process.env.DASHBOARD_PASSWORD;

afterEach(() => {
  if (originalPassword === undefined) delete process.env.DASHBOARD_PASSWORD;
  else process.env.DASHBOARD_PASSWORD = originalPassword;
});

describe("password gate over HTTP", () => {
  it("keeps the page and the API closed until the shared password is entered", async () => {
    process.env.DASHBOARD_PASSWORD = "correct horse";
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    try {
      const locked = await fetch(`${base}/api/opening-range?symbols=SPY`, {
        headers: { "x-forwarded-for": "203.0.113.10" },
      });
      expect(locked.status).toBe(401);
      const levelsLocked = await fetch(`${base}/api/levels`, {
        headers: { "x-forwarded-for": "203.0.113.10" },
      });
      expect(levelsLocked.status).toBe(401);
      const page = await fetch(base, { headers: { "x-forwarded-for": "203.0.113.10" } });
      const html = await page.text();
      expect(html).toContain('type="password"');
      expect(html).not.toContain('id="root"');

      const wrong = await fetch(`${base}/api/login`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "203.0.113.11",
        },
        body: "password=nope",
        redirect: "manual",
      });
      expect(wrong.status).toBe(401);
      expect(await wrong.text()).toContain("Wrong password.");

      const right = await fetch(`${base}/api/login`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "203.0.113.12",
        },
        body: "password=correct+horse",
        redirect: "manual",
      });
      expect(right.status).toBe(303);
      const cookie = right.headers.get("set-cookie") ?? "";
      expect(cookie).toContain("orb_session=");
      expect(cookie.toLowerCase()).not.toContain("max-age");
      expect(cookie.toLowerCase()).not.toContain("expires=");

      const authed = await fetch(`${base}/api/health`, {
        headers: { cookie: cookie.split(";")[0] ?? "", "x-forwarded-for": "203.0.113.12" },
      });
      expect(authed.status).toBe(200);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it("shows setup instructions when the password is unset", async () => {
    delete process.env.DASHBOARD_PASSWORD;
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const { port } = server.address() as AddressInfo;
    try {
      const page = await fetch(`http://127.0.0.1:${port}/`);
      expect(page.status).toBe(503);
      expect(await page.text()).toContain("DASHBOARD_PASSWORD");
      const api = await fetch(`http://127.0.0.1:${port}/api/opening-range?symbols=SPY`);
      expect(api.status).toBe(503);
      const levels = await fetch(`http://127.0.0.1:${port}/api/levels`);
      expect(levels.status).toBe(503);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});

describe("Netlify function adapter", () => {
  it("serves the login page for the site root and strips the function prefix", async () => {
    process.env.DASHBOARD_PASSWORD = "correct horse";
    const result = (await handler(
      {
        httpMethod: "GET",
        path: "/.netlify/functions/server",
        headers: { host: "dashboard.example.netlify.app", "x-forwarded-for": "203.0.113.20" },
        queryStringParameters: null,
        body: null,
        isBase64Encoded: false,
      },
      {},
    )) as { statusCode: number; body?: string };
    expect(result.statusCode).toBe(200);
    expect(result.body ?? "").toContain('type="password"');
    expect(result.body ?? "").not.toContain('id="root"');
  });
});
