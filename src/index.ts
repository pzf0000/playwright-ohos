// Main entry of playwright-ohos: re-exports playwright-core and exposes
// the HarmonyOS launcher used by the patches applied to playwright-core.
import * as playwrightCore from 'playwright-core';

export * from 'playwright-core';
export default playwrightCore;

export { HdcBackend, hdcScreenshot } from './os/hdc';
export { resolveOhosAa } from './os/ohos-aa';
export { waitForEndpoint, httpGetJson } from './utils';
export { launchViaHdc, ohosInitScript, resolveLaunchConfig, ARK_WEB_BUNDLE_NAME } from './launcher';
