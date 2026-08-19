// Generates reports/round-<N>.md from the round records under
// test-progress/<browser>/round<N>/. Category definitions, labels and
// report texts live in scripts/report-config.json; this script only
// assembles them.
//
// Usage:
//   node scripts/generate-report.mjs <round>
//
// Data sources per browser:
//   stream.log     - streamed line-reporter output: per-project totals,
//                    failure entries with error text and per-run summary
//                    lines (always present)
//   report.json    - structured report with per-test statuses and skip
//                    annotations, merged across resume invocations
//   results/**     - one line per test per file with outcome, duration and
//                    skip reasons (written by scripts/round-reporter.mjs)
//   failures/**    - full error, steps and stdout of failed tests
//
// The report only states what was recorded: counts and skip reasons that
// the round did not record are left blank, never estimated.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const round = process.argv[2];
if (!round) {
  console.error('usage: node scripts/generate-report.mjs <round>');
  process.exit(2);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(scriptDir, 'report-config.json'), 'utf8'));
const categories = config.categories.map(category => ({ ...category, regex: new RegExp(category.match, category.flags || '') }));

const stripAnsi = (text) => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const escapeMd = (text) => text.replace(/([|\\`*_{}[\]<>])/g, '\\$1');

const categorize = (message) => {
  for (const category of categories) {
    if (category.regex.test(message)) {
      return category;
    }
  }
  return categories[categories.length - 1];
};

// Parses the streamed line-reporter log: per-project totals and failures
// with their error text. A failure entry is attributed to the complete
// title of the preceding title line (entries truncate long titles).
const parseLog = (text) => {
  const clean = stripAnsi(text);
  const lines = clean.split('\n');
  const totals = new Map();
  const failures = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const titleLine = line.match(/^\[\d+\/\d+\] \[(.+?)\] › (.+?\.spec\.ts):(\d+):\d+ › (.+)$/);
    if (titleLine) {
      totals.set(titleLine[1], (totals.get(titleLine[1]) || 0) + 1);
      current = { project: titleLine[1], file: titleLine[2], line: titleLine[3], title: titleLine[4] };
      continue;
    }
    const entry = line.match(/^\s+\d+\)\s+\[.*?\] › (.+?\.spec\.ts):(\d+):\d+ › /);
    if (entry && current && entry[1] === current.file) {
      const detail = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\[\d+\/\d+\] \[/.test(lines[j]) || /^\s+\d+\)\s+\[/.test(lines[j])) {
          break;
        }
        detail.push(lines[j]);
      }
      const isNoise = (l) => {
        const t = l.trim();
        if (!t) {
          return true;
        }
        if (/^Error Context/.test(t) || /^at\s+/.test(t)) {
          return true;
        }
        if (/^\d+\s*\|/.test(t) || /^>\s*\d+\s*\|/.test(t) || /^\s*\^/.test(t)) {
          return true;
        }
        if (/^[◇│└├┌]/.test(t)) {
          return true;
        }
        return false;
      };
      const messageLine = detail.find(l => !isNoise(l));
      failures.push({
        project: current.project,
        file: current.file,
        line: current.line,
        title: current.title,
        message: messageLine ? messageLine.trim() : '(错误信息未记录)',
      });
    }
  }
  return { totals, failures };
};

// Sums the per-run summary lines (e.g. `97 skipped`) of the log. On resume
// each invocation prints its own summary, and the segments are disjoint
// (--grep-invert), so the sums cover the whole round.
const parseSummary = (text) => {
  const clean = stripAnsi(text);
  const counts = { passed: 0, failed: 0, skipped: 0 };
  for (const line of clean.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(passed|failed|skipped)/);
    if (match) {
      counts[match[2]] += Number(match[1]);
    }
  }
  return counts;
};

// Parses the per-test result files written by scripts/round-reporter.mjs:
// exact per-project counts and skipped tests with their reasons. These
// files are appended across resume invocations like the stream log.
const parseResults = (roundDir) => {
  const resultsDir = path.join(roundDir, 'results');
  if (!fs.existsSync(resultsDir)) {
    return null;
  }
  const perProject = new Map();
  const skipped = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const project = path.relative(resultsDir, path.dirname(full)).split(path.sep)[0];
      const relativeFile = path.relative(path.join(resultsDir, project), full).replace(/\.log$/, '');
      if (!perProject.has(project)) {
        perProject.set(project, { total: 0, passed: 0, failed: 0, skipped: 0 });
      }
      const stats = perProject.get(project);
      for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
        if (!line.trim()) {
          continue;
        }
        const [outcome, duration, titleWithLine, reasons] = line.split('\t');
        const location = (titleWithLine || '').match(/^L(\d+) (.*)$/);
        const title = location ? location[2] : titleWithLine;
        stats.total++;
        if (outcome === 'expected' || outcome === 'flaky') {
          stats.passed++;
        } else if (outcome === 'unexpected') {
          stats.failed++;
        } else if (outcome === 'skipped') {
          stats.skipped++;
          skipped.push({ project, file: relativeFile, line: location ? location[1] : '', title, reasons: reasons || '(未注明原因)' });
        }
      }
    }
  };
  walk(resultsDir);
  return { perProject, skipped };
};

// Reads the structured json report when present: exact per-project counts
// and skipped tests with their annotations. Used when results/ files are
// missing (rounds run before the custom reporter existed).
const readJson = (browser, roundDir) => {
  const file = path.join(roundDir, 'report.json');
  if (!fs.existsSync(file)) {
    return null;
  }
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const perProject = new Map();
  const skipped = [];
  for (const suite of report.suites) {
    for (const spec of suite.specs) {
      for (const test of spec.tests) {
        const project = test.projectName;
        if (!perProject.has(project)) {
          perProject.set(project, { total: 0, passed: 0, failed: 0, skipped: 0 });
        }
        const stats = perProject.get(project);
        stats.total++;
        if (test.status === 'expected' || test.status === 'flaky') {
          stats.passed++;
        } else if (test.status === 'unexpected') {
          stats.failed++;
        } else if (test.status === 'skipped') {
          stats.skipped++;
        }
        if (test.status === 'skipped') {
          const reasons = (test.annotations || [])
            .filter(annotation => annotation.type === 'skip' || annotation.type === 'fixme')
            .map(annotation => annotation.description || '(未注明原因)');
          skipped.push({ project, file: spec.file, line: spec.line, title: spec.title, reasons: reasons.join('; ') });
        }
      }
    }
  }
  return { perProject, skipped };
};

// Round test time range: the earliest resume marker is the start of the
// first invocation; the latest finished marker is the end of the last one.
// Rounds recorded before the finished marker existed (round 1) have no end
// marker, so the current time is used instead.
const parseTimeRange = (text, mtimeMs) => {
  let start = null;
  let end = null;
  for (const line of text.split('\n')) {
    const begin = line.match(/^=== resume (\S+)/);
    if (begin) {
      const time = Date.parse(begin[1]);
      if (!Number.isNaN(time)) {
        start = start === null ? time : Math.min(start, time);
      }
      continue;
    }
    const finish = line.match(/^=== finished (\S+)/);
    if (finish) {
      const time = Date.parse(finish[1]);
      if (!Number.isNaN(time)) {
        end = Math.max(end || 0, time);
      }
    }
  }
  return { start: start ?? mtimeMs, end: end ?? Date.now() };
};

const formatLocal = (ms) => new Date(ms).toLocaleString('zh-CN', { hour12: false });
const compactLocal = (ms) => {
  const date = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

const browsers = ['chrome', 'huaweiBrowser'];
const sections = [];
const overviewRows = [];
const summaryRows = [];
let overallStart = null;
let overallEnd = null;

for (const browser of browsers) {
  const roundDir = path.join('test-progress', browser, `round${round}`);
  const logPath = path.join(roundDir, 'stream.log');
  if (!fs.existsSync(logPath)) {
    console.log(`[generate-report] missing ${logPath}; run round ${round} for ${browser} first`);
    continue;
  }
  const logText = fs.readFileSync(logPath, 'utf8');
  const { totals, failures } = parseLog(logText);
  const summary = parseSummary(logText);
  const timeRange = parseTimeRange(logText, fs.statSync(logPath).mtimeMs);
  overallStart = overallStart === null ? timeRange.start : Math.min(overallStart, timeRange.start);
  overallEnd = Math.max(overallEnd || 0, timeRange.end);
  const results = parseResults(roundDir);
  const json = results ? null : readJson(browser, roundDir);
  const structured = results || json;
  const projects = [...totals.keys()];
  const label = config.browserLabels[browser] || browser;

  const summaryLines = [];
  for (const project of projects) {
    const total = totals.get(project);
    const failed = failures.filter(failure => failure.project === project).length;
    const stats = structured?.perProject.get(project);
    const rate = stats ? (stats.passed / (total - stats.skipped) * 100).toFixed(2) + '%' : '';
    summaryLines.push(`| ${project} | ${total} | ${stats ? stats.passed : ''} | ${stats ? stats.failed : failed} | ${stats ? stats.skipped : ''} | ${rate} |`);
    overviewRows.push(`| ${label} | ${project} | ${total} | ${stats ? stats.passed : ''} | ${stats ? stats.failed : failed} | ${stats ? stats.skipped : ''} | ${rate} |`);
  }
  sections.push(`### ${label}\n\n| 套件 | 总数 | 通过 | 失败 | 跳过 | 通过率 |\n|---|---|---|---|---|---|\n${summaryLines.join('\n')}`);

  // Prefer structured sums (they know skipped and interrupted tests);
  // otherwise fall back to the per-run summary lines of the log.
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  if (structured) {
    for (const stats of structured.perProject.values()) {
      passed += stats.passed;
      failed += stats.failed;
      skipped += stats.skipped;
    }
  } else if (summary.passed + summary.failed + summary.skipped > 0) {
    passed = summary.passed;
    failed = summary.failed;
    skipped = summary.skipped;
  }
  const total = passed + failed + skipped;
  if (total > 0) {
    summaryRows.push(`| ${label} | ${total} | ${passed} | ${failed} | ${skipped} | ${(passed / (total - skipped) * 100).toFixed(2)}% |`);
  } else {
    summaryRows.push(`| ${label} | | | | | |`);
  }

  for (const project of projects) {
    const projectFailures = failures.filter(failure => failure.project === project);
    const byCategory = new Map();
    for (const failure of projectFailures) {
      const category = categorize(failure.message);
      if (!byCategory.has(category.id)) {
        byCategory.set(category.id, { category, items: [] });
      }
      byCategory.get(category.id).items.push(failure);
    }
    sections.push(`#### ${project} 失败用例分类（${projectFailures.length} 例）\n`);
    for (const { category, items } of [...byCategory.values()].sort((a, b) => b.items.length - a.items.length)) {
      sections.push(`##### ${category.name}（${items.length} 例）\n`);
      sections.push(`- 归因：${category.attribution}`);
      if (category.note) {
        sections.push(`- 说明：${category.note}`);
      }
      sections.push(`\n<details><summary>用例明细</summary>\n`);
      sections.push(`| 位置 | 用例 | 第 ${round} 轮记录的错误 |`);
      sections.push('|---|---|---|');
      for (const item of items) {
        // The rootDir-relative file is what scripts/round-reporter.mjs uses
        // for the failure dumps.
        const relativeFile = item.file.replace(/^tests\//, '');
        const dump = path.join(roundDir, 'failures', item.project, `${relativeFile}#${item.line}.txt`);
        const location = fs.existsSync(dump)
          ? `[${escapeMd(item.file)}:${item.line}](../test-progress/${browser}/round${round}/failures/${item.project}/${relativeFile}#${item.line}.txt)`
          : `${escapeMd(item.file)}:${item.line}`;
        sections.push(`| ${location} | ${escapeMd(item.title)} | ${escapeMd(item.message.slice(0, 200))} |`);
      }
      sections.push('\n</details>\n');
    }
  }

  if (structured?.skipped.length) {
    sections.push(`#### ${label} 跳过的用例（${structured.skipped.length} 例）\n`);
    sections.push('| 项目 | 位置 | 用例 | 跳过原因 |');
    sections.push('|---|---|---|---|');
    for (const item of structured.skipped) {
      sections.push(`| ${item.project} | ${escapeMd(item.file)}:${item.line} | ${escapeMd(item.title)} | ${escapeMd(item.reasons)} |`);
    }
    sections.push('');
  } else {
    sections.push(`#### ${label} 跳过的用例\n`);
    sections.push(config.text.skippedUnknown + '\n');
  }
}

const metadata = [
  `- 测试轮次：第 ${round} 轮`,
  `- 测试时间：${overallStart ? formatLocal(overallStart) : '未记录'} — ${overallEnd ? formatLocal(overallEnd) : '未记录'}（本地时间）`,
  `- 报告生成时间：${formatLocal(Date.now())}（本地时间）`,
].join('\n');

const header = `# Playwright-ohos 第 ${round} 轮测试报告

${metadata}

## ① 用例数量与通过率

> ${config.text.passRateNote}

| 浏览器 | 套件 | 总数 | 通过 | 失败 | 跳过 | 通过率 |
|---|---|---|---|---|---|---|
${overviewRows.join('\n')}

${config.text.browserSummaryTitle}：

| 浏览器 | 总数 | 通过 | 失败 | 跳过 | 通过率 |
|---|---|---|---|---|---|
${summaryRows.join('\n')}

## ② 失败用例与归因

${config.text.section2Intro}

`;

const footer = `
## ③ 跳过的用例

见上文各浏览器小节。

${config.text.footer}
`;

// Report files are never overwritten: the name carries the round number and
// the round end time, so re-running a round leaves the earlier report
// intact alongside the new one.
const outDir = path.join('reports');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `round-${round}-${compactLocal(overallEnd ?? Date.now())}.md`);
fs.writeFileSync(outPath, header + sections.join('\n') + footer);
console.log(`[generate-report] written ${outPath}`);
