// Launches on-device browsers through HDC or ohos-aa and wires them into
// playwright-core's Chromium implementation.
import { execFile, execFileSync } from 'child_process';

import { HdcBackend, getFreePort, sleep, waitForEndpoint } from './hdc';

export interface LaunchConfig {
  bundleName: string;
  abilityName: string;
  /** 'tcp' browsers listen on a TCP port; 'socket' browsers expose a Unix socket. */
  kind: 'tcp' | 'socket';
  /** Fixed debug port for browsers that cannot receive one through arguments. */
  port?: number;
  /** Whether the browser accepts extra arguments through the `cmdArgs` parameter. */
  supportsCmdArgs?: boolean;
}

const DEVTOOLS_SOCKET_PATTERN = /@(webview_devtools_remote_\d+)/;

const OHOS_AA_DEFAULT_PATH = '/system/bin/cli_tool/executable/ohos-aa';

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

const isExecutable = (candidate: string): boolean => {
  try {
    execFileSync(candidate, ['--help'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

/**
 * Resolves the ohos-aa executable. On HarmonyOS 7.1+ it is a regular command;
 * on this machine it is a shell alias, which is resolved through the shell.
 */
export const resolveOhosAa = (): string | undefined => {
  const candidates = [process.env.OHOS_AA_BINARY, 'ohos-aa', OHOS_AA_DEFAULT_PATH].filter((c): c is string => !!c);
  for (const candidate of candidates) {
    if (isExecutable(candidate))
      return candidate;
  }
  for (const shell of ['zsh', 'bash', 'sh']) {
    try {
      const out = execFileSync(shell, ['-ic', 'which ohos-aa 2>/dev/null || true'], { encoding: 'utf8', timeout: 8000 }).trim();
      const match = out.match(/aliased to (\S+)/) || out.match(/^(\S+)$/m);
      if (match && isExecutable(match[1])) {
        return match[1];
      }
    } catch {
    }
  }
  return undefined;
};

const execAsync = (command: string, args: string[], timeoutMs = 30000): Promise<{ stdout: string; stderr: string }> => new Promise((resolve, reject) => {
  execFile(command, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      reject(error);
    } else {
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    }
  });
});

export const resolveLaunchConfig = (options: { channel?: string; harmonyBundleName?: string; harmonyDebugPort?: number }): LaunchConfig => {
  const envBrowser = process.env.HARMONY_BROWSER;
  const custom = options.harmonyBundleName || (envBrowser && !KNOWN_BROWSERS[envBrowser] ? envBrowser : undefined);
  const channel = envBrowser && KNOWN_BROWSERS[envBrowser] ? envBrowser : (options.channel ?? 'huaweiBrowser');
  const known = KNOWN_BROWSERS[channel];
  const config: LaunchConfig = known ? { ...known } : { bundleName: channel, abilityName: 'MainAbility', kind: 'socket' };
  if (custom) {
    config.bundleName = custom;
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

const startBrowserViaHdc = async (hdc: HdcBackend, config: LaunchConfig): Promise<string> => {
  const ohosAa = resolveOhosAa();
  await hdc.shell(`aa force-stop ${config.bundleName}`);
  if (config.kind === 'tcp') {
    // Browsers that accept cmdArgs pick a free local port so an occupied
    // default port never blocks the launch; fixed-port browsers use 9222.
    const port = config.port ?? (config.supportsCmdArgs ? await getFreePort() : 9222);
    const startArgs = ['start', '--bundlename', config.bundleName, '--abilityname', config.abilityName];
    if (config.supportsCmdArgs) {
      startArgs.push('--ps', JSON.stringify({ cmdArgs: `--remote-debugging-port=${port}` }));
    }
    if (ohosAa) {
      await execAsync(ohosAa, startArgs);
    } else if (config.supportsCmdArgs) {
      await hdc.shell(`aa start -b ${config.bundleName} -a ${config.abilityName} --ps cmdArgs '--remote-debugging-port=${port}'`);
    } else {
      await hdc.shell(`aa start -b ${config.bundleName} -a ${config.abilityName}`);
    }
    const endpointURL = `http://127.0.0.1:${port}`;
    await waitForEndpoint(`${endpointURL}/json/version`);
    return endpointURL;
  }
  if (ohosAa) {
    await execAsync(ohosAa, ['start', '--bundlename', config.bundleName, '--abilityname', config.abilityName]);
  } else {
    await hdc.shell(`aa start -b ${config.bundleName} -a ${config.abilityName}`);
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
    await hdc.close(config.bundleName);
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
  browser._isCollocatedWithServer = false;
  patchBrowserClose(browser, hdc, config);
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
