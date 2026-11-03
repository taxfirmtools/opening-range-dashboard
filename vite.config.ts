import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { dashboardDevGate } from "./server/devGate";

export default defineConfig({
  plugins: [dashboardDevGate(), react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:5174",
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
  },
});
