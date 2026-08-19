# playwright-ohos

[Playwright](https://github.com/microsoft/playwright) adapter and patches for HarmonyOS. On HarmonyOS, `chromium.launch()` automatically connects to a device browser via HDC, with no changes to your code.

## Prerequisits

- Node.js >= 24

- A HarmonyOS device with Developer Options and USB debugging enabled

- `hdc` (HarmonyOS Device Connector) installed and available in PATH

- `ffmpeg` (video recording and screencast): install it through HarmonyBrew with `brew install ffmpeg`. On HarmonyOS playwright-ohos resolves the system ffmpeg automatically, no `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE` needed.

## Installation

```bash
npm install @ohos-ports/playwright playwright-core@1.60.0
```

After installaton, the `postinstall` script patches `playwright-core` automatically. If teh auto-patch fails, run it manually:

```bash
npx playwright-ohos
```

## Quick Start

```typescript
import { chromium } from 'playwright-core';

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto('https://example.com');
console.log(await page.title());

await browser.close();
```

You can learn more at the [home page of playwright](https://github.com/microsoft/playwright).

**No code changes required** - On a HarmonyOS devoce, `chromium.launch()` automatically starts the browser via HDC and opens a debugging connection. On other platforms, behavior is unchanged.

## Browser Selection

Select a browser through Playwright's standard `channel` option:

| Channel | Browser | Engine | Package |
| --- | --- | --- | --- |
| `'huaweiBrowser'` (default) | Huawei Browser | ArkWeb | `com.huawei.hmos.browser` |
| `'chrome`' | Haitai Browser | Chromium | `com.haitai.htbrowser` |
| `'chrome-beta`' |  | Chromium | `com.huawei.ohos_chromium` |

```typescript
// Default - Huawei Browser
const browser = await chromium.launch();

// Haitai Browser
const browser = await chromium.launch({ channel: 'chrome' });

// Chrome for Dev
const browser = await chromium.launch({ channel: 'chrome-beta' });
```

When `channel` is omitted, the Huawei Browser is launched by default. You can also pass any browser package name via the `harmonyBundleName` option, or select a browser via the `HARMONY_BROWSER` environment variable (see below).

## Using with Playwright Test

Configure a project per browser in `plawright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    workers: 1,
    projects: [
        {
            name: 'Huawei Brower',
            use: { ...devices['Desktop Chrome'], channel: 'huaweiBrowser' },
        },
        {
            name: 'haitai',
            use: { ...devices['Desktop Chrome'], channel: 'chrome' },
        },
        {
            name: 'chrome-beta',
            use: { ...devices['Desktop Chrome'], channel: 'chrome-beta' },
        },
    ],
});
```

Then run each browser's tests separately:

```bash
npx playwright test --project="huawei Browser"
npx playwright test --project=haitai
npx playwright test --project=chrome-beta
```

> **Note:** Do not run different browsers in parallel - they contend for the same debug port. Always use `workers: 1`.

## Test Coverage

playwright-ohos is validated against the official Playwright test suite, which consists of two kinds of tests:

- **Page-level tests** - exercise the high-level Page API: navigation, interaction, screenshots and assertions.
- **Library-level tests** - exercise the lower-level browser APIs: browser and context lifecycle, network, downloads and the browser object itself.

The table below shows the merged pass rate after four test rounds: round 1 runs the full suite, round 2 reruns the round-1 failures, round 3 reruns the round-2 failures plus every test skipped in the earlier rounds, and round 4 reruns the round-3 failures; a test counts as passed when it passes in any round. A test whose latest recorded outcome is skipped is excluded from the denominator. Pass rate = passed / (total - skipped). Compute the merged totals with `node scripts/merge-rounds.mjs 4`.

| Test Category | Huawei Browser | Haitai Browser |
| --- | --- | --- |
| Page-level tests | 93.13% | 97.80% |
| Library-level tests | 63.33% | 84.12% |
| **All tests** | **81.26%** | **92.36%** |


## Launch Options

`chromium.launch()` accepts the standard Playwright options; the following additional options control the HarmonyOS launcher:

| Option | Type | Description |
| --- | --- | --- |
| `channel` | `string` | Selects the browser: `'huaweiBrowser'` (default), `'chrome'` (Haitai Browser) or `'chrome-beta'` (Chrome for Dev). |
| `harmonyBundleName` | `string` | Overrides the browser bundle name, e.g. `'com.huawei.hmos.browser'`. The ability defaults to `MainAbility` for unknown bundles. |
| `harmonyDebugPort` | `number` | Overrides the debug port for TCP-based browsers. Browsers that accept launch arguments pick a free port automatically; fixed-port browsers (such as Chrome for Dev) use `9222`. |
| `harmonyAbility` | `string` | Overrides the ability name used in `aa start`, e.g. `'EntryAbility'`. |
| `harmonyLaunchUrl` | `string` | Opens the given URL at launch (`aa start -U <url>`). Useful for the Huawei Browser, whose default page has no debuggable content. |
| `harmonyArgs` | `string[]` | Extra command-line flags appended to the default stability flags for browsers that accept launch arguments. |

Other launch options (`headless`, `args`, `executablePath`, `proxy`, ...) are accepted for compatibility but ignored on HarmonyOS: browsers are started through `aa start` and cannot receive arbitrary command-line arguments.

`takeScreenshot(page, options)` is exported by playwright-ohos: it uses the native page screenshot (which supports `clip`, `format` and `quality`) and falls back to the HDC display capture when that fails.

## Environment Variables

| Variable | Description |
| --- | --- |
| `HARMONY_BROWSER` | Selects the browser bundle name (or a known channel name such as `chrome`). Takes precedence over the `channel` option. |
| `HARMONY_DEBUG_PORT` | Overrides the debug port for TCP-based browsers. |
| `HDC_BINARY` | Path to the `hdc` executable when it is not available in `PATH`. |

## Known Limitations

The following features are restricted by ArkWeb and are unsupported on behave inconsistently.

- `window.open()`: blocks the debug channel on ArkWeb; popup detection is unavailable.

- `launchPersistentContext`: HarmonyOS browsers launch via `aa start` and do not support persistent contexts; Calling this throws an error.

- **Page close:** ArkWeb reuses existing pages; `page.close()` disconnects the browser. Avoid closing page in tests -- let `context.close()` handle cleanup.

- **Screenshots:** `page.screenshot()` uses the native CDP screenshot, which supports `clip`, `format` and `quality`; it falls back to the HDC display capture only when the CDP call fails. Layout-dependent commands such as `boundingBox()` and `scrollIntoViewIfNeeded()` may be inaccurate.

Chromium-based browsers (such as Haitai Browser) are not affected by the ArkWeb limitations above, except `launchPersistentContext`, which is unsupported on HarmonyOS in general.

## How It Works

### Patch Mechanism

Playwright has no plugin system, for registering browser types - the browser types are hardcoded in `playwright-core`. DUring `postinstall`, This paclage inject 27 patches into `playwright-core`'s bundled output (`coreBundle.js`).

Patches are marked with `/* @playwright-ohos-patched */` to prevent duplicated application. Run `npx playwright-ohos` to re-apply the patches.

### Platform Guard

Patches only take effect on the `openharmony` platform; other platforms are completely unaffected. Some patches are further scoped to ArkWeb (Huawei Browser) via the `_isArkWeb` flag, so they do not affect Chromium-based based browsers.

### Patch List

#### Common

| Patch | Purpose | Guard |
| --- | --- | --- |
| Patch 0 | openharmony platform cache and daemon directories | `process.platform === 'openharmony'` |
| Patch 0-ffmpeg | ffmpeg resolves to the system ffmpeg executable | `process.platform === 'openharmony'` |
| Patch 1 | `chromium.launch()` delegates to HDC launch | `process.platform === 'openharmony'` |
| Patch 1b | `launchPersistentContext` throws an error | `process.platform === 'openharmony'` |
| Patch 1c/1d | HDC backend and ArkWeb flags forwarded through `CRBrowser.connect` | `process.platform === 'openharmony'` |
| Patch 1g | registers the HarmonyOS options in the launch schema (option passthrough) | `process.platform === 'openharmony'` |
| Patch 1h | history navigation waits for the URL change; goBack/goForward skip the event-based wait | `_hdcBackend` |
| Patch init-script | injects the HarmonyOS init script (`navigator.webdriver`, touch coordinate rounding, contextmenu synthesis) | `_hdcBackend` |
| Patch 3b | CDP screenshot falls back to the HDC display capture on failure | `_hdcBackend` |
| Patch 8 | `boundingBox` `Math.round` (sub-pixel precision fix) | `_hdcBackend` |
| Patch 8b | screencast frame viewport reports the emulated viewport | `_hdcBackend` |

#### Haitai Browser

| Patch | Purpose | Guard |
| --- | --- | --- |
| Patch 1e/1f | skip the default browser context for Chromium-based browsers | `__ohosNoDefaultContext` |

#### Huawei Browser

| Patch | Purpose | Guard |
| --- | --- | --- |
| Patch 2/2a | ArkWeb `type: "other"` targets recognized as pages | `_isArkWeb` |
| Patch 2b | startup page history reset on attach | `_isArkWeb` |
| Patch 5 | ArkWeb reuses the default BrowserContext; the requested viewport, touch and mobile options are applied to it | `_isArkWeb` |
| Patch 6/6b | ArkWeb reuses an existing page; closing navigates to `about:blank` | `_isArkWeb` |
| Patch 7/7b | ArkWeb context close cleans up instead of closing the browser; close events re-emitted | `_isArkWeb` |
| Patch 9b/9c | storage-state page kept alive; `newPage` failure guard | `_isArkWeb` |

### HDC Connection Flow

1. Connect to the device via `hdc`
2. `force-stop` the target browser to clear leftover processes
3. Launch the browser via `aa start` with remote debugging parameters
4. Discover the CDP debug andd point (Unix socket or TCP port)
5. Set up port forwarding and connect to the browser via WebSocket

### Version Support

`peerDependencies` declares `playwright-core >= 1.51.0 <=1.62.1`. Patches target the bundled output across this version range and have been verified against it.