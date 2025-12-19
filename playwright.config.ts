import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'dotnet run --project src/VoiceAgentCSharp.csproj',
    url: 'http://localhost:5000',
    reuseExistingServer: true,
    timeout: 120000,
    env: {
      ASPNETCORE_ENVIRONMENT: 'Development',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'Pa$$w0rd!',
    },
  },
});
