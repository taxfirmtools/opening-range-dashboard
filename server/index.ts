import { pathToFileURL } from "node:url";
import path from "node:path";
import { app } from "./app";
import { readDashboardPassword } from "./gate";

const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT) || (isProd ? 5173 : 5174);
const host = process.env.HOST || "127.0.0.1";

const entry = process.argv[1];
const isDirectRun = Boolean(entry && import.meta.url === pathToFileURL(path.resolve(entry)).href);

if (isDirectRun) {
  const server = app.listen(port, host, () => {
    const gate = readDashboardPassword()
      ? "password gate on"
      : "DASHBOARD_PASSWORD is not set; dashboard stays closed";
    console.log(`Opening range API at http://${host}:${port} (${gate})`);
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use.`);
      process.exit(1);
    }
    throw error;
  });
}
