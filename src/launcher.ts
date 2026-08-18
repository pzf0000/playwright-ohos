// Launches on-device browsers through HDC or ohos-aa and wires them into
// playwright-core's Chromium implementation.
import { HdcBackend } from './os/hdc';
import { execOhosAa, resolveOhosAa } from './os/ohos-aa';
import { getFreePort, sleep, waitForEndpoint } from './utils';

export interface LaunchConfig {
  bundleName: string;
  abilityName: string;
  /** 'tcp' browsers listen on a TCP port; 'socket' browsers expose a Unix socket. */
  kind: 'tcp' | 'socket';
  /** Fixed debug port for browsers that cannot receive one through arguments. */
  port?: number;
  /** Whether the browser accepts extra arguments through the `cmdArgs` parameter. */
  supportsCmdArgs?: boolean;
  /** URL opened at launch (aa start -U). */
  launchUrl?: string;
  /** Extra command-line flags appended to the default stability flags. */
  extraArgs?: string[];
}

// Stability flags for browsers launched through cmdArgs; test runs should
// not be disturbed by first-run screens, sync or component updates.
const DEFAULT_CMDARGS_FLAGS = [
  '--no-first-run',
  '--disable-extensions',
  '--disable-sync',
  '--disable-default-apps',
  '--disable-background-networking',
  '--disable-component-update',
  '--no-default-browser-check',
];

const DEVTOOLS_SOCKET_PATTERN = /@(webview_devtools_remote_\d+)/;

const KNOWN_BROWSERS: Record<string, LaunchConfig> = {
  huaweiBrowser: {
    bundleName: 'com.huawei.hmos.browser',
    abilityName: 'MainAbility',
    kind: 'socket',
  },
  chrome: {
    bundleName: 'com.haitai.htbrowser',
    abilityName: 'EntryAbility',
    kind: 'tcp',
    supportsCmdArgs: true,
  },
  'chrome-beta': {
    bundleName: 'com.huawei.ohos_chromium',
    abilityName: 'BrowserAbility',
    kind: 'tcp',
    port: 9222,
  },
};

export const ARK_WEB_BUNDLE_NAME = 'com.huawei.hmos.browser';

export const resolveLaunchConfig = (options: { channel?: string; harmonyBundleName?: string; harmonyDebugPort?: number; harmonyAbility?: string; harmonyLaunchUrl?: string; harmonyArgs?: string[] }): LaunchConfig => {
  const envBrowser = process.env.HARMONY_BROWSER;
  // The launch schema strips unknown keys on playwright-core < 1.60
  // (patch-1g registers them for 1.60+), so env fallbacks cover both.
  const ability = options.harmonyAbility ?? process.env.HARMONY_ABILITY;
  const launchUrl = options.harmonyLaunchUrl ?? process.env.HARMONY_LAUNCH_URL;
  const custom = options.harmonyBundleName || (envBrowser && !KNOWN_BROWSERS[envBrowser] ? envBrowser : undefined);
  const channel = envBrowser && KNOWN_BROWSERS[envBrowser] ? envBrowser : (options.channel ?? 'huaweiBrowser');
  const known = KNOWN_BROWSERS[channel];
  const config: LaunchConfig = known ? { ...known } : { bundleName: channel, abilityName: 'MainAbility', kind: 'socket' };
  if (custom) {
    config.bundleName = custom;
  }
  if (ability) {
    config.abilityName = ability;
  }
  if (launchUrl) {
    config.launchUrl = launchUrl;
  }
  if (options.harmonyArgs?.length) {
    config.extraArgs = options.harmonyArgs;
  }
  const port = options.harmonyDebugPort ?? (process.env.HARMONY_DEBUG_PORT ? Number(process.env.HARMONY_DEBUG_PORT) : undefined);
  if (port) {
    config.port = port;
  }
  return config;
};

const findDevtoolsSocket = async (hdc: HdcBackend, timeoutMs = 30000): Promise<string> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // Run `cat /proc/net/unix` and `ps` separately: merging their output
    // truncates the socket list on the device.
    const unixResult = await hdc.shell('cat /proc/net/unix').catch(() => ({ stdout: '', stderr: '', code: 1 }));
    const matches = unixResult.stdout.match(new RegExp(DEVTOOLS_SOCKET_PATTERN.source, 'g')) || [];
    const sockets = matches.map(match => match.slice(1));
    if (sockets.length) {
      const psResult = await hdc.shell('ps -ef').catch(() => ({ stdout: '', stderr: '', code: 1 }));
      for (const socket of sockets) {
        const pid = socket.split('_').pop()!;
        if (psResult.stdout.includes(pid)) {
          return socket;
        }
      }
    }
    await sleep(500);
  }
  throw new Error('DevTools socket was not found on the device');
};

// The installed-bundle list is queried once per process: querying `bm` on
// every launch stalls under test load and its failures must not block the
// launch (a failed query means "unknown", not "missing").
let installedBundlesCache: string | null = null;
const assertBrowserInstalled = async (hdc: HdcBackend, bundleName: string): Promise<void> => {
  if (installedBundlesCache === null) {
    const result = await hdc.shell('bm dump -a').catch(() => ({ stdout: '', stderr: '', code: 1 }));
    installedBundlesCache = result.code === 0 ? result.stdout : '';
  }
  if (installedBundlesCache && !installedBundlesCache.includes(bundleName)) {
    throw new Error(`browser ${bundleName} is not installed on the device`);
  }
};

// Transient hdc failures happen under test load; critical commands get one
// retry, cleanup commands only warn.
const hdcShellWithRetry = async (hdc: HdcBackend, command: string, attempts = 2) => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await hdc.shell(command);
    } catch (error) {
      if (attempt === attempts - 1) {
        throw error;
      }
      await sleep(1000);
    }
  }
  return { stdout: '', stderr: '', code: 1 };
};

// ohos-aa force-stops the browser without a device connection, covering
// close and pre-launch cleanup when the HDC shell is unavailable.
const ohosAaForceStop = (ohosAa: string) => async (bundleName: string): Promise<void> => {
  await execOhosAa(ohosAa, ['force-stop', '--bundlename', bundleName]);
};

const startBrowserViaHdc = async (hdc: HdcBackend, config: LaunchConfig): Promise<string> => {
  if (process.env.PW_OHOS_DEBUG === '1') {
    console.log(`[playwright-ohos] launch config: ${JSON.stringify(config)}`);
  }
  const ohosAa = resolveOhosAa();
  // The socket path always needs an HDC connection; the tcp path needs one
  // only when ohos-aa is unavailable. A failed check must not block the
  // launch: the device is usually already connected.
  if (!ohosAa || config.kind === 'socket') {
    await hdc.ensureDeviceConnected().catch(error => {
      console.warn(`[playwright-ohos] device connection check failed: ${String(error.message).slice(0, 100)}`);
    });
  }
  await assertBrowserInstalled(hdc, config.bundleName);
  await hdc.cleanupStaleForwards();
  // Best-effort cleanup: a failed force-stop under load must not block the
  // launch, aa start brings the browser up regardless.
  await hdc.shell(`aa force-stop ${config.bundleName}`).catch(async error => {
    console.warn(`[playwright-ohos] force-stop ${config.bundleName} failed: ${String(error.message).slice(0, 100)}`);
    if (ohosAa) {
      await ohosAaForceStop(ohosAa)(config.bundleName).catch(() => {});
    }
  });
  if (config.kind === 'tcp') {
    // Browsers that accept cmdArgs pick a free local port so an occupied
    // default port never blocks the launch; fixed-port browsers use 9222.
    const port = config.port ?? (config.supportsCmdArgs ? await getFreePort() : 9222);
    const cmdArgs = config.supportsCmdArgs
      ? [...DEFAULT_CMDARGS_FLAGS, ...(config.extraArgs || []), `--remote-debugging-port=${port}`].join(' ')
      : '';
    // A launch URL uses the confirmed `aa start -U` path (ohos-aa --uri is
    // an implicit-startup URI and does not open the page).
    if (config.launchUrl) {
      await hdcShellWithRetry(hdc, `aa start -b ${config.bundleName} -a ${config.abilityName}${cmdArgs ? ` --ps cmdArgs '${cmdArgs}'` : ''} -U ${config.launchUrl}`);
    } else if (ohosAa) {
      const startArgs = ['start', '--bundlename', config.bundleName, '--abilityname', config.abilityName];
      if (cmdArgs) {
        startArgs.push('--ps', JSON.stringify({ cmdArgs }));
      }
      await execOhosAa(ohosAa, startArgs);
    } else if (cmdArgs) {
      await hdcShellWithRetry(hdc, `aa start -b ${config.bundleName} -a ${config.abilityName} --ps cmdArgs '${cmdArgs}'`);
    } else {
      await hdcShellWithRetry(hdc, `aa start -b ${config.bundleName} -a ${config.abilityName}`);
    }
    const endpointURL = `http://127.0.0.1:${port}`;
    await waitForEndpoint(`${endpointURL}/json/version`);
    return endpointURL;
  }
  if (config.launchUrl) {
    await hdcShellWithRetry(hdc, `aa start -b ${config.bundleName} -a ${config.abilityName} -U ${config.launchUrl}`);
  } else if (ohosAa) {
    await execOhosAa(ohosAa, ['start', '--bundlename', config.bundleName, '--abilityname', config.abilityName]);
  } else {
    await hdcShellWithRetry(hdc, `aa start -b ${config.bundleName} -a ${config.abilityName}`);
  }
  const socket = await findDevtoolsSocket(hdc);
  const localPort = await getFreePort();
  await hdc.fport(`tcp:${localPort}`, `localabstract:${socket}`);
  const endpointURL = `http://127.0.0.1:${localPort}`;
  await waitForEndpoint(`${endpointURL}/json/version`);
  return endpointURL;
};

const patchBrowserClose = (browser: any, hdc: HdcBackend, config: LaunchConfig): void => {
  const browserProcess = browser.options?.browserProcess;
  if (!browserProcess) {
    return;
  }
  let closed = false;
  const stop = async () => {
    if (closed) {
      return;
    }
    closed = true;
    const ohosAa = resolveOhosAa();
    await hdc.close(config.bundleName, ohosAa ? ohosAaForceStop(ohosAa) : undefined);
  };
  const originalClose = browserProcess.close?.bind(browserProcess);
  const originalKill = browserProcess.kill?.bind(browserProcess);
  browserProcess.close = async () => {
    try {
      await originalClose?.();
    } finally {
      await stop();
    }
  };
  browserProcess.kill = async () => {
    try {
      await originalKill?.();
    } finally {
      await stop();
    }
  };
};

/**
 * Polls the device process table and closes the browser connection when the
 * device browser died, so playwright emits `disconnected` instead of
 * hanging on a dead session. Opt-in through PW_OHOS_CRASH_WATCH=1: the
 * periodic hdc shell calls add device traffic and overlap unless guarded,
 * which disturbed the ArkWeb debug channel during validation, so the
 * watcher stays off by default.
 */
const startCrashWatcher = (hdc: HdcBackend, browser: any, config: LaunchConfig): void => {
  if (process.env.PW_OHOS_CRASH_WATCH !== '1') {
    return;
  }
  let stopped = false;
  let polling = false;
  const timer = setInterval(async () => {
    if (stopped || polling) {
      return;
    }
    polling = true;
    try {
      const result = await hdc.shell(`ps -ef | grep ${config.bundleName} | grep -v grep`).catch(() => ({ stdout: '', stderr: '', code: 1 }));
      if (result.stdout.trim()) {
        return;
      }
      stopped = true;
      clearInterval(timer);
      console.error(`[playwright-ohos] device browser ${config.bundleName} died; closing the connection`);
      await browser._connection?.close().catch(() => {});
    } catch {
    } finally {
      polling = false;
    }
  }, 10000);
  timer.unref?.();
};

/**
 * Launches a HarmonyOS browser over HDC and returns a connected CRBrowser.
 * Called from the patched `Chromium.launch()` on the `openharmony` platform.
 */
export const launchViaHdc = async (chromium: any, progress: any, options: any): Promise<any> => {
  const config = resolveLaunchConfig(options);
  const hdc = new HdcBackend();
  const endpointURL = await startBrowserViaHdc(hdc, config);
  const isArkWeb = config.bundleName === ARK_WEB_BUNDLE_NAME;
  const browser = await chromium._connectOverCDPInternal(progress, endpointURL, {
    ...options,
    __ohosHdcBackend: hdc,
    __ohosArkWeb: isArkWeb,
    __ohosNoDefaultContext: !isArkWeb,
  });
  browser._hdcBackend = hdc;
  browser._isArkWeb = isArkWeb;
  // The collocated flag was renamed in playwright-core 1.61.
  browser._isCollocatedWithServer = false;
  browser._isBrowserCollocatedWithServer = false;
  patchBrowserClose(browser, hdc, config);
  startCrashWatcher(hdc, browser, config);
  return browser;
};

/**
 * Init script injected into every page of HDC-launched browsers.
 * Rounds touch coordinates reported by ArkWeb to avoid strict comparison
 * failures and marks the browser as automated.
 */
export const ohosInitScript = `
(() => {
  // The device browsers expose navigator.webdriver through a getter-only
  // property, so plain assignment is ignored.
  try {
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });
  } catch (e) {
  }
  try {
    if (typeof Touch !== 'undefined' && Touch.prototype) {
      for (const key of ['clientX', 'clientY', 'pageX', 'pageY', 'screenX', 'screenY']) {
        const descriptor = Object.getOwnPropertyDescriptor(Touch.prototype, key);
        if (descriptor && descriptor.get) {
          Object.defineProperty(Touch.prototype, key, {
            get() {
              return Math.round(descriptor.get.call(this));
            },
            configurable: true,
          });
        }
      }
    }
  } catch (e) {
  }
})();
`;
