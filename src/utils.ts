// Generic helpers shared by the launcher and the OS layer.
import { execFile } from 'child_process';
import http from 'http';
import net from 'net';

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export const execFileAsync = (command: string, args: string[], timeoutMs: number): Promise<ExecResult> => new Promise((resolve, reject) => {
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

/** Fetches JSON from an HTTP endpoint. */
export const httpGetJson = (url: string, timeoutMs = 3000): Promise<any> => new Promise((resolve, reject) => {
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

export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Finds a free local TCP port. */
export const getFreePort = (): Promise<number> => new Promise((resolve, reject) => {
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

/** Polls an HTTP endpoint until it responds, or the deadline passes. */
export const waitForEndpoint = async (url: string, timeoutMs = 30000): Promise<void> => {
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
};
