// Full-test round runner with crash recovery, organized per browser.
//
// Usage:
//   node scripts/run-round.mjs <browser> <round>
//
// Browsers: chrome (Haitai), huaweiBrowser. Each invocation runs both the
// page and the library suites of that browser sequentially in one worker.
// Round 1 runs everything. Rounds 2+ run only the tests that failed in the
// previous round (three-round methodology: a test passes if it passes in
// any round).
//
// The browser is restarted before every test (PW_OHOS_BROWSER_RESTART,
// enabled by default): the HDC launcher force-stops the device browser and
// relaunches it, so no state leaks between tests. Set
// PW_OHOS_BROWSER_RESTART=off to disable.
//
// Records (all under test-progress/<browser>/round<N>/):
//   stream.log   - streamed reporter output (survives crashes)
//   report.json  - structured report with per-test statuses, merged across
//                  resume invocations
//   failed.txt   - failed test titles for the next round
//   progress.txt - latest progress line (round, browser, test)
//   results/     - one line per test per file, written by
//                  scripts/round-reporter.mjs
//   failures/    - full error, steps and stdout of failed tests, written
//                  by scripts/round-reporter.mjs
//
// A round that did not finish (no finished marker or reporter summary in
// stream.log) is resumed automatically; a finished round is restarted from
// scratch and its previous records of the same round are removed first
// (other rounds are untouched). Set PW_OHOS_RESUME=1 to force a resume or
// PW_OHOS_RESET=1 to force a fresh start.
//
// Crash recovery:
//   - Tests already recorded in the log are skipped through --grep-invert.
//   - After a system freeze or reboot, the patched playwright-core in
//     node_modules is untouched; stale fports are cleaned at each launch.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CONFIG = 'tests/playwright.config.ts';
const browser = process.argv[2];
const round = process.argv[3];
if (!browser || !round) {
  console.error('usage: node scripts/run-round.mjs <browser> <round>');
  process.exit(2);
}
const projects = [`${browser}-page`, `${browser}-library`];

const stateDir = path.join('test-progress', browser);
const roundDir = path.join(stateDir, `round${round}`);
const logPath = path.join(roundDir, 'stream.log');
// A round counts as finished when the log carries a finished marker or a
// reporter summary line. Unfinished rounds resume automatically; finished
// rounds restart from scratch. The env vars force either direction.
const stripAnsi = (text) => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const existingLog = fs.existsSync(logPath) ? stripAnsi(fs.readFileSync(logPath, 'utf8')) : '';
const finished = /^=== finished /m.test(existingLog) || /^\s*\d+\s+(passed|failed|skipped)\s/m.test(existingLog);
const resume = process.env.PW_OHOS_RESUME === '1' || (process.env.PW_OHOS_RESET !== '1' && !finished);
if (!resume && fs.existsSync(roundDir)) {
  fs.rmSync(roundDir, { recursive: true, force: true });
  console.log(`[run-round] cleared ${roundDir} (round was finished; set PW_OHOS_RESUME=1 to force a resume)`);
} else if (resume && fs.existsSync(logPath)) {
  console.log(`[run-round] resuming ${roundDir} (round not finished; set PW_OHOS_RESET=1 to force a fresh start)`);
}
const failedPath = path.join(roundDir, 'failed.txt');
const jsonPath = path.join(roundDir, 'report.json');
fs.mkdirSync(roundDir, { recursive: true });

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Canonical --grep pattern for a reporter title line. --grep matches the
// relative file path (without line numbers) plus the suite path and test
// title joined with spaces, e.g. `page/foo.spec.ts describe test`. The
// pattern is pinned to a word boundary and the end of the title so that
// shorter titles do not also match longer ones in the same file.
const canonicalPattern = (file, title) => {
  // The reporter prints paths relative to the repo root (`tests/...`), but
  // --grep matches paths relative to the config testDir (`tests/`).
  const fileNoLoc = file.replace(/:\d+:\d+$/, '').replace(/^tests\//, '');
  const segments = title.split(' › ');
  const full = [fileNoLoc, ...segments].join(' ').replace(/[\s─]+$/, '').trim();
  return '(^| )' + escapeRegex(full) + '$';
};

// Parses streamed line-reporter output in piped mode: every test prints one
// `[n/m] [project] › file:line › title` line (including skipped tests), and
// a failing test is followed by a numbered `N) [project] › ...` entry.
// Failure entries truncate long titles, so a failure is attributed to the
// complete title of the preceding title line instead of its own text.
// Passed and skipped tests print no per-test outcome line, so only the
// recorded titles and the failed set are extracted here.
const parseLog = (text) => {
  const clean = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  const titles = new Set();
  const failed = new Set();
  let current = null;
  for (const line of clean.split('\n')) {
    const titleLine = line.match(/^\[\d+\/\d+\] \[.*?\] › (.+?\.spec\.ts):\d+:\d+ › (.+)$/);
    if (titleLine) {
      current = { file: titleLine[1], title: titleLine[2] };
      titles.add(canonicalPattern(current.file, current.title));
      continue;
    }
    const failure = line.match(/^\s+\d+\)\s+\[.*?\] › (.+?\.spec\.ts):\d+:\d+ › /);
    if (failure && current && failure[1] === current.file) {
      failed.add(canonicalPattern(current.file, current.title));
    }
  }
  return { titles, failed };
};

// Merges a resumed segment's structured report into the existing one so
// round<N>.json always covers the whole round. Segments are disjoint
// (resume runs --grep-invert), so specs are matched by identity and tests
// are appended.
const mergeJsonReport = (previous, current) => {
  const suitesByFile = new Map(previous.suites.map(suite => [suite.file, suite]));
  for (const suite of current.suites) {
    const existing = suitesByFile.get(suite.file);
    if (!existing) {
      previous.suites.push(suite);
      continue;
    }
    const specsById = new Map(existing.specs.map(spec => [`${spec.line}:${spec.column}:${spec.title}`, spec]));
    for (const spec of suite.specs) {
      const key = `${spec.line}:${spec.column}:${spec.title}`;
      if (specsById.has(key)) {
        specsById.get(key).tests.push(...spec.tests);
      } else {
        existing.specs.push(spec);
      }
    }
  }
  for (const key of ['expected', 'unexpected', 'skipped', 'flaky']) {
    previous.stats[key] += current.stats[key];
  }
  previous.stats.duration += current.stats.duration;
  if (Date.parse(current.stats.startTime) < Date.parse(previous.stats.startTime)) {
    previous.stats.startTime = current.stats.startTime;
  }
  return previous;
};

const recorded = new Set();
if (fs.existsSync(logPath)) {
  const { titles } = parseLog(fs.readFileSync(logPath, 'utf8'));
  for (const title of titles) {
    recorded.add(title);
  }
}

let grep = null;
const previousFailed = path.join(stateDir, `round${Number(round) - 1}`, 'failed.txt');
if (round > 1) {
  if (!fs.existsSync(previousFailed)) {
    console.error(`missing ${previousFailed}; run round ${Number(round) - 1} first`);
    process.exit(2);
  }
  const failed = fs.readFileSync(previousFailed, 'utf8').split('\n')
    .map(line => line.replace(/^#\s*/, '').trim())
    .filter(title => title && !recorded.has(title));
  if (failed.length === 0) {
    console.log(`round ${round}: nothing to run (all previous failures already recorded)`);
    fs.appendFileSync(logPath, `=== finished ${new Date().toISOString()} (nothing to run) ===\n`);
    process.exit(0);
  }
  grep = failed.join('|');
}

// The CLI resolves custom reporter paths against the current working
// directory, so pass the absolute path.
const args = ['playwright', 'test', `--config=${CONFIG}`, `--reporter=line,json,${path.resolve('scripts/round-reporter.mjs')}`];
for (const project of projects) {
  args.push(`--project=${project}`);
}
if (grep) {
  args.push('--grep', grep);
} else if (recorded.size) {
  args.push('--grep-invert', [...recorded].join('|'));
}

const childEnv = {
  ...process.env,
  // Restart the browser before every test unless explicitly disabled.
  PW_OHOS_BROWSER_RESTART: process.env.PW_OHOS_BROWSER_RESTART === 'off' ? '' : 'per-test',
  // Per-test restarts need more headroom than the default 6h global timeout.
  PW_OHOS_GLOBAL_TIMEOUT: process.env.PW_OHOS_GLOBAL_TIMEOUT || String(24 * 60 * 60 * 1000),
  // Structured per-round report with exact passed/failed/skipped per suite.
  PLAYWRIGHT_JSON_OUTPUT_FILE: jsonPath,
  // Where scripts/round-reporter.mjs writes results/ and failures/.
  PW_OHOS_ROUND_DIR: path.resolve(roundDir),
  // Optional CDP protocol traffic log (DEBUG=pw:protocol) for failure
  // analysis; enable with PW_OHOS_CDP_LOG=1. Written to round<N>.log.
  ...(process.env.PW_OHOS_CDP_LOG === '1' ? { DEBUG: [process.env.DEBUG, 'pw:protocol'].filter(Boolean).join(',') } : {}),
};

let previousJson = null;
if (recorded.size > 0 && fs.existsSync(jsonPath)) {
  previousJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

console.log(`[run-round] browser=${browser} round=${round}: ${recorded.size} recorded, ${grep ? grep.split('|').length + ' failed tests to rerun' : 'full run'}`);
fs.appendFileSync(logPath, `\n=== resume ${new Date().toISOString()} recorded=${recorded.size} ${grep ? 'failed-only' : 'full'} ===\n`);

const child = spawn('npx', args, { stdio: ['ignore', 'pipe', 'pipe'], env: childEnv });
const logStream = fs.createWriteStream(logPath, { flags: 'a' });
const statusPath = path.join(stateDir, `progress-round${round}.txt`);
let stdoutBuffer = '';
child.stdout.on('data', chunk => {
  process.stdout.write(chunk);
  logStream.write(chunk);
  // Streamed line output carries [n/m] prefixes: report progress per test.
  stdoutBuffer += chunk;
  const lines = stdoutBuffer.split('\n');
  stdoutBuffer = lines.pop();
  for (const rawLine of lines) {
    const clean = rawLine.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
    const match = clean.match(/^\[(\d+)\/(\d+)\] \[(.+?)\] › .+?\.spec\.ts:\d+:\d+ › (.+)$/);
    if (!match) {
      continue;
    }
    const index = Number(match[1]);
    const count = Number(match[2]);
    const project = match[3];
    const title = match[4];
    const pct = ((index / count) * 100).toFixed(1);
    const statusLine = `browser=${browser} round=${round} ${project} ${index}/${count} (${pct}%) running: ${title}`;
    console.log(`[run-round] ${statusLine}`);
    fs.writeFileSync(statusPath, statusLine + '\n');
  }
});
child.stderr.on('data', chunk => {
  process.stderr.write(chunk);
  logStream.write(chunk);
});

child.on('exit', code => {
  logStream.end();
  console.log(`[run-round] browser=${browser} round=${round} finished with exit code ${code}`);
  const { titles, failed } = parseLog(fs.readFileSync(logPath, 'utf8'));
  fs.appendFileSync(logPath, `=== finished ${new Date().toISOString()} failed=${failed.size} ===\n`);
  console.log(`[run-round] summary: recorded=${titles.size} failed=${failed.size}`);
  fs.writeFileSync(failedPath, [...failed].map(title => `# ${title}`).join('\n') + '\n');
  console.log(`[run-round] failed list written to ${failedPath} (${failed.size} tests)`);
  if (previousJson && fs.existsSync(jsonPath)) {
    const currentJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    fs.writeFileSync(jsonPath, JSON.stringify(mergeJsonReport(previousJson, currentJson)));
    console.log('[run-round] structured report merged with the previous segment');
  }
  process.exit(code === 0 ? 0 : 1);
});
