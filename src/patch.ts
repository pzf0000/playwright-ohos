// Applies the playwright-ohos patches to playwright-core's bundled output
// (lib/coreBundle.js). Each patch is guarded by `process.platform === 'openharmony'`
// or the `_isArkWeb` / `_hdcBackend` browser flags, so other platforms are unaffected.
//
// Patches are idempotent: replacements carry a `@playwright-ohos-patched` marker
// and are skipped when the marker is already present.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const PATCHED_MARKER = '@playwright-ohos-patched';

// Absolute path of the playwright-ohos entry, injected into coreBundle.js so
// the patched code can reach the launcher at runtime.
const INDEX_CJS_PATH = path.join(__dirname, 'index.cjs');
const OHOS_REQUIRE = JSON.stringify(INDEX_CJS_PATH);

interface PatchDefinition {
  id: string;
  description: string;
  find: RegExp;
  replace: (match: string, ...groups: string[]) => string;
}

const marker = (id: string): string => `/* ${PATCHED_MARKER}: ${id} */`;

const patches: PatchDefinition[] = [
  {
    // Allow playwright-core to compute its cache directories on openharmony
    // (otherwise the module graph fails to load).
    id: 'patch-0-cache-dir',
    description: 'openharmony platform cache directory',
    find: /if \(process\.platform === "linux"\)\n\s+return process\.env\.XDG_CACHE_HOME \|\| (import_path\d+)\.default\.join\((import_os\d+)\.default\.homedir\(\), "\.cache"\);/g,
    replace: (match, importPath, importOs) => `${match}
      ${marker('patch-0-cache-dir')}
      if (process.platform === "openharmony") {
        return process.env.XDG_CACHE_HOME || ${importPath}.default.join(${importOs}.default.homedir(), ".cache");
      }`,
  },
  {
    id: 'patch-0-daemon-dir',
    description: 'openharmony daemon session directory',
    find: /if \(process\.platform === "win32"\)\n\s+localCacheDir = process\.env\.LOCALAPPDATA \|\| (import_path\d+)\.default\.join\((import_os\d+)\.default\.homedir\(\), "AppData", "Local"\);\n(\s+)if \(!localCacheDir\)/g,
    replace: (match, importPath, importOs, indent) => `if (process.platform === "win32")
      localCacheDir = process.env.LOCALAPPDATA || ${importPath}.default.join(${importOs}.default.homedir(), "AppData", "Local");
      ${marker('patch-0-daemon-dir')}
      if (process.platform === "openharmony") {
        localCacheDir = process.env.XDG_CACHE_HOME || ${importPath}.default.join(${importOs}.default.homedir(), ".cache");
      }
${indent}if (!localCacheDir)`,
  },
  {
    // chromium.launch() delegates to the HDC launcher on openharmony.
    id: 'patch-1-launch',
    description: 'chromium.launch() delegates to HDC launch',
    find: /launch\(progress2, options2, protocolLogger\) \{\n\s+if \(options2\.channel\?\.startsWith\("bidi-"\)\)\n\s+return this\._bidiChromium\.launch\(progress2, options2, protocolLogger\);\n\s+return super\.launch\(progress2, options2, protocolLogger\);(\n\s+)\}/g,
    replace: (match, indent) => `launch(progress2, options2, protocolLogger) {
        ${marker('patch-1-launch')}
        if (process.platform === "openharmony" && !options2.channel?.startsWith("bidi-")) {
          const { launchViaHdc } = require(${OHOS_REQUIRE});
          return launchViaHdc(this, progress2, options2);
        }
        if (options2.channel?.startsWith("bidi-")) {
          return this._bidiChromium.launch(progress2, options2, protocolLogger);
        }
        return super.launch(progress2, options2, protocolLogger);${indent}}`,
  },
  {
    // launchPersistentContext is not supported: device browsers are
    // started through `aa start` and cannot host persistent contexts.
    id: 'patch-1b-persistent',
    description: 'launchPersistentContext throws an error',
    find: /async launchPersistentContext\(progress2, userDataDir, options2\) \{\n\s+if \(options2\.channel\?\.startsWith\("bidi-"\)\)\n\s+return this\._bidiChromium\.launchPersistentContext\(progress2, userDataDir, options2\);/g,
    replace: () => `async launchPersistentContext(progress2, userDataDir, options2) {
        ${marker('patch-1b-persistent')}
        if (process.platform === "openharmony") {
          throw new Error("launchPersistentContext is not supported on HarmonyOS: device browsers are launched via 'aa start' and do not support persistent contexts.");
        }
        if (options2.channel?.startsWith("bidi-")) {
          return this._bidiChromium.launchPersistentContext(progress2, userDataDir, options2);
        }`,
  },
  {
    // Forward the HDC launcher flags into CRBrowser.connect so they are
    // available before the first page initializes.
    id: 'patch-1c-connect-flags',
    description: 'forward HDC flags to CRBrowser.connect',
    find: /browser\._devtools = devtools;\n\s+if \(browser\.isClank\(\)\)\n\s+browser\._isCollocatedWithServer = false;/g,
    replace: () => `browser._devtools = devtools;
        ${marker('patch-1c-connect-flags')}
        browser._hdcBackend = options2.__ohosHdcBackend || void 0;
        browser._isArkWeb = !!options2.__ohosArkWeb;
        if (browser._hdcBackend) {
          browser._isCollocatedWithServer = false;
        }
        if (browser.isClank()) {
          browser._isCollocatedWithServer = false;
        }`,
  },
  {
    // Pass the launcher flags through the browser options built by
    // _connectOverCDPImpl.
    id: 'patch-1d-connect-options',
    description: 'copy HDC flags into browser options',
    find: /originalLaunchOptions: \{\},\n\s+noDefaults: options2\.noDefaults\n\s+\};/g,
    replace: () => `originalLaunchOptions: {},
            noDefaults: options2.noDefaults,
            ${marker('patch-1d-connect-options')}
            __ohosHdcBackend: options2.__ohosHdcBackend,
            __ohosArkWeb: !!options2.__ohosArkWeb,
            __ohosNoDefaultContext: !!options2.__ohosNoDefaultContext
          };`,
  },
  {
    // Inject the HarmonyOS init script into every page of HDC-launched
    // browsers (navigator.webdriver and rounded touch coordinates).
    id: 'patch-init-script',
    description: 'inject HarmonyOS init script',
    find: /return \[\.\.\.bindings, \.\.\.this\.browserContext\.initScripts, \.\.\.this\.initScripts\];/g,
    replace: () => `{
          ${marker('patch-init-script')}
          const scripts = [...bindings, ...this.browserContext.initScripts, ...this.initScripts];
          if (this.browserContext._browser._hdcBackend) {
            const { ohosInitScript } = require(${OHOS_REQUIRE});
            scripts.push({ source: ohosInitScript });
          }
          return scripts;
        }`,
  },
  {
    // Chromium-based device browsers behave like desktop Chrome and do not
    // need the persistent default context that connectOverCDP normally
    // creates. Skipping it keeps `browser.contexts()` empty after launch.
    id: 'patch-1e-no-default-context',
    description: 'skip the default context for Chromium-based browsers',
    find: /const persistent = \{\n\s+noDefaultViewport: true,\n\s+\.\.\.options2\.noDefaults \? \{ acceptDownloads: "internal-browser-default" \} : \{\}\n\s+\};/g,
    replace: () => `const persistent = options2.__ohosNoDefaultContext ? void 0 : {
            noDefaultViewport: true,
            ...options2.noDefaults ? { acceptDownloads: "internal-browser-default" } : {}
          };`,
  },
  {
    // validateBrowserContextOptions does not accept undefined; only validate
    // when a persistent context is actually created.
    id: 'patch-1f-validate-guard',
    description: 'guard context validation for skipped default context',
    find: /\};\n\s+validateBrowserContextOptions\(persistent, browserOptions\);/g,
    replace: (match) => `};
          if (persistent) {
            validateBrowserContextOptions(persistent, browserOptions);
          }`,
  },
  {
    // ArkWeb reports page targets with type "other"; treat them as pages.
    id: 'patch-2-other-targets',
    description: 'ArkWeb "other" targets recognized as pages',
    find: /const treatOtherAsPage = targetInfo\.type === "other" && process\.env\.PW_CHROMIUM_ATTACH_TO_OTHER;/g,
    replace: () => `const treatOtherAsPage = targetInfo.type === "other" && (process.env.PW_CHROMIUM_ATTACH_TO_OTHER || this._isArkWeb); ${marker('patch-2-other-targets')}`,
  },
  {
    // ArkWeb may omit browserContextId for attached targets; fall back to
    // the default context instead of failing the assertion.
    id: 'patch-2a-context-assert',
    description: 'ArkWeb targets without browserContextId',
    find: /assert\(targetInfo\.browserContextId, "targetInfo: " \+ JSON\.stringify\(targetInfo, null, 2\)\);/g,
    replace: () => `if (!this._isArkWeb) {
          assert(targetInfo.browserContextId, "targetInfo: " + JSON.stringify(targetInfo, null, 2));
        } ${marker('patch-2a-context-assert')}`,
  },
  {
    // ArkWeb never responds to Page.captureScreenshot; capture the display
    // through HDC instead. Other HDC browsers keep the CDP screenshot and
    // only fall back to HDC when it fails.
    id: 'patch-3-screenshot',
    description: 'CDP screenshot HDC fallback',
    find: /async takeScreenshot\(progress2, format2, documentRect, viewportRect, quality, fitsViewport, scale\) \{\n\s+const \{ visualViewport, contentSize, cssContentSize \} = await progress2\.race\(this\._mainFrameSession\._client\.send\("Page\.getLayoutMetrics"\)\);/g,
    replace: () => `async takeScreenshot(progress2, format2, documentRect, viewportRect, quality, fitsViewport, scale) {
        ${marker('patch-3-screenshot')}
        if (this._browserContext._browser._isArkWeb) {
          const { hdcScreenshot } = require(${OHOS_REQUIRE});
          return await hdcScreenshot(this._browserContext._browser._hdcBackend);
        }
        const { visualViewport, contentSize, cssContentSize } = await progress2.race(this._mainFrameSession._client.send("Page.getLayoutMetrics"));`,
  },
  {
    // Fall back to an HDC screenshot when the CDP screenshot fails.
    id: 'patch-3b-screenshot-fallback',
    description: 'CDP screenshot failure falls back to HDC',
    find: /const result2 = await progress2\.race\(this\._mainFrameSession\._client\.send\("Page\.captureScreenshot", \{ format: format2, quality, clip, captureBeyondViewport: !fitsViewport \}\)\);\n\s+return Buffer\.from\(result2\.data, "base64"\);/g,
    replace: () => `try {
          const result2 = await progress2.race(this._mainFrameSession._client.send("Page.captureScreenshot", { format: format2, quality, clip, captureBeyondViewport: !fitsViewport }));
          return Buffer.from(result2.data, "base64");
        } catch (error) {
          ${marker('patch-3b-screenshot-fallback')}
          const hdcBackend = this._browserContext._browser._hdcBackend;
          if (!hdcBackend || format2 !== "png") {
            throw error;
          }
          const { hdcScreenshot } = require(${OHOS_REQUIRE});
          return await hdcScreenshot(hdcBackend);
        }`,
  },
  {
    // ArkWeb ignores Input.dispatchMouseEvent with type "mouseWheel";
    // supplement it with a window.scrollBy evaluation.
    id: 'patch-4-wheel',
    description: 'mouseWheel supplementary scrollBy scroll',
    find: /async wheel\(progress2, x, y, buttons, modifiers, deltaX, deltaY\) \{\n\s+await progress2\.race\(this\._client\.send\("Input\.dispatchMouseEvent", \{\n\s+type: "mouseWheel",\n\s+x,\n\s+y,\n\s+modifiers: toModifiersMask\(modifiers\),\n\s+deltaX,\n\s+deltaY\n\s+\}\)\);\n\s+\}/g,
    replace: () => `async wheel(progress2, x, y, buttons, modifiers, deltaX, deltaY) {
        await progress2.race(this._client.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x,
          y,
          modifiers: toModifiersMask(modifiers),
          deltaX,
          deltaY
        }));
        ${marker('patch-4-wheel')}
        if (this._page._browserContext._browser._isArkWeb) {
          await this._page._mainFrameSession._client.send("Runtime.evaluate", {
            expression: \`window.scrollBy({ left: \${deltaX}, top: \${deltaY}, behavior: "instant" })\`,
            returnByValue: true
          }).catch(() => {});
        }
      }`,
  },
  {
    // ArkWeb cannot create additional browser contexts; reuse the default one.
    id: 'patch-5-reuse-context',
    description: 'ArkWeb reuses the default BrowserContext',
    find: /async doCreateNewContext\(options2\) \{\n\s+const proxy = options2\.proxyOverride \|\| options2\.proxy;\n\s+let proxyBypassList = void 0;/g,
    replace: () => `async doCreateNewContext(options2) {
        ${marker('patch-5-reuse-context')}
        if (this._isArkWeb && this._defaultContext) {
          return this._defaultContext;
        }
        const proxy = options2.proxyOverride || options2.proxy;
        let proxyBypassList = void 0;`,
  },
  {
    // ArkWeb reuses an existing open page of the context.
    id: 'patch-6-reuse-page',
    description: 'ArkWeb reuses an existing page',
    find: /async doCreateNewPage\(\) \{\n\s+const \{ targetId \} = await this\._browser\._session\.send\("Target\.createTarget", \{ url: "about:blank", browserContextId: this\._browserContextId \}\);\n\s+return this\._browser\._crPages\.get\(targetId\)\._page;/g,
    replace: () => `async doCreateNewPage() {
        ${marker('patch-6-reuse-page')}
        if (this._browser._isArkWeb) {
          for (const crPage of this._browser._crPages.values()) {
            if (crPage._browserContext === this && crPage._page._closedState === "open") {
              return crPage._page;
            }
          }
        }
        const { targetId } = await this._browser._session.send("Target.createTarget", { url: "about:blank", browserContextId: this._browserContextId });
        return this._browser._crPages.get(targetId)._page;`,
  },
  {
    // Closing a target blocks the ArkWeb debug channel and creating new
    // targets degrades after a handful of tests, so the page is kept
    // alive (navigated to about:blank) and reused by the next test.
    id: 'patch-6b-close-page',
    description: 'ArkWeb page close keeps the page for reuse',
    find: /async _closePage\(crPage\) \{\n\s+await this\._session\.send\("Target\.closeTarget", \{ targetId: crPage\._targetId \}\);\n\s+\}/g,
    replace: () => `async _closePage(crPage) {
        ${marker('patch-6b-close-page')}
        if (this._isArkWeb) {
          await crPage._mainFrameSession._client.send("Page.navigate", { url: "about:blank" }).catch(() => {});
          return;
        }
        await this._session.send("Target.closeTarget", { targetId: crPage._targetId });
      }`,
  },
  {
    // setStorageState creates a page and closes it in the finally block.
    // On ArkWeb this page doubles as the reused page, so it must stay
    // alive; remove the interceptor instead of closing it.
    id: 'patch-9b-storage-page',
    description: 'keep the storage state page alive on ArkWeb',
    find: /\} finally \{\n\s+if \(mode !== "resetForReuse"\)\n\s+await page\?\.close\(progress2\);\n\s+else if \(interceptor\)\n\s+await page\?\.removeRequestInterceptor\(interceptor\);\n\s+\}/g,
    replace: () => `} finally {
          if (this._browser._isArkWeb) {
            if (interceptor) {
              await page?.removeRequestInterceptor(interceptor);
            }
          } else if (mode !== "resetForReuse") {
            await page?.close(progress2);
          } else if (interceptor) {
            await page?.removeRequestInterceptor(interceptor);
          }
        }`,
  },
  {
    // Do not close the reused page when page creation fails on ArkWeb.
    id: 'patch-9c-newpage-guard',
    description: 'skip page close on newPage failure for ArkWeb',
    find: /\} catch \(error\) \{\n\s+await page\?\.close\(progress2, \{ reason: "Failed to create page" \}\)\.catch\(\(\) => \{\n\s+\}\);\n\s+throw error;/g,
    replace: () => `} catch (error) {
          if (!this._browser._isArkWeb) {
            await page?.close(progress2, { reason: "Failed to create page" }).catch(() => {
            });
          }
          throw error;`,
  },
  {
    // ArkWeb context close cleans up pages, bindings and storage instead
    // of closing the browser.
    id: 'patch-7-context-close',
    description: 'ArkWeb context close cleans up instead of closing the browser',
    find: /async doClose\(reason\) \{\n\s+await this\.dialogManager\.closeBeforeUnloadDialogs\(\);\n\s+if \(!this\._browserContextId\) \{\n\s+return "close-browser";\n\s+\}/g,
    replace: () => `async doClose(reason) {
        await this.dialogManager.closeBeforeUnloadDialogs();
        ${marker('patch-7-context-close')}
        if (this._browser._isArkWeb) {
          for (const binding of this._pageBindings.values()) {
            await binding.dispose().catch(() => {});
          }
          const pages = [...this._crPages()];
          for (const crPage of pages) {
            await this._browser._closePage(crPage).catch(() => {});
          }
          for (const [targetId, serviceWorker] of this._browser._serviceWorkers) {
            if (serviceWorker.browserContext !== this) {
              continue;
            }
            serviceWorker.didClose();
            this._browser._serviceWorkers.delete(targetId);
          }
          try {
            await this._browser._session.send("Storage.clearDataForOrigin", { origin: "*", storageTypes: "all" });
          } catch {
          }
          try {
            await this._browser._session.send("Browser.resetPermissions", { browserContextId: this._browserContextId });
          } catch {
          }
          return;
        }
        if (!this._browserContextId) {
          return "close-browser";
        }`,
  },
  {
    // The reused default context is already "closing" when tests close it
    // a second time, and the regular close path skips emitting Close.
    // Emit it so the dispatcher of this close call notifies the client.
    id: 'patch-7b-close-notify',
    description: 'ArkWeb reused context emits Close on every close',
    find: /if \(!this\._customCloseHandler\)\n\s+this\._didCloseInternal\(\);\n\s+\}\n\s+await this\._closePromise;/g,
    replace: () => `if (!this._customCloseHandler) {
            this._didCloseInternal();
          } else if (this._browser._isArkWeb) {
            this._didCloseInternal();
          }
        }
        await this._closePromise;`,
  },
  {
    // Round bounding boxes reported by the device to fix sub-pixel
    // precision differences.
    id: 'patch-8-bounding-box',
    description: 'boundingBox Math.round (sub-pixel precision fix)',
    find: /const position = await this\._framePosition\(\);\n\s+if \(!position\)\n\s+return null;\n\s+return \{ x: x \+ position\.x, y: y \+ position\.y, width, height \};/g,
    replace: () => `const position = await this._framePosition();
        if (!position) {
          return null;
        }
        ${marker('patch-8-bounding-box')}
        if (this._page.browserContext._browser._hdcBackend) {
          return {
            x: Math.round(x + position.x),
            y: Math.round(y + position.y),
            width: Math.round(width),
            height: Math.round(height)
          };
        }
        return { x: x + position.x, y: y + position.y, width, height };`,
  },
];

export interface PatchResult {
  id: string;
  description: string;
  status: 'applied' | 'already' | 'not-found';
  count: number;
}

export const resolveCoreBundlePath = (): string => {
  const packageJsonPath = require.resolve('playwright-core/package.json');
  return path.join(path.dirname(packageJsonPath), 'lib', 'coreBundle.js');
};

export const applyPatches = (coreBundlePath: string): PatchResult[] => {
  let source = fs.readFileSync(coreBundlePath, 'utf8');
  const results: PatchResult[] = [];
  for (const patch of patches) {
    if (source.includes(`${PATCHED_MARKER}: ${patch.id}`)) {
      results.push({ id: patch.id, description: patch.description, status: 'already', count: 0 });
      continue;
    }
    const matches = [...source.matchAll(patch.find)];
    if (matches.length === 0) {
      results.push({ id: patch.id, description: patch.description, status: 'not-found', count: 0 });
      continue;
    }
    let updated = '';
    let lastIndex = 0;
    for (const match of matches) {
      updated += source.slice(lastIndex, match.index);
      updated += patch.replace(match[0], ...match.slice(1));
      lastIndex = match.index! + match[0].length;
    }
    updated += source.slice(lastIndex);
    source = updated;
    results.push({ id: patch.id, description: patch.description, status: 'applied', count: matches.length });
  }
  fs.writeFileSync(coreBundlePath, source);
  return results;
};

export const checkSyntax = (coreBundlePath: string): boolean => {
  const result = spawnSync(process.execPath, ['--check', coreBundlePath], { encoding: 'utf8' });
  return result.status === 0;
};

export const main = (): void => {
  const coreBundlePath = resolveCoreBundlePath();
  const results = applyPatches(coreBundlePath);
  for (const result of results) {
    console.log(`playwright-ohos: patch ${result.id} (${result.description}): ${result.status}${result.count > 1 ? ` x${result.count}` : ''}`);
  }
  const appliedCount = results.filter(result => result.status === 'applied').length;
  const missing = results.filter(result => result.status === 'not-found');
  if (checkSyntax(coreBundlePath)) {
    console.log(`playwright-ohos: patched ${appliedCount} patch(es) in ${coreBundlePath}`);
  } else {
    console.error(`playwright-ohos: syntax check failed after patching ${coreBundlePath}`);
    process.exitCode = 1;
  }
  if (missing.length) {
    console.warn(`playwright-ohos: warning: ${missing.length} patch(es) not found in ${coreBundlePath}, the playwright-core version may be unsupported`);
    for (const patch of missing) {
      console.warn(`playwright-ohos:   - ${patch.id}: ${patch.description}`);
    }
  }
};

if (require.main === module) {
  main();
}
