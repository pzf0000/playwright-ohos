// Generic helpers shared by the launcher and the OS layer.
import { execFile, execFileSync } from 'child_process';
import fs from 'fs';
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

const resolvedCommands = new Map<string, string | undefined>();

/**
 * Resolves a command to its real filesystem path through the shell, so
 * commands configured as shell aliases are found as well. `realpath
 * $(which <command>)` prints the canonical path for direct commands; for
 * aliases it prints one word per line of the `which` output with the
 * aliased target as the last line; missing commands spell "<command> not
 * found". Existing absolute paths select the binary and filter out both
 * the noise of interactive shells and the cwd-relative words of the
 * not-found output.
 */
export const resolveCommandPath = (command: string): string | undefined => {
  const cached = resolvedCommands.get(command);
  if (cached !== undefined || resolvedCommands.has(command)) {
    return cached;
  }
  // Interactive flags are needed for zsh/bash to load rc aliases; sh has
  // no interactive alias setup and is tried first without them.
  const attempts: Array<[string, string]> = [['sh', '-c'], ['zsh', '-ic'], ['bash', '-ic']];
  let resolved: string | undefined;
  for (const [shell, flags] of attempts) {
    try {
      const out = execFileSync(shell, [flags, `realpath $(which ${command} 2>/dev/null) 2>/dev/null || true`], { encoding: 'utf8', timeout: 8000 });
      for (const line of out.split('\n').reverse()) {
        const candidate = line.trim();
        if (candidate.startsWith('/') && fs.existsSync(candidate)) {
          resolved = candidate;
          break;
        }
      }
    } catch {
    }
    if (resolved) {
      break;
    }
  }
  resolvedCommands.set(command, resolved);
  return resolved;
};

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
