/**
 * Copyright Microsoft Corporation. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Locator, Frame, Page } from 'playwright-core';

export type StackFrame = { file: string; line: number; column: number; function?: string };
export type ActionTraceEvent = { type: string; callId: string; startTime: number; endTime: number; class?: string; [key: string]: any };
export type TraceEvent = { type: string; [key: string]: any };
export type SnapshotStorage = any;
export type TraceModel = any;

export type BoundingBox = Awaited<ReturnType<Locator['boundingBox']>>;

export async function attachFrame(page: Page, frameId: string, url: string): Promise<Frame> {
  const handle = await page.evaluateHandle(async ({ frameId, url }) => {
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.id = frameId;
    document.body.appendChild(frame);
    await new Promise(x => frame.onload = x);
    return frame;
  }, { frameId, url });
  return handle.asElement().contentFrame() as Promise<Frame>;
}

export async function detachFrame(page: Page, frameId: string) {
  await page.evaluate(frameId => {
    document.getElementById(frameId)!.remove();
  }, frameId);
}

export async function verifyViewport(page: Page, width: number, height: number) {
  // `expect` may clash in test runner tests if imported eagerly.
  const { expect } = require('@playwright/test');
  expect(page.viewportSize()!.width).toBe(width);
  expect(page.viewportSize()!.height).toBe(height);
  expect(await page.evaluate('window.innerWidth')).toBe(width);
  expect(await page.evaluate('window.innerHeight')).toBe(height);
}

export function expectedSSLError(browserName: string, platform: string, channel: string | undefined): RegExp {
  if (browserName === 'chromium')
    return /net::(ERR_CERT_AUTHORITY_INVALID|ERR_CERT_INVALID)/;
  if (browserName === 'webkit') {
    if (platform === 'darwin')
      return /The certificate for this server is invalid/;
    else if (platform === 'win32' && channel !== 'webkit-wsl')
      return /SSL peer certificate or SSH remote key was not OK/;
    else
      return /Unacceptable TLS certificate|Operation was cancelled/;
  }
  if (browserName === 'firefox' && isBidiChannel(channel))
    return /MOZILLA_PKIX_ERROR_SELF_SIGNED_CERT/;
  return /SSL_ERROR_UNKNOWN/;
}

export function isBidiChannel(channel: string | undefined): boolean {
  return channel?.startsWith('bidi-chrom') || channel?.startsWith('moz-firefox') || false;
}

export function chromiumVersionLessThan(a: string, b: string) {
  const left: number[] = a.split('.').map(e => Number(e));
  const right: number[] = b.split('.').map(e => Number(e));
  for (let i = 0; i < 4; i++) {
    if (left[i] > right[i])
      return false;
    if (left[i] < right[i])
      return true;
  }
  return false;
}

let didSuppressUnverifiedCertificateWarning = false;
let originalEmitWarning: (warning: string | Error, ...args: any[]) => void;
export function suppressCertificateWarning() {
  if (didSuppressUnverifiedCertificateWarning)
    return;
  didSuppressUnverifiedCertificateWarning = true;
  // Suppress one-time warning:
  // https://github.com/nodejs/node/blob/1bbe66f432591aea83555d27dd76c55fea040a0d/lib/internal/options.js#L37-L49
  originalEmitWarning = process.emitWarning;
  process.emitWarning = (warning, ...args) => {
    if (typeof warning === 'string' && warning.includes('NODE_TLS_REJECT_UNAUTHORIZED')) {
      process.emitWarning = originalEmitWarning;
      return;
    }
    return originalEmitWarning.call(process, warning, ...args);
  };
}

export async function parseTraceRaw(file: string): Promise<{ events: any[], resources: Map<string, Buffer>, actions: string[], actionObjects: ActionTraceEvent[], stacks: Map<string, StackFrame[]> }> {
  throw new Error('parseTraceRaw is not supported in playwright-ohos');
}

export async function parseTrace(file: string): Promise<{ snapshots: SnapshotStorage, model: TraceModel }> {
  throw new Error('parseTrace is not supported in playwright-ohos');
}

export async function parseHar(file: string): Promise<Map<string, Buffer>> {
  throw new Error('parseHar is not supported in playwright-ohos');
}

export function waitForTestLog<T>(page: Page, prefix: string): Promise<T> {
  return new Promise<T>(resolve => {
    page.on('console', message => {
      const text = message.text();
      if (text.startsWith(prefix)) {
        const json = text.substring(prefix.length);
        resolve(JSON.parse(json));
      }
    });
  });
}

export async function rafraf(target: Page | Frame, count = 1) {
  for (let i = 0; i < count; i++) {
    await target.evaluate(async () => {
      await new Promise(f => window.builtins.requestAnimationFrame(() => window.builtins.requestAnimationFrame(f)));
    });
  }
}

export async function ensureSomeFrames(page: Page) {
  await rafraf(page, 100);
  await page.screenshot();
}

export function roundBox(box: BoundingBox): BoundingBox {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

export function unshift(snapshot: string): string {
  const lines = snapshot.split('\n');
  let whitespacePrefixLength = 100;
  for (const line of lines) {
    if (!line.trim())
      continue;
    const match = line.match(/^(\s*)/);
    if (match && match[1].length < whitespacePrefixLength)
      whitespacePrefixLength = match[1].length;
  }
  return lines.filter(t => t.trim()).map(line => line.substring(whitespacePrefixLength)).join('\n');
}

const ansiRegex = new RegExp('[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))', 'g');
export function stripAnsi(str: string): string {
  return str.replace(ansiRegex, '');
}

export function inheritAndCleanEnv(env: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  return {
    ...process.env,
    // BEGIN: Reserved CI
    CI: undefined,
    BUILD_URL: undefined,
    CI_COMMIT_SHA: undefined,
    CI_JOB_URL: undefined,
    CI_PROJECT_URL: undefined,
    GITHUB_ACTIONS: undefined,
    GITHUB_REPOSITORY: undefined,
    GITHUB_RUN_ID: undefined,
    GITHUB_SERVER_URL: undefined,
    GITHUB_SHA: undefined,
    GITHUB_EVENT_PATH: undefined,
    // END: Reserved CI
    PW_TEST_HTML_REPORT_OPEN: undefined,
    PLAYWRIGHT_HTML_OPEN: undefined,
    PW_TEST_DEBUG_REPORTERS: undefined,
    PW_TEST_REPORTER: undefined,
    PW_TEST_REPORTER_WS_ENDPOINT: undefined,
    PW_TEST_SOURCE_TRANSFORM: undefined,
    PW_TEST_SOURCE_TRANSFORM_SCOPE: undefined,
    PWTEST_BOT_NAME: undefined,
    PWTEST_SHARD_WEIGHTS: undefined,
    TEST_WORKER_INDEX: undefined,
    TEST_PARALLEL_INDEX: undefined,
    NODE_OPTIONS: undefined,
    ...env,
  };
}
