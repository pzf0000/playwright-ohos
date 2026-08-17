/**
 * Local replacements for playwright-core internal utilities that the migrated
 * test infrastructure imports. Keeps the test code independent from the
 * bundled internals of playwright-core.
 */
import fs from 'fs';
import http from 'http';
import https from 'https';
import net from 'net';

export const removeFolders = (dirs: string[]): Promise<void[]> => {
  return Promise.all(dirs.map(dir => fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {})));
};

export const hostPlatform: string = (() => {
  if (process.platform === 'linux') {
    return 'linux';
  }
  if (process.platform === 'darwin') {
    return 'darwin';
  }
  if (process.platform === 'win32') {
    return 'win32';
  }
  return 'openharmony';
})();

export const decorateServer = (server: http.Server): void => {
  const sockets = new Set<net.Socket>();
  server.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  (server as any).closeAllConnections = () => {
    for (const socket of sockets) {
      socket.destroy();
    }
  };
}

export const createHttpServer = (...args: any[]): http.Server => {
  const server = http.createServer(...(args as [any]));
  decorateServer(server);
  return server;
};;

export const createHttpsServer = (...args: any[]): https.Server => {
  const server = https.createServer(...(args as [any]));
  decorateServer(server);
  return server;
}

// Trace extraction is not supported in playwright-ohos; the functions throw
// when the corresponding (unsupported) tests use them.
export const tools = {
  extractTrace(): Promise<void> {
    throw new Error('trace extraction is not supported in playwright-ohos');
  },
  DirTraceLoaderBackend: class {
    constructor() {
      throw new Error('trace loading is not supported in playwright-ohos');
    }
  },
};

export const utils = {
  ZipFile: class {
    constructor() {
      throw new Error('ZipFile is not supported in playwright-ohos');
    }
  },
};

// Socks proxy payload types used by tests/config/proxy.ts.
export type SocksSocketClosedPayload = { uid: string };
export type SocksSocketDataPayload = { uid: string; data: string };
export type SocksSocketRequestedPayload = { uid: string; host: string; port: number };

// HAR log type used by browserTest fixtures.
export type Log = { creator: { name: string; version: string }; entries: any[]; [key: string]: any };

// Minimal HAR types used by page-request-fulfill.spec.ts.
export type HARFile = { log: { entries: HAREntry[] } };
export type HAREntry = { request: { url: string }; response: Response };
export type Response = { status: number; headers: { name: string; value: string }[]; content: { text?: string; encoding?: string } };
