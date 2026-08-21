// Runtime verification of the multi-version patch set, without a browser.
//
// For every cached playwright-core version the patches are applied to a
// scratch copy and the patched modules are loaded in-process. The patched
// code paths are then exercised with stub objects, covering both the
// ArkWeb branch (the `_hdcBackend` / `_isArkWeb` flags) and the plain
// Chromium branch. Bundle-era versions (1.60+) only get a module load
// check, since their internal classes are not exported.
//
// Usage:
//   node scripts/runtime-verify.mjs                # verify the default list
//   node scripts/runtime-verify.mjs 1.51.0 1.62.1  # verify specific versions
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const cacheDir = path.join(repoRoot, '.pw-versions');
const patch = require(path.join(repoRoot, 'dist/patch.cjs'));
const { compareVersions } = patch;

const DEFAULT_VERSIONS = [
  '1.51.0', '1.51.1', '1.52.0', '1.53.2', '1.54.2', '1.55.1',
  '1.56.1', '1.57.0', '1.58.2', '1.59.1', '1.60.0', '1.61.1', '1.62.1',
];
const versions = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_VERSIONS;

let passed = 0;
let failed = 0;
const failures = [];

const check = (name, ok, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const freshCopy = (version) => {
  const pkgRoot = path.join(cacheDir, version, 'package');
  const work = path.join(cacheDir, `${version}-runtime-verify`);
  fs.rmSync(work, { recursive: true, force: true });
  fs.cpSync(pkgRoot, work, { recursive: true });
  return work;
};

const stubFrame = () => ({
  raceNavigationAction: (...args) => args[args.length - 1](),
  _waitForNavigation: async () => ({ passthrough: true }),
});
const stubProgress = () => ({ race: (promise) => promise, log: () => {} });

// Shared fake context fields; every patch shape finds its field.
const fakeBrowser = (flags) => ({ _hdcBackend: flags.hdc ?? false, _isArkWeb: flags.arkWeb ?? false });
const fakePageShell = (browser) => ({
  browserContext: { _browser: browser },
  _browserContext: { _browser: browser },
});

// ---------------------------------------------------------------------------
// Files-layout checks: the internal server classes are importable.
// ---------------------------------------------------------------------------
const verifyFilesLayout = async (work, version) => {
  const crPageMod = require(path.join(work, 'lib/server/chromium/crPage.js'));
  const pageMod = require(path.join(work, 'lib/server/page.js'));
  const browserContextMod = require(path.join(work, 'lib/server/browserContext.js'));
  const progressMod = require(path.join(work, 'lib/server/progress.js'));

  // 1. crPage._go: history navigation wait (patch-1h-history-navigation).
  for (const hdc of [true, false]) {
    const calls = [];
    const send = async (method, params) => {
      calls.push(method);
      if (method === 'Page.getNavigationHistory')
        return { entries: [{ id: 1, url: 'https://a.example/' }, { id: 2, url: 'https://b.example/' }], currentIndex: 0 };
      if (method === 'Runtime.evaluate')
        return { result: { value: 'https://b.example/' } };
      return {};
    };
    const fakeThis = {
      _mainFrameSession: { _client: { send } },
      _page: fakePageShell(fakeBrowser({ hdc })),
    };
    const result = await crPageMod.CRPage.prototype._go.call(fakeThis, 1);
    if (hdc) {
      check(`_go waits for the URL change (hdc)`, result === 'https://b.example/' && calls.includes('Runtime.evaluate'), `got ${result}`);
    } else {
      check(`_go passes through (chromium)`, result === true && !calls.includes('Runtime.evaluate'), `got ${result}`);
    }
  }

  // 2. page.goBack/goForward: event-based wait skip (patch-1h-go-*).
  // 1.51-1.53 wrap the call in a ProgressController; stub its run method.
  const realRun = progressMod.ProgressController.prototype.run;
  progressMod.ProgressController.prototype.run = function(callback) {
    return callback(stubProgress());
  };
  try {
    for (const [name, delta] of [['goBack', 'back'], ['goForward', 'forward']]) {
      for (const hdc of [true, false]) {
        const browser = fakeBrowser({ hdc });
        const frame = stubFrame();
        const url = `https://example.com/${delta}/`;
        const fakeThis = {
          _browserContext: { _browser: browser },
          browserContext: { _browser: browser },
          _delegate: { [name]: async () => url },
          delegate: { [name]: async () => url },
          mainFrame: () => frame,
          _timeoutSettings: { navigationTimeout: () => 30000 },
        };
        const result = await pageMod.Page.prototype[name].call(fakeThis, stubProgress(), {});
        if (hdc) {
          check(
            `${name} returns the fake response (hdc)`,
            typeof result?.url === 'function' && result.url() === url &&
              String(result?.guid ?? '').startsWith('ohos-history-response-'),
            `got ${JSON.stringify(result?.guid)}`);
        } else {
          check(`${name} passes through (chromium)`, result?.passthrough === true, `got ${JSON.stringify(result)}`);
        }
      }
    }
  } finally {
    progressMod.ProgressController.prototype.run = realRun;
  }

  // 3. crPage screencast frames (patch-8b-screencast-viewport), through the
  // real CRPage/FrameSession wiring: construct a CRPage with a stub CDP
  // client and emit Page.screencastFrame the way a browser would.
  const { EventEmitter } = require('node:events');
  const payload = {
    data: Buffer.from('id').toString('base64'),
    metadata: { deviceWidth: 320.7, deviceHeight: 160.2, timestamp: 1.7 },
  };
  const expectFrame = (frame) => {
    if (!frame || !Buffer.isBuffer(frame.buffer) || !frame.buffer.equals(Buffer.from('id')))
      return 'missing/invalid buffer';
    if (frame.frameSwapWallTime !== 1700)
      return `bad frameSwapWallTime ${frame.frameSwapWallTime}`;
    return null;
  };
  for (const [label, hdc, override, wantW, wantH] of [
    ['hdc with metrics override', true, { width: 300, height: 150 }, 300, 150],
    ['hdc without override rounds device size', true, undefined, 321, 160],
    ['chromium reports raw device size', false, { width: 300, height: 150 }, 320.7, 160.2],
  ]) {
    const client = new EventEmitter();
    client.send = async (method) => {
      if (method === 'Page.getFrameTree')
        return { frameTree: { frame: { id: 'frame-1', url: 'about:blank', loaderId: 'loader-1', mimeType: 'text/html', securityOrigin: '://', unreachableUrl: undefined } } };
      return {};
    };
    let acked = false;
    client._sendMayFail = async () => { acked = true; };
    const fakeBrowserContext = {
      _browser: { _platform: () => 'linux', _hdcBackend: hdc, isClank: () => false, isConnected: () => true },
      _options: {},
      _pages: new Set(),
      _timeoutSettings: { defaultTimeout: () => 30000, navigationTimeout: () => 30000 },
      isSettingStorageState: () => false,
      isCreatingStorageStatePage: () => false,
      instrumentation: { addListener: () => {} },
    };
    // The CRPage constructor kicks off an async _initialize that expects a
    // full CDP browser behind the stub client; its rejections are not what
    // this check verifies, so they are swallowed. The screencast listener
    // is registered synchronously instead.
    const onUnhandled = () => {};
    process.on('unhandledRejection', onUnhandled);
    let crPage;
    try {
      crPage = new crPageMod.CRPage(client, 'target-1', fakeBrowserContext, null, { isBackgroundPage: false, hasUIWindow: false });
    } finally {
      // Give the constructor's microtask chain a tick before unhooking.
      await new Promise((resolve) => setTimeout(resolve, 10));
      process.removeListener('unhandledRejection', onUnhandled);
    }
    let recorded = null;
    crPage._page.on(pageMod.Page.Events.ScreencastFrame, (frame) => { recorded = frame; });
    // From 1.59 the frame goes through the real Screencast collector, which
    // drops frames without clients; record at the collector boundary instead.
    if (typeof crPage._page.screencast?.onScreencastFrame === 'function') {
      crPage._page.screencast.onScreencastFrame = (frame, ack) => {
        recorded = frame;
        if (typeof ack === 'function')
          ack();
      };
    }
    crPage._mainFrameSession._metricsOverride = override;
    crPage._mainFrameSession._addBrowserListeners();
    client.emit('Page.screencastFrame', payload);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const err = expectFrame(recorded);
    const keys = recorded && ('viewportWidth' in recorded ? [recorded.viewportWidth, recorded.viewportHeight] : [recorded.width, recorded.height]);
    check(
      `screencast viewport (${label})`,
      !err && Array.isArray(keys) && keys[0] === wantW && keys[1] === wantH &&
        (compareVersions(version, '1.59.0') < 0 || acked),
      err || `got ${JSON.stringify(keys)}${compareVersions(version, '1.59.0') >= 0 && !acked ? ' (ack not sent)' : ''}`);
  }

  // 4. browserContext.setStorageState: page kept alive (patch-9b-storage-page).
  for (const arkWeb of [true, false]) {
    const calls = { close: [], intercept: [], remove: [] };
    const fakePage = {
      close: async (...args) => { calls.close.push(args); },
      _setServerRequestInterceptor: async (handler) => { calls.intercept.push(handler); },
      addRequestInterceptor: async (...args) => { calls.intercept.push(args.find((arg) => typeof arg === 'function')); },
      removeRequestInterceptor: async (handler) => { calls.remove.push(handler); },
      mainFrame: () => ({ goto: async () => {}, gotoImpl: async () => {}, evaluateExpression: async () => {} }),
    };
    const fakeThis = {
      _browser: { _isArkWeb: arkWeb, options: { name: 'chromium' } },
      _origins: new Set(),
      addCookies: async () => {},
      clearCache: async () => {},
      doClearCookies: async () => {},
      newPage: async () => fakePage,
    };
    await browserContextMod.BrowserContext.prototype.setStorageState.call(
      fakeThis, stubProgress(), { origins: [{ origin: 'https://a.example/' }] }, 'default');
    if (arkWeb) {
      const interceptor = calls.intercept[0];
      const clearedOrRemoved = calls.intercept.some((h) => h === undefined) || calls.remove.includes(interceptor);
      check('setStorageState keeps the page (arkweb)', calls.close.length === 0 && !!interceptor && clearedOrRemoved);
    } else {
      check('setStorageState closes the page (chromium)', calls.close.length === 1);
    }
  }

  // 5. browserContext.newPage failure guard (patch-9c-newpage-guard), 1.55+.
  if (compareVersions(version, '1.55.0') >= 0) {
    for (const arkWeb of [true, false]) {
      const closeCalls = [];
      const fakePage = {
        close: async (...args) => { closeCalls.push(args); },
        waitForInitializedOrError: async () => new Error('boom'),
      };
      const fakeThis = {
        _browser: { _isArkWeb: arkWeb },
        doCreateNewPage: async () => fakePage,
      };
      let threw = null;
      try {
        await browserContextMod.BrowserContext.prototype.newPage.call(fakeThis, stubProgress(), false);
      } catch (error) {
        threw = error;
      }
      check(
        `newPage failure guard (${arkWeb ? 'arkweb' : 'chromium'})`,
        threw?.message === 'boom' && closeCalls.length === (arkWeb ? 0 : 1),
        `threw=${threw?.message}, closes=${closeCalls.length}`);
    }
  }

  // 6. 1.59 cli-client daemon directory (patch-0-daemon-dir).
  if (compareVersions(version, '1.59.0') >= 0) {
    const registryPath = path.join(work, 'lib/tools/cli-client/registry.js');
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    try {
      const loadWithPlatform = (platform, xdg) => {
        Object.defineProperty(process, 'platform', { value: platform, configurable: true });
        const prevXdg = process.env.XDG_CACHE_HOME;
        if (xdg === undefined)
          delete process.env.XDG_CACHE_HOME;
        else
          process.env.XDG_CACHE_HOME = xdg;
        try {
          delete require.cache[require.resolve(registryPath)];
          const { baseDaemonDir } = require(registryPath);
          return baseDaemonDir;
        } finally {
          process.env.XDG_CACHE_HOME = prevXdg;
          if (prevXdg === undefined)
            delete process.env.XDG_CACHE_HOME;
        }
      };
      const os = require('node:os');
      const withXdg = loadWithPlatform('openharmony', '/tmp/xdg-cache');
      const withoutXdg = loadWithPlatform('openharmony', undefined);
      const onLinux = loadWithPlatform('linux', '/tmp/xdg-cache');
      check(
        'daemon dir resolves on openharmony',
        withXdg === path.join('/tmp/xdg-cache', 'ms-playwright', 'daemon') &&
          withoutXdg === path.join(os.homedir(), '.cache', 'ms-playwright', 'daemon') &&
          onLinux === path.join('/tmp/xdg-cache', 'ms-playwright', 'daemon'),
        `got ${withXdg} / ${withoutXdg} / ${onLinux}`);
    } finally {
      Object.defineProperty(process, 'platform', platformDescriptor);
    }
  }
};

// ---------------------------------------------------------------------------
// Bundle-layout checks: only the module graph is reachable.
// ---------------------------------------------------------------------------
const verifyBundleLayout = (work, version) => {
  require(path.join(work, 'lib/coreBundle.js'));
  check('coreBundle.js loads', true);
  const serverIndex = path.join(work, 'lib/server/index.js');
  if (fs.existsSync(serverIndex)) {
    require(serverIndex);
    check('lib/server/index.js loads', true);
  }
};

for (const version of versions) {
  const pkgRoot = path.join(cacheDir, version, 'package');
  if (!fs.existsSync(path.join(pkgRoot, 'package.json'))) {
    console.log(`${version}: cache missing, run scripts/probe-versions.mjs first`);
    continue;
  }
  const work = freshCopy(version);
  const target = patch.detectTarget(work);
  const results = patch.applyPatches(work);
  const missing = results.filter((r) => r.status === 'not-found');
  console.log(`\n${version} (${target.isBundle ? 'bundle' : 'files'} layout)`);
  try {
    if (target.isBundle)
      verifyBundleLayout(work, version);
    else
      await verifyFilesLayout(work, version);
    if (missing.length)
      console.log(`  note: ${missing.length} patch(es) not found: ${missing.map((r) => r.id).join(', ')}`);
  } catch (error) {
    failed += 1;
    failures.push(`${version}: ${error.message}`);
    console.log(`  FAIL harness error — ${error.stack?.split('\n').slice(0, 3).join('\n')}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
for (const failure of failures)
  console.log(`  - ${failure}`);
process.exit(failed ? 1 : 0);
