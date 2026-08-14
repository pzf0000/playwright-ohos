// HDC (HarmonyOS Device Connector) backend used to launch and control
// on-device browsers from playwright-ohos.
import { execFile } from 'child_process';
import net from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

export interface ExecResult {
    stdout: string;
    stderr: string;
    code: number;
}

function execFileAsync(command: string, args: string[], timeoutMs: number): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
        execFile(command, args, {
            timeout: timeoutMs,
            maxBuffer: 16 * 1024 * 1024,
            windowsHide: true,
        }, (error, stdout, stderr) => {
            if (error && (error as any).code !== 0) {
                reject(error);
            } else {
                resolve({
                    stdout: String(stdout || ''),
                    stderr: String(stderr || ''),
                    code: error ? (error as any).code ?? 0 : 0,
                });
            }
        });
    });
}

export class HdcBackend {
    readonly binary: string;
    private readonly _forwards: string[] = [];

    constructor() {
        this.binary = process.env.HDC_BINARY || 'hdc';
    }

    private _run(args: string[], timeoutMs = 30000): Promise<ExecResult> {
        return execFileAsync(this.binary, args, timeoutMs);
    }

    exec(args: string[], timeoutMs = 30000): Promise<ExecResult> {
        return this._run(args, timeoutMs);
    }

    /** Runs a command on the device shell. */
    shell(command: string, timeoutMs = 30000): Promise<ExecResult> {
        return this._run(['shell', command], timeoutMs);
    }

    /** Forwards a device socket to a local TCP port and tracks it for cleanup. */
    async fport(local: string, remote: string): Promise<void> {
        const result = await this._run(['fport', local, remote]);
        if (!result.stdout.includes('OK'))
            throw new Error(`hdc fport failed: ${result.stdout || result.stderr}`);
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
}

/** Takes a screenshot through the HDC backend (used by the CDP screenshot fallback). */
export async function hdcScreenshot(hdc: HdcBackend): Promise<Buffer> {
    return await hdc.screenshot();
}

/** Fetches JSON from an HTTP endpoint. */
export function httpGetJson(url: string, timeoutMs = 3000): Promise<any> {
    return new Promise((resolve, reject) => {
        const request = http.get(url, response => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(new Error(`Invalid JSON from ${url}: ${String(data).slice(0, 200)}`));
                }
            });
        });
        request.on('error', reject);
        request.setTimeout(timeoutMs, () => request.destroy(new Error(`Timeout fetching ${url}`)));
    });
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Finds a free local TCP port. */
export function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close();
                reject(new Error('Failed to allocate a free port'));
                return;
            }
            const port = address.port;
            server.close(() => resolve(port));
        });
        server.on('error', reject);
    });
}

/** Polls an HTTP endpoint until it responds, or the deadline passes. */
export async function waitForEndpoint(url: string, timeoutMs = 30000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: Error | undefined;
    while (Date.now() < deadline) {
        try {
            await httpGetJson(url);
            return;
        } catch (error) {
            lastError = error as Error;
            await sleep(500);
        }
    }
    throw new Error(`Endpoint ${url} did not become ready: ${lastError?.message ?? 'unknown error'}`);
}
