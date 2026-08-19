// Merges the per-round test results (written by scripts/round-reporter.mjs
// into test-progress/<browser>/round<N>/results/) into final totals: a test
// passes when it passed in any round. A test whose latest recorded outcome
// is skipped stays excluded from the denominator (round 3+ re-ran the
// previously skipped tests, so the skip set can change between rounds).
// Prints per-suite and per-browser merged counts plus the final failed
// tests grouped by the failure categories of scripts/report-config.json.
//
// Usage:
//   node scripts/merge-rounds.mjs [maxRound] [browser ...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const maxRound = Number(process.argv[2] || 3);
const browsers = process.argv.slice(3);
const wanted = browsers.length ? browsers : ['chrome', 'huaweiBrowser'];

const config = JSON.parse(fs.readFileSync(path.join(scriptDir, 'report-config.json'), 'utf8'));
const categories = config.categories.map(category => ({ ...category, regex: new RegExp(category.match, category.flags || '') }));
const categorize = (message) => {
  for (const category of categories) {
    if (category.regex.test(message)) {
      return category;
    }
  }
  return categories[categories.length - 1];
};

// passed > failed > skipped
const rank = { expected: 2, flaky: 2, unexpected: 1, skipped: 0 };

for (const browser of wanted) {
  const stateDir = path.join('test-progress', browser);
  if (!fs.existsSync(stateDir)) {
    console.error(`[merge-rounds] ${browser}: missing ${stateDir}`);
    process.exitCode = 1;
    continue;
  }
  // key = project + file + line -> { outcome, failedRound }
  // key -> Map(round -> best outcome recorded in that round)
  const byRound = new Map();
  for (let round = 1; round <= maxRound; round++) {
    const resultsDir = path.join(stateDir, `round${round}`, 'results');
    if (!fs.existsSync(resultsDir)) {
      continue;
    }
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        const project = path.relative(resultsDir, full).split(path.sep)[0];
        const relFile = path.relative(path.join(resultsDir, project), full).replace(/\.log$/, '');
        for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
          if (!line.trim()) {
            continue;
          }
          const [outcome, , titleWithLine] = line.split('\t');
          const lineNo = titleWithLine?.match(/^L(\d+)/)?.[1];
          if (!lineNo || rank[outcome] === undefined) {
            continue;
          }
          const key = `${project}\t${relFile}#${lineNo}`;
          const rounds = byRound.get(key) || new Map();
          if (!rounds.has(round) || rank[outcome] > rank[rounds.get(round)]) {
            rounds.set(round, outcome);
          }
          byRound.set(key, rounds);
        }
      }
    };
    walk(resultsDir);
  }

  const merged = new Map();
  for (const [key, rounds] of byRound) {
    const roundNumbers = [...rounds.keys()].sort((a, b) => a - b);
    const lastOutcome = rounds.get(roundNumbers[roundNumbers.length - 1]);
    // A test whose latest recorded outcome is skipped stays excluded
    // from the denominator, even when earlier rounds ran it.
    if (lastOutcome === 'skipped') {
      merged.set(key, { outcome: 'skipped', failedRound: undefined });
      continue;
    }
    if ([...rounds.values()].some(outcome => outcome === 'expected' || outcome === 'flaky')) {
      merged.set(key, { outcome: 'expected', failedRound: undefined });
      continue;
    }
    // Failed in every round it ran; the last failing round carries the
    // final error message.
    const lastFailed = roundNumbers.filter(round => rounds.get(round) === 'unexpected').pop();
    merged.set(key, { outcome: 'unexpected', failedRound: lastFailed });
  }

  const counts = new Map();
  const failedByCategory = new Map();
  for (const [key, { outcome, failedRound }] of merged) {
    const [project] = key.split('\t');
    const entry = counts.get(project) || { passed: 0, failed: 0, skipped: 0 };
    if (outcome === 'unexpected') {
      entry.failed++;
      const [, fileLine] = key.split('\t');
      const failurePath = path.join(stateDir, `round${failedRound}`, 'failures', project, `${fileLine}.txt`);
      const message = fs.existsSync(failurePath) ? fs.readFileSync(failurePath, 'utf8') : '(no failure record)';
      const category = categorize(message);
      failedByCategory.set(category.id, (failedByCategory.get(category.id) || 0) + 1);
    } else if (outcome === 'skipped') {
      entry.skipped++;
    } else {
      entry.passed++;
    }
    counts.set(project, entry);
  }

  const suiteLines = [];
  let total = { passed: 0, failed: 0, skipped: 0 };
  for (const [project, entry] of [...counts].sort()) {
    total.passed += entry.passed;
    total.failed += entry.failed;
    total.skipped += entry.skipped;
    suiteLines.push(`${project}: ${entry.passed} passed, ${entry.failed} failed, ${entry.skipped} skipped (${(entry.passed / (entry.passed + entry.failed) * 100).toFixed(2)}%)`);
  }
  console.log(`\n=== ${browser} (rounds 1-${maxRound} merged) ===`);
  for (const line of suiteLines) {
    console.log(`  ${line}`);
  }
  console.log(`  TOTAL: ${total.passed} passed, ${total.failed} failed, ${total.skipped} skipped (${(total.passed / (total.passed + total.failed) * 100).toFixed(2)}%)`);
  console.log('  final failures by category:');
  const byName = new Map();
  for (const [id, count] of failedByCategory) {
    const category = categories.find(candidate => candidate.id === id);
    byName.set(`${category.name}`, { count, attribution: category.attribution });
  }
  for (const [name, { count, attribution }] of [...byName].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`    ${count}\t${name}\t${attribution}`);
  }
}
