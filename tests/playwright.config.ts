/**
 * Playwright test configuration for playwright-ohos.
 *
 * Runs the migrated playwright tests (tests/page and tests/library) against
 * on-device browsers through the playwright-ohos HDC launcher.
 */
import { config as loadEnv } from 'dotenv';
import * as path from 'path';

loadEnv({ path: path.join(__dirname, '..', '.env'), override: true });
process.env.PWTEST_UNDER_TEST = '1';

import type { Config, PlaywrightTestOptions, PlaywrightWorkerOptions } from '@playwright/test';
import type { TestModeWorkerOptions } from './config/testModeFixtures';

// Channel per browser: 'huaweiBrowser' (default) and 'chrome' (Haitai Browser).
const channels = (process.env.PWTEST_CHANNEL ? [process.env.PWTEST_CHANNEL] : ['huaweiBrowser', 'chrome']);
const browserName = 'chromium';
const outputDir = path.join(__dirname, '..', 'test-results');
const testDir = path.join(__dirname);

const config: Config<PlaywrightWorkerOptions & PlaywrightTestOptions & TestModeWorkerOptions> = {
  testDir,
  outputDir,
  expect: {
    timeout: 10000,
  },
  // Device browsers are slow; a single round can take hours.
  timeout: 30000,
  // Default 6h; the per-test browser restart mode needs more headroom.
  globalTimeout: process.env.PW_OHOS_GLOBAL_TIMEOUT ? Number(process.env.PW_OHOS_GLOBAL_TIMEOUT) : 6 * 60 * 60 * 1000,
  // Parallel CDP connections to the device browser are unstable.
  workers: 1,
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(outputDir, 'report.json') }],
  ],
  projects: [],
  use: {},
};

for (const channel of channels) {
  const projectTemplate: Config['projects'][0] = {
    testIgnore: [
      /firefox/,
      /webkit/,
      // Internal playwright component tests that do not exercise the
      // device browser protocol surface.
      /component-parser\.spec\.ts/,
      /css-parser\.spec\.ts/,
      /inspector\//,
      /locator-generator\.spec\.ts/,
      // Requires the recorder and a local chromium executable.
      /selector-generator\.spec\.ts/,
      /snapshot-renderer\.spec\.ts/,
      /trace-viewer\.spec\.ts/,
      /trace-viewer-scrub\.spec\.ts/,
      /tracing\.spec\.ts/,
      /unit\//,
    ],
    snapshotPathTemplate: `{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}-${browserName}{ext}`,
    use: {
      mode: 'default' as const,
      browserName,
      channel,
      launchOptions: {},
    },
    metadata: {
      platform: process.platform,
      browserName,
      channel,
    },
  };

  config.projects.push({
    name: `${channel}-library`,
    testDir: path.join(testDir, 'library'),
    ...projectTemplate,
  });

  config.projects.push({
    name: `${channel}-page`,
    testDir: path.join(testDir, 'page'),
    ...projectTemplate,
  });
}

export default config;
