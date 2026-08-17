// HDC (HarmonyOS Device Connector) backend used to launch and control
// on-device browsers from playwright-ohos.
import fs from 'fs';
import os from 'os';
import path from 'path';

import { execFileAsync } from '../utils';

export class HdcBackend {
  readonly binary: string;
  private readonly _forwards: string[] = [];

  constructor() {
    this.binary = process.env.HDC_BINARY || 'hdc';
  }

  private _run(args: string[], timeoutMs = 30000) {
    return execFileAsync(this.binary, args, timeoutMs);
  }

  exec(args: string[], timeoutMs = 30000) {
    return this._run(args, timeoutMs);
  }

  /** Runs a command on the device shell. */
  shell(command: string, timeoutMs = 30000) {
    return this._run(['shell', command], timeoutMs);
  }

  /** Forwards a device socket to a local TCP port and tracks it for cleanup. */
  async fport(local: string, remote: string): Promise<void> {
    const result = await this._run(['fport', local, remote]);
    if (!result.stdout.includes('OK')) {
      throw new Error(`hdc fport failed: ${result.stdout || result.stderr}`);
    }
    this._forwards.push(`${local} ${remote}`);
  }

  /** Copies a file from the device to the local filesystem. */
  async fileRecv(remotePath: string, localPath: string): Promise<void> {
    await this._run(['file', 'recv', remotePath, localPath], 60000);
  }

  /** Takes a screenshot of the device display and returns it as a PNG buffer. */
  async screenshot(): Promise<Buffer> {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const remotePath = `/data/local/tmp/pw-ohos-${stamp}.png`;
    const localPath = path.join(os.tmpdir(), `pw-ohos-${stamp}.png`);
    try {
      await this.shell(`snapshot_display -f ${remotePath} -t png`);
      await this.fileRecv(remotePath, localPath);
      return await fs.promises.readFile(localPath);
    } finally {
      await this.shell(`rm -f ${remotePath}`).catch(() => {});
      await fs.promises.unlink(localPath).catch(() => {});
    }
  }

  /** Stops the browser app and removes tracked port forwards. */
  async close(bundleName: string): Promise<void> {
    await this.shell(`aa force-stop ${bundleName}`).catch(() => {});
    for (const forward of this._forwards) {
      const [local, remote] = forward.split(' ');
      await this._run(['fport', 'rm', local, remote]).catch(() => {});
    }
    this._forwards.length = 0;
  }

  /**
   * Removes stale device-socket forwards left behind by crashed runs, so
   * repeated launches do not accumulate forwards. Only rules targeting
   * webview devtools sockets are touched; the live browser is force-stopped
   * before this runs, so all of them are stale by construction.
   */
  async cleanupStaleForwards(): Promise<void> {
    const result = await this._run(['fport', 'ls']).catch(() => ({ stdout: '', stderr: '', code: 1 }));
    for (const line of result.stdout.split('\n')) {
      const match = line.match(/\s+(tcp:\d+)\s+(localabstract:\S+)/);
      if (!match || !match[2].includes('webview_devtools_remote'))
        continue;
      await this._run(['fport', 'rm', match[1], match[2]]).catch(() => {});
    }
  }

  /**
   * Connects the local wireless-debugging target when no device is
   * connected: the port is read from `param get persist.hdc.port` and the
   * localhost target is connected with `hdc tconn`. On HarmonyOS 7.1+ the
   * ohos-aa path does not need a device connection, so the caller only
   * invokes this for the HDC path.
   */
  async ensureDeviceConnected(): Promise<void> {
    const targets = await this._run(['list', 'targets']).catch(() => ({ stdout: '', stderr: '', code: 1 }));
    if (targets.stdout.trim()) {
      return;
    }
    const portResult = await execFileAsync('param', ['get', 'persist.hdc.port'], 5000).catch(() => ({ stdout: '', stderr: '', code: 1 }));
    const port = portResult.stdout.trim();
    if (!/^\d+$/.test(port)) {
      throw new Error(`cannot determine the wireless debugging port (param get persist.hdc.port returned: ${JSON.stringify(port)})`);
    }
    await this._run(['tconn', `127.0.0.1:${port}`]);
    const after = await this._run(['list', 'targets']);
    if (!after.stdout.trim()) {
      throw new Error(`hdc tconn 127.0.0.1:${port} did not connect; enable wireless debugging on the device first`);
    }
  }
}

/** Takes a screenshot through the HDC backend (used by the CDP screenshot fallback). */
export const hdcScreenshot = async (hdc: HdcBackend): Promise<Buffer> => hdc.screenshot();
