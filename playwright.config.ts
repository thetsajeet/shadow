import { defineConfig, devices } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `bun run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://shadow:shadow@127.0.0.1:5432/shadow",
      DATABASE_URL_DIRECT: process.env.DATABASE_URL_DIRECT ?? "postgres://shadow:shadow@127.0.0.1:5432/shadow",
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? "test-github-token",
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ?? "test-google-key",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "e2e-session-secret-for-playwright",
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ?? "test-client-id",
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ?? "test-client-secret",
      MODEL_PROVIDER: "google",
      EMBEDDING_PROVIDER: "google",
      BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
      INNGEST_DEV: "1",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
