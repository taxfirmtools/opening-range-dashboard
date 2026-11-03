import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDistDir } from "./distPath";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "orb-dist-"));
  roots.push(root);
  return root;
}

function writeIndex(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.html"), "<!doctype html><div id=\"root\"></div>");
}

describe("resolveDistDir", () => {
  it("returns the Netlify publish directory when the bundled module url is missing", () => {
    const root = tempRoot();
    const dist = path.join(root, "dist");
    writeIndex(dist);

    const found = resolveDistDir({
      metaUrl: undefined,
      dirname: null,
      env: { LAMBDA_TASK_ROOT: root },
      cwd: path.join(root, "not-the-zip"),
    });

    expect(found).toBe(dist);
    expect(typeof found).toBe("string");
  });

  it("ignores a blank Lambda root and uses dist next to the server module", () => {
    const root = tempRoot();
    const serverDir = path.join(root, "server");
    const dist = path.join(root, "dist");
    mkdirSync(serverDir);
    writeIndex(dist);

    const found = resolveDistDir({
      metaUrl: pathToFileURL(path.join(serverDir, "distPath.ts")).href,
      env: { LAMBDA_TASK_ROOT: "" },
      cwd: path.join(root, "elsewhere"),
    });

    expect(found).toBe(dist);
  });

  it("finds dist two levels above the CommonJS function bundle", () => {
    const root = tempRoot();
    const functionDir = path.join(root, "netlify", "functions");
    const dist = path.join(root, "dist");
    mkdirSync(functionDir, { recursive: true });
    writeIndex(dist);

    const found = resolveDistDir({
      metaUrl: undefined,
      dirname: functionDir,
      env: {},
      cwd: path.join(root, "elsewhere"),
    });

    expect(found).toBe(dist);
  });

  it("returns null instead of throwing when nothing published an index", () => {
    const root = tempRoot();
    expect(
      resolveDistDir({
        metaUrl: undefined,
        dirname: null,
        env: {},
        cwd: root,
      }),
    ).toBeNull();
  });
});
