// Static multi-version patch probe.
//
// Downloads each playwright-core version, applies the playwright-ohos patch set
// to a scratch copy and reports a per-patch status matrix. No device needed --
// this is pure string matching against the published build output.
//
// Usage:
//   node scripts/probe-versions.mjs                # probe the default version list
//   node scripts/probe-versions.mjs 1.61.1 1.62.1  # probe specific versions
//   PROBE_JSON=1 node scripts/probe-versions.mjs   # emit JSON instead of a table
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const cacheDir = path.join(repoRoot, '.pw-versions');

// Latest patch release of every supported minor, plus the declared floor.
const DEFAULT_VERSIONS = [
  '1.51.0', '1.51.1', '1.52.0', '1.53.2', '1.54.2', '1.55.1',
  '1.56.1', '1.57.0', '1.58.2', '1.59.1', '1.60.0', '1.61.1', '1.62.1',
];

const versions = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_VERSIONS;

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });

// Downloads and extracts playwright-core@version, returns the package root.
const ensureVersion = (version) => {
  const dest = path.join(cacheDir, version);
  const pkgRoot = path.join(dest, 'package');
  if (fs.existsSync(path.join(pkgRoot, 'package.json'))) {
    return pkgRoot;
  }
  fs.mkdirSync(dest, { recursive: true });
  process.stderr.write(`[probe] downloading playwright-core@${version} ...\n`);
  const packed = run('npm', ['pack', `playwright-core@${version}`, '--pack-destination', dest, '--silent']);
  if (packed.status !== 0) {
    throw new Error(`npm pack failed for ${version}: ${packed.stderr}`);
  }
  const tarball = fs.readdirSync(dest).find(name => name.endsWith('.tgz'));
  if (!tarball) {
    throw new Error(`no tarball produced for ${version}`);
  }
  const extracted = run('tar', ['-xzf', path.join(dest, tarball), '-C', dest]);
  if (extracted.status !== 0) {
    throw new Error(`tar failed for ${version}: ${extracted.stderr}`);
  }
  fs.rmSync(path.join(dest, tarball), { force: true });
  return pkgRoot;
};

// Fresh copy per probe so repeated runs always start from pristine sources.
const freshCopy = (pkgRoot, version) => {
  const work = path.join(cacheDir, `${version}-work`);
  fs.rmSync(work, { recursive: true, force: true });
  fs.cpSync(pkgRoot, work, { recursive: true });
  return work;
};

const patch = require(path.join(repoRoot, 'dist/patch.cjs'));

const report = [];
for (const version of versions) {
  let pkgRoot;
  try {
    pkgRoot = ensureVersion(version);
  } catch (error) {
    report.push({ version, error: String(error.message || error) });
    continue;
  }
  const work = freshCopy(pkgRoot, version);
  const target = patch.detectTarget(work);
  const results = patch.applyPatches(work);
  const syntaxOk = patch.checkSyntax(work);
  report.push({
    version,
    layout: target.isBundle ? 'bundle' : 'files',
    syntaxOk,
    results: results.map(r => ({ id: r.id, status: r.status, count: r.count })),
  });
  fs.rmSync(work, { recursive: true, force: true });
}

if (process.env.PROBE_JSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// Status matrix: rows are patch ids, columns are versions.
const ok = report.filter(entry => !entry.error);
const allIds = [];
for (const entry of ok) {
  for (const result of entry.results) {
    if (!allIds.includes(result.id)) {
      allIds.push(result.id);
    }
  }
}

// A patch id may have several variants, each gated to a different version
// sub-range. Aggregate them: the id is covered when any variant applied,
// MISS when a version-appropriate variant existed but its regex did not
// match, and GAP when no variant covers this version at all.
const statusFor = (entry, id) => {
  const all = entry.results.filter(result => result.id === id);
  if (all.some(result => result.status === 'applied' || result.status === 'already')) {
    return 'ok';
  }
  if (all.some(result => result.status === 'not-found')) {
    return 'MISS';
  }
  return 'GAP';
};

const idWidth = Math.max(...allIds.map(id => id.length), 20);
const colWidth = 8;

console.log('');
console.log(`${'patch'.padEnd(idWidth)} ${ok.map(e => e.version.padStart(colWidth)).join('')}`);
console.log(`${'-'.repeat(idWidth)} ${ok.map(() => '-'.repeat(colWidth)).join('')}`);
for (const id of allIds) {
  const cells = ok.map(entry => statusFor(entry, id).padStart(colWidth));
  console.log(`${id.padEnd(idWidth)} ${cells.join('')}`);
}
console.log(`${'-'.repeat(idWidth)} ${ok.map(() => '-'.repeat(colWidth)).join('')}`);
console.log(`${'layout'.padEnd(idWidth)} ${ok.map(e => e.layout.padStart(colWidth)).join('')}`);
console.log(`${'syntax'.padEnd(idWidth)} ${ok.map(e => (e.syntaxOk ? 'ok' : 'FAIL').padStart(colWidth)).join('')}`);
const countOf = (entry, want) => allIds.filter(id => statusFor(entry, id) === want).length;
console.log(`${'MISS (regex broke)'.padEnd(idWidth)} ${ok.map(e => String(countOf(e, 'MISS')).padStart(colWidth)).join('')}`);
console.log(`${'GAP (no variant)'.padEnd(idWidth)} ${ok.map(e => String(countOf(e, 'GAP')).padStart(colWidth)).join('')}`);
console.log('');

for (const entry of report.filter(e => e.error)) {
  console.log(`${entry.version}: ERROR ${entry.error}`);
}
