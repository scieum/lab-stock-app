import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);

// 기본 workers(코어 수/2 = 8)는 이 PC에서 메모리 부족으로 Chromium이 크래시한다.
// 안정적인 값으로 고정하고, PW_WORKERS 환경변수로 덮어쓸 수 있게 둔다.
const WORKERS = Math.max(1, Number(process.env.PW_WORKERS) || 3);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: WORKERS,
  retries: 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
