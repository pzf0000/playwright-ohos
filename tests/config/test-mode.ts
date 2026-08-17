/**
 * Test mode implementation adapted for playwright-ohos. Only the default
 * in-process mode is supported.
 */
export type TestModeName = 'default' | 'driver';

interface TestMode {
  setup(): Promise<any>;
  teardown(): Promise<void>;
}

export class DriverTestMode implements TestMode {
  async setup() {
    throw new Error('driver test mode is not supported in playwright-ohos');
  }

  async teardown() {
  }
}

export class DefaultTestMode implements TestMode {
  async setup() {
    return require('playwright-core');
  }

  async teardown() {
  }
}
