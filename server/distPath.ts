import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type DistPathOptions = {
  /** `import.meta.url` when this file is real ESM. Netlify's esbuild bundle leaves it undefined. */
  metaUrl?: string;
  /** Set in the CommonJS function bundle. Absent when this file runs as ESM. */
  dirname?: string | null;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
};

/**
 * Finds the Vite `dist` directory (the Netlify publish directory).
 * Included files land at `$LAMBDA_TASK_ROOT/dist` inside the function zip.
 * That path is resolved before `import.meta.url`, which esbuild erases in the
 * CommonJS bundle (`fileURLToPath(undefined)` crashes the function at load).
 */
export function resolveDistDir(options: DistPathOptions = {}): string | null {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();

  const published = publishedDist(env.LAMBDA_TASK_ROOT);
  if (published && hasIndex(published)) return published;

  const fromCwd = path.resolve(cwd, "dist");
  if (hasIndex(fromCwd)) return fromCwd;

  const here = directoryOfThisModule(options);
  if (!here) return null;

  const nextToServer = path.resolve(here, "../dist");
  if (hasIndex(nextToServer)) return nextToServer;

  // Bundle path is /var/task/netlify/functions/server.js.
  const nextToFunctionBundle = path.resolve(here, "../../dist");
  if (hasIndex(nextToFunctionBundle)) return nextToFunctionBundle;

  return null;
}

function publishedDist(taskRoot: string | undefined): string | null {
  if (typeof taskRoot !== "string" || taskRoot.length === 0) return null;
  return path.resolve(taskRoot, "dist");
}

function hasIndex(dir: string): boolean {
  return existsSync(path.join(dir, "index.html"));
}

function directoryOfThisModule(options: DistPathOptions): string | null {
  const metaUrl = "metaUrl" in options ? options.metaUrl : import.meta.url;
  if (typeof metaUrl === "string" && metaUrl.length > 0) {
    try {
      return path.dirname(fileURLToPath(metaUrl));
    } catch {
      // Not a file URL. Keep looking.
    }
  }

  const dirname = "dirname" in options ? options.dirname : bundledDirname();
  if (typeof dirname === "string" && dirname.length > 0) return dirname;
  return null;
}

/** `__dirname` exists only after Netlify bundles this module to CommonJS. */
function bundledDirname(): string | null {
  try {
    if (typeof __dirname === "string" && __dirname.length > 0) return __dirname;
  } catch {
    return null;
  }
  return null;
}
