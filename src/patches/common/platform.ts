// Platform-level patches: guarded by `process.platform === 'openharmony'`
// or the `_hdcBackend` flag, they apply to every device browser.
import { marker, OHOS_REQUIRE } from '../types';
import type { PatchDefinition } from '../types';

// Patches for the single-bundle layout (playwright-core 1.60+).
export const platformBundlePatches: PatchDefinition[] = [
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
    // Playwright ships no ffmpeg for the openharmony platform, so the
    // ffmpeg executable resolves to the system ffmpeg instead of the
    // downloaded one. Requires node builtins only: the resolution runs
    // while coreBundle.js is still loading, before the patched module
    // graph could answer a require of the playwright-ohos entry.
    id: 'patch-0-ffmpeg',
    description: 'ffmpeg executable resolves to the system ffmpeg',
    find: /const ffmpegExecutable = findExecutablePath\((\w+)\.dir, "ffmpeg"\);/g,
    replace: (match, ffmpegName) => `const ffmpegExecutable = process.platform === "openharmony" ? (() => {
        ${marker('patch-0-ffmpeg')}
        const candidates = [];
        try {
          const { execFileSync } = require("child_process");
          const out = execFileSync("sh", ["-c", "command -v ffmpeg 2>/dev/null || true"], { encoding: "utf8", timeout: 8000 }).trim();
          const first = out.split("\\n")[0].trim();
          if (first) {
            candidates.push(first);
          }
        } catch {
        }
        try {
          const { homedir } = require("os");
          const { join } = require("path");
          candidates.push(join(homedir(), ".harmonybrew", "bin", "ffmpeg"));
        } catch {
        }
        for (const candidate of candidates) {
          try {
            if (require("fs").existsSync(candidate)) {
              return candidate;
            }
          } catch {
          }
        }
        return void 0;
      })() : findExecutablePath(${ffmpegName}.dir, "ffmpeg");`,
  },
  {
    // chromium.launch() delegates to the HDC launcher on openharmony.
    id: 'patch-1-launch',
    description: 'chromium.launch() delegates to HDC launch',
    find: /launch\((\w+), (\w+), protocolLogger\) \{\n\s+if \(\2\.channel\?\.startsWith\("bidi-"\)\)\n\s+return this\._bidiChromium\.launch\(\1, \2, protocolLogger\);\n\s+return super\.launch\(\1, \2, protocolLogger\);(\n\s+)\}/g,
    replace: (match, progressName, optionsName, indent) => `launch(${progressName}, ${optionsName}, protocolLogger) {
        ${marker('patch-1-launch')}
        if (process.platform === "openharmony" && !${optionsName}.channel?.startsWith("bidi-")) {
          const { launchViaHdc } = require(${OHOS_REQUIRE});
          return launchViaHdc(this, ${progressName}, ${optionsName});
        }
        if (${optionsName}.channel?.startsWith("bidi-")) {
          return this._bidiChromium.launch(${progressName}, ${optionsName}, protocolLogger);
        }
        return super.launch(${progressName}, ${optionsName}, protocolLogger);${indent}}`,
  },
  {
    // launchPersistentContext is not supported: device browsers are
    // started through `aa start` and cannot host persistent contexts.
    id: 'patch-1b-persistent',
    description: 'launchPersistentContext throws an error',
    find: /async launchPersistentContext\((\w+), userDataDir, (\w+)\) \{\n\s+if \(\2\.channel\?\.startsWith\("bidi-"\)\)\n\s+return this\._bidiChromium\.launchPersistentContext\(\1, userDataDir, \2\);/g,
    replace: (match, progressName, optionsName) => `async launchPersistentContext(${progressName}, userDataDir, ${optionsName}) {
        ${marker('patch-1b-persistent')}
        if (process.platform === "openharmony") {
          throw new Error("launchPersistentContext is not supported on HarmonyOS: device browsers are launched via 'aa start' and do not support persistent contexts.");
        }
        if (${optionsName}.channel?.startsWith("bidi-")) {
          return this._bidiChromium.launchPersistentContext(${progressName}, userDataDir, ${optionsName});
        }`,
  },
  {
    // Forward the HDC launcher flags into CRBrowser.connect so they are
    // available before the first page initializes. The collocated flag was
    // renamed in 1.61, so both names are set.
    id: 'patch-1c-connect-flags',
    description: 'forward HDC flags to CRBrowser.connect',
    find: /static async connect\(parent, transport, (\w+), devtools\) \{[\s\S]*?browser\._devtools = devtools;\n(\s+)if \(browser\.isClank\(\)\)\n\s+browser\._is(?:Browser)?CollocatedWithServer = false;/g,
    replace: (match, optionsName) => {
      const headEnd = match.indexOf('browser._devtools = devtools;') + 'browser._devtools = devtools;'.length;
      return `${match.slice(0, headEnd)}
        ${marker('patch-1c-connect-flags')}
        browser._hdcBackend = ${optionsName}.__ohosHdcBackend || void 0;
        browser._isArkWeb = !!${optionsName}.__ohosArkWeb;
        if (browser._hdcBackend) {
          browser._isCollocatedWithServer = false;
          browser._isBrowserCollocatedWithServer = false;
        }
${match.slice(headEnd)}`;
    },
  },
  {
    // Pass the launcher flags through the browser options built by
    // _connectOverCDPImpl.
    id: 'patch-1d-connect-options',
    description: 'copy HDC flags into browser options',
    find: /originalLaunchOptions: \{\},?\n\s+noDefaults: (\w+)\.noDefaults\n\s+\};/g,
    replace: (match, optionsName) => `originalLaunchOptions: {},
            noDefaults: ${optionsName}.noDefaults,
            ${marker('patch-1d-connect-options')}
            __ohosHdcBackend: ${optionsName}.__ohosHdcBackend,
            __ohosArkWeb: !!${optionsName}.__ohosArkWeb,
            __ohosNoDefaultContext: !!${optionsName}.__ohosNoDefaultContext
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
    // The client validates launch params against a strict schema and drops
    // unknown keys, so the HarmonyOS launch options are registered here.
    // (Bundle layout only for now; older layouts fall back to the
    // HARMONY_* environment variables in resolveLaunchConfig.)
    id: 'patch-1g-launch-schema',
    description: 'register HarmonyOS keys in the launch schema',
    versions: '>=1.60.0',
    find: /scheme\.BrowserTypeLaunchParams = tObject\(\{\n\s+channel: tOptional\(tString\),/g,
    replace: () => `scheme.BrowserTypeLaunchParams = tObject({
      ${marker('patch-1g-launch-schema')}
      harmonyBundleName: tOptional(tString),
      harmonyDebugPort: tOptional(tFloat),
      harmonyAbility: tOptional(tString),
      harmonyLaunchUrl: tOptional(tString),
      harmonyArgs: tOptional(tArray(tString)),
      channel: tOptional(tString),`,
  },
  {
    // ArkWeb reports the physical device size (as a float) instead of the
    // emulated viewport in the screencast frame metadata; the client
    // schema also validates the values as integers. Report the last
    // emulated viewport like desktop Chrome, falling back to the rounded
    // device size when no viewport was ever applied.
    id: 'patch-8b-screencast-viewport',
    description: 'screencast frame viewport reports the emulated viewport',
    find: /const (\w+) = Buffer\.from\((\w+)\.data, "base64"\);\n\s+this\._page\.screencast\.onScreencastFrame\(\{\n\s+\1,\n\s+frameSwapWallTime: \2\.metadata\.timestamp \? \2\.metadata\.timestamp \* 1e3 : Date\.now\(\),\n\s+viewportWidth: \2\.metadata\.deviceWidth,\n\s+viewportHeight: \2\.metadata\.deviceHeight\n\s+\}, \(\) => \{/g,
    replace: (match, bufferName, payloadName) => `const ${bufferName} = Buffer.from(${payloadName}.data, "base64");
        ${marker('patch-8b-screencast-viewport')}
        this._page.screencast.onScreencastFrame({
          buffer: ${bufferName},
          frameSwapWallTime: ${payloadName}.metadata.timestamp ? ${payloadName}.metadata.timestamp * 1e3 : Date.now(),
          viewportWidth: this._page.browserContext._browser._hdcBackend ? (this._metricsOverride?.width ?? Math.round(${payloadName}.metadata.deviceWidth)) : ${payloadName}.metadata.deviceWidth,
          viewportHeight: this._page.browserContext._browser._hdcBackend ? (this._metricsOverride?.height ?? Math.round(${payloadName}.metadata.deviceHeight)) : ${payloadName}.metadata.deviceHeight
        }, () => {`,
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

// Patches for the separate-file layout (playwright-core 1.51-1.59).
export const platformFilesPatches: PatchDefinition[] = [
  {
    id: 'patch-0-ffmpeg',
    description: 'ffmpeg executable resolves to the system ffmpeg',
    file: 'lib/server/registry/index.js',
    versions: '>=1.51.0 <1.60.0',
    find: /const ffmpegExecutable = findExecutablePath\((\w+)\.dir, ['"]ffmpeg['"]\);/g,
    replace: (match, ffmpegName) => `const ffmpegExecutable = process.platform === 'openharmony' ? (() => {
      ${marker('patch-0-ffmpeg')}
      const candidates = [];
      try {
        const { execFileSync } = require('child_process');
        const out = execFileSync('sh', ['-c', 'command -v ffmpeg 2>/dev/null || true'], { encoding: 'utf8', timeout: 8000 }).trim();
        const first = out.split('\\n')[0].trim();
        if (first) {
          candidates.push(first);
        }
      } catch {
      }
      try {
        const { homedir } = require('os');
        const { join } = require('path');
        candidates.push(join(homedir(), '.harmonybrew', 'bin', 'ffmpeg'));
      } catch {
      }
      for (const candidate of candidates) {
        try {
          if (require('fs').existsSync(candidate)) {
            return candidate;
          }
        } catch {
        }
      }
      return void 0;
    })() : findExecutablePath(${ffmpegName}.dir, 'ffmpeg');`,
  },
  {
    id: 'patch-0-cache-dir',
    description: 'openharmony platform cache directory',
    file: 'lib/server/registry/index.js',
    versions: '>=1.51.0 <1.52.0',
    find: /(if \(process\.platform === 'linux'\) cacheDirectory = process\.env\.XDG_CACHE_HOME \|\| (\w+)\.default\.join\((\w+)\.default\.homedir\(\), '\.cache'\);)(else if \(process\.platform === 'darwin'\))/g,
    replace: (match, linuxBranch, importPath, importOs, darwinBranch) => `${linuxBranch}${marker('patch-0-cache-dir')}else if (process.platform === 'openharmony') cacheDirectory = process.env.XDG_CACHE_HOME || ${importPath}.default.join(${importOs}.default.homedir(), '.cache');${darwinBranch}`,
  },
  {
    id: 'patch-0-cache-dir',
    description: 'openharmony platform cache directory',
    file: 'lib/server/registry/index.js',
    versions: '>=1.52.0 <1.59.0',
    find: /if \(process\.platform === "linux"\)\n\s+cacheDirectory = process\.env\.XDG_CACHE_HOME \|\| (\w+)\.default\.join\((\w+)\.default\.homedir\(\), "\.cache"\);/g,
    replace: (match, importPath, importOs) => `${match}
      ${marker('patch-0-cache-dir')}
      if (process.platform === "openharmony") {
        cacheDirectory = process.env.XDG_CACHE_HOME || ${importPath}.default.join(${importOs}.default.homedir(), ".cache");
      }`,
  },
  {
    id: 'patch-0-cache-dir',
    description: 'openharmony platform cache directory',
    file: 'lib/server/registry/index.js',
    versions: '>=1.59.0 <1.60.0',
    find: /if \(process\.platform === "linux"\)\n\s+return process\.env\.XDG_CACHE_HOME \|\| (\w+)\.default\.join\((\w+)\.default\.homedir\(\), "\.cache"\);/g,
    replace: (match, importPath, importOs) => `${match}
      ${marker('patch-0-cache-dir')}
      if (process.platform === "openharmony") {
        return process.env.XDG_CACHE_HOME || ${importPath}.default.join(${importOs}.default.homedir(), ".cache");
      }`,
  },
  {
    // 1.51-1.53 run the launch inside a ProgressController callback; inject
    // at the top of the callback so a Progress instance is available.
    id: 'patch-1-launch',
    description: 'chromium.launch() delegates to HDC launch',
    file: 'lib/server/browserType.js',
    versions: '>=1.51.0 <1.54.0',
    find: /const seleniumHubUrl = options\.__testHookSeleniumRemoteURL \|\| process\.env\.SELENIUM_REMOTE_URL;/g,
    replace: () => `const seleniumHubUrl = options.__testHookSeleniumRemoteURL || process.env.SELENIUM_REMOTE_URL;
      ${marker('patch-1-launch')}
      if (process.platform === 'openharmony' && this._name === 'chromium' && !options.channel?.startsWith('bidi-')) {
        const { launchViaHdc } = require(${OHOS_REQUIRE});
        return launchViaHdc(this, progress, options);
      }`,
  },
  {
    id: 'patch-1-launch',
    description: 'chromium.launch() delegates to HDC launch',
    file: 'lib/server/browserType.js',
    versions: '>=1.54.0 <1.60.0',
    find: /options = this\._validateLaunchOptions\(options\);\n\s+const seleniumHubUrl = /g,
    replace: (match) => `options = this._validateLaunchOptions(options);
    ${marker('patch-1-launch')}
    if (process.platform === "openharmony" && this._name === "chromium" && !options.channel?.startsWith("bidi-")) {
      const { launchViaHdc } = require(${OHOS_REQUIRE});
      return launchViaHdc(this, progress, options);
    }
    const seleniumHubUrl = `,
  },
  {
    id: 'patch-1b-persistent',
    description: 'launchPersistentContext throws an error',
    file: 'lib/server/browserType.js',
    find: /const launchOptions = this\._validateLaunchOptions\(options\);/g,
    replace: () => `const launchOptions = this._validateLaunchOptions(options);
    ${marker('patch-1b-persistent')}
    if (process.platform === "openharmony" && this._name === "chromium") {
      throw new Error("launchPersistentContext is not supported on HarmonyOS: device browsers are launched via 'aa start' and do not support persistent contexts.");
    }`,
  },
  {
    id: 'patch-1c-connect-flags',
    description: 'forward HDC flags to CRBrowser.connect',
    file: 'lib/server/chromium/crBrowser.js',
    versions: '>=1.51.0 <1.52.0',
    find: /browser\._devtools = devtools;\n\s+if \(browser\.isClank\(\)\) browser\._isCollocatedWithServer = false;/g,
    replace: () => `browser._devtools = devtools;
    ${marker('patch-1c-connect-flags')}
    browser._hdcBackend = options.__ohosHdcBackend || void 0;
    browser._isArkWeb = !!options.__ohosArkWeb;
    if (browser.isClank()) {
      browser._isCollocatedWithServer = false;
    }`,
  },
  {
    id: 'patch-1c-connect-flags',
    description: 'forward HDC flags to CRBrowser.connect',
    file: 'lib/server/chromium/crBrowser.js',
    versions: '>=1.52.0 <1.60.0',
    find: /browser\._devtools = devtools;\n\s+if \(browser\.isClank\(\)\)\n\s+browser\._isCollocatedWithServer = false;/g,
    replace: () => `browser._devtools = devtools;
    ${marker('patch-1c-connect-flags')}
    browser._hdcBackend = options.__ohosHdcBackend || void 0;
    browser._isArkWeb = !!options.__ohosArkWeb;
    if (browser.isClank()) {
      browser._isCollocatedWithServer = false;
    }`,
  },
  {
    id: 'patch-1d-connect-options',
    description: 'copy HDC flags into browser options',
    file: 'lib/server/chromium/chromium.js',
    find: /(originalLaunchOptions: [^,\n]*),?/g,
    replace: (match, optionsLine) => `${optionsLine},
      ${marker('patch-1d-connect-options')}
      __ohosHdcBackend: options.__ohosHdcBackend,
      __ohosArkWeb: !!options.__ohosArkWeb,
      __ohosNoDefaultContext: !!options.__ohosNoDefaultContext`,
  },
  {
    id: 'patch-init-script',
    description: 'inject HarmonyOS init script',
    file: 'lib/server/page.js',
    versions: '>=1.51.0 <1.52.0',
    find: /return \[\.\.\.bindings\.map\(binding => binding\.initScript\), \.\.\.this\._browserContext\.initScripts, \.\.\.this\.initScripts\];/g,
    replace: () => `{
      ${marker('patch-init-script')}
      const scripts = [...bindings.map(binding => binding.initScript), ...this._browserContext.initScripts, ...this.initScripts];
      if (this._browserContext._browser._hdcBackend) {
        const { ohosInitScript } = require(${OHOS_REQUIRE});
        scripts.push({ source: ohosInitScript });
      }
      return scripts;
    }`,
  },
  {
    id: 'patch-init-script',
    description: 'inject HarmonyOS init script',
    file: 'lib/server/page.js',
    versions: '>=1.52.0 <1.53.0',
    find: /return \[kBuiltinsScript, \.\.\.bindings\.map\(\(binding\) => binding\.initScript\), \.\.\.this\._browserContext\.initScripts, \.\.\.this\.initScripts\];/g,
    replace: () => `{
      ${marker('patch-init-script')}
      const scripts = [kBuiltinsScript, ...bindings.map((binding) => binding.initScript), ...this._browserContext.initScripts, ...this.initScripts];
      if (this._browserContext._browser._hdcBackend) {
        const { ohosInitScript } = require(${OHOS_REQUIRE});
        scripts.push({ source: ohosInitScript });
      }
      return scripts;
    }`,
  },
  {
    id: 'patch-init-script',
    description: 'inject HarmonyOS init script',
    file: 'lib/server/page.js',
    versions: '>=1.53.0 <1.60.0',
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
    id: 'patch-8b-screencast-viewport',
    description: 'screencast frame viewport reports the emulated viewport',
    file: 'lib/server/chromium/crPage.js',
    versions: '>=1.51.0 <1.60.0',
    find: /const (\w+) = Buffer\.from\((\w+)\.data, ['"]base64['"]\);\n\s+this\._page\.screencast\.onScreencastFrame\(\{\n\s+\1,\n\s+frameSwapWallTime: \2\.metadata\.timestamp \? \2\.metadata\.timestamp \* 1e3 : Date\.now\(\),\n\s+viewportWidth: \2\.metadata\.deviceWidth,\n\s+viewportHeight: \2\.metadata\.deviceHeight/g,
    replace: (match, bufferName, payloadName) => `const ${bufferName} = Buffer.from(${payloadName}.data, 'base64');
      ${marker('patch-8b-screencast-viewport')}
      this._page.screencast.onScreencastFrame({
        buffer: ${bufferName},
        frameSwapWallTime: ${payloadName}.metadata.timestamp ? ${payloadName}.metadata.timestamp * 1e3 : Date.now(),
        viewportWidth: this._page.browserContext._browser._hdcBackend ? (this._metricsOverride?.width ?? Math.round(${payloadName}.metadata.deviceWidth)) : ${payloadName}.metadata.deviceWidth,
        viewportHeight: this._page.browserContext._browser._hdcBackend ? (this._metricsOverride?.height ?? Math.round(${payloadName}.metadata.deviceHeight)) : ${payloadName}.metadata.deviceHeight`,
  },
  {
    id: 'patch-8-bounding-box',
    description: 'boundingBox Math.round (sub-pixel precision fix)',
    file: 'lib/server/chromium/crPage.js',
    versions: '>=1.51.0 <1.52.0',
    find: /const position = await this\._framePosition\(\);\n\s+if \(!position\) return null;\n\s+return \{/g,
    replace: () => `const position = await this._framePosition();
    if (!position) return null;
    ${marker('patch-8-bounding-box')}
    if (this._page._browserContext._browser._hdcBackend) {
      return {
        x: Math.round(x + position.x),
        y: Math.round(y + position.y),
        width: Math.round(width),
        height: Math.round(height)
      };
    }
    return {`,
  },
  {
    id: 'patch-8-bounding-box',
    description: 'boundingBox Math.round (sub-pixel precision fix)',
    file: 'lib/server/chromium/crPage.js',
    versions: '>=1.52.0 <1.53.0',
    find: /const position = await this\._framePosition\(\);\n\s+if \(!position\)\n\s+return null;\n\s+return \{ x: x \+ position\.x, y: y \+ position\.y, width, height \};/g,
    replace: () => `const position = await this._framePosition();
        if (!position) {
          return null;
        }
        ${marker('patch-8-bounding-box')}
        if (this._page._browserContext._browser._hdcBackend) {
          return {
            x: Math.round(x + position.x),
            y: Math.round(y + position.y),
            width: Math.round(width),
            height: Math.round(height)
          };
        }
        return { x: x + position.x, y: y + position.y, width, height };`,
  },
  {
    id: 'patch-8-bounding-box',
    description: 'boundingBox Math.round (sub-pixel precision fix)',
    file: 'lib/server/chromium/crPage.js',
    versions: '>=1.53.0 <1.60.0',
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
