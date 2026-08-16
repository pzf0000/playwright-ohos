// Runs one test round for both browsers serially: Haitai (chrome) first,
// then the Huawei browser. Each browser round covers both the page and the
// library suites (handled by scripts/run-round.mjs). Console output is
// streamed in real time. Afterwards the overall round report is generated
// (scripts/generate-report.mjs).
//
// Re-running a round clears the previous records of the same round; set
// PW_OHOS_RESUME=1 to continue a crashed round instead.
//
// Usage:
//   node scripts/run-round-all.mjs <round>
import { spawnSync } from 'node:child_process';

const round = process.argv[2];
if (!round) {
  console.error('usage: node scripts/run-round-all.mjs <round>');
  process.exit(2);
}

const browsers = ['chrome', 'huaweiBrowser'];
const results = [];
for (const browser of browsers) {
  console.log(`\n=== [run-round-all] starting ${browser} round ${round} ===\n`);
  const result = spawnSync('node', ['scripts/run-round.mjs', browser, round], {
    stdio: 'inherit',
    env: process.env,
  });
  const status = result.error ? 'error: ' + result.error.message : 'exit code ' + result.status;
  results.push({ browser, ok: result.status === 0 && !result.error });
  console.log(`\n=== [run-round-all] ${browser} round ${round} finished (${status}) ===\n`);
}

console.log(`\n=== [run-round-all] generating the round ${round} report ===\n`);
spawnSync('node', ['scripts/generate-report.mjs', round], {
  stdio: 'inherit',
  env: process.env,
});

const failures = results.filter(result => !result.ok).map(result => result.browser);
if (failures.length) {
  console.log(`[run-round-all] completed with failing browser round(s): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('[run-round-all] all browser rounds completed successfully');
