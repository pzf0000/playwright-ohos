// Stub replacing the bidi expectation utility which is not applicable to
// chromium-only runs in playwright-ohos.
import type { TestInfo } from '@playwright/test';

export const createSkipTestPredicate = (_expectations: any): (info: TestInfo) => boolean => {
  return () => false;
};
