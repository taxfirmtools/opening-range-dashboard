import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Finds the built dashboard. Netlify copies `dist` into the function bundle; local production uses the repo `dist`. */
export function resolveDistDir(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.LAMBDA_TASK_ROOT ? path.join(process.env.LAMBDA_TASK_ROOT, "dist") : "",
    path.resolve(process.cwd(), "dist"),
    path.resolve(here, "../dist"),
    path.resolve(here, "../../dist"),
  ].filter((dir) => dir.length > 0);

  for (const dir of candidates) {
    if (existsSync(path.join(dir, "index.html"))) return dir;
  }
  return null;
}
