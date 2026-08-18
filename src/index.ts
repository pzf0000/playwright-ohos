// Main entry of playwright-ohos: re-exports playwright-core and exposes
// the HarmonyOS launcher used by the patches applied to playwright-core.
import * as playwrightCore from 'playwright-core';

export * from 'playwright-core';
export default playwrightCore;

import { HdcBackend, hdcScreenshot } from './os/hdc';
export { HdcBackend, hdcScreenshot };
export { resolveOhosAa } from './os/ohos-aa';
export { waitForEndpoint, httpGetJson } from './utils';
export { launchViaHdc, ohosInitScript, resolveLaunchConfig, ARK_WEB_BUNDLE_NAME } from './launcher';

/**
 * Public screenshot API: uses the native page screenshot (which supports
 * clip/format/quality on the device browsers) and falls back to the HDC
 * display capture when it fails.
 */
export const takeScreenshot = async (page: any, options: any = {}): Promise<Buffer> => {
  try {
    return await page.screenshot(options);
  } catch (error) {
    const hdcBackend = page.context?.().browser?.()._hdcBackend;
    if (!hdcBackend || (options.type && options.type !== 'png')) {
      throw error;
    }
    return await hdcScreenshot(hdcBackend);
  }
};
