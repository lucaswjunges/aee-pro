import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
  },
  webServer: [
    {
      command: "pnpm --filter @aee-pro/api dev",
      port: 8787,
      reuseExistingServer: true,
      cwd: "..",
    },
    {
      command: "pnpm --filter @aee-pro/web dev",
      port: 5173,
      reuseExistingServer: true,
      cwd: "..",
    },
  ],
});
