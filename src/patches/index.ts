// Patch engine: applies the playwright-ohos patches to playwright-core.
// Supported layouts: the single bundle (lib/coreBundle.js, 1.60+) and the
// separate server files (lib/server/*.js, 1.51-1.59). Patches are
// idempotent: replacements carry a `@playwright-ohos-patched` marker and
// are skipped when the marker is already present.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

import { platformBundlePatches, platformFilesPatches } from './platform';
import { arkwebTargetBundlePatches, arkwebTargetFilesPatches } from './arkweb/targets';
import { arkwebScreenshotBundlePatches, arkwebScreenshotFilesPatches } from './arkweb/screenshot';
import { arkwebContextBundlePatches, arkwebContextFilesPatches } from './arkweb/context';
import { arkwebPageBundlePatches, arkwebPageFilesPatches } from './arkweb/page';
import { arkwebStorageBundlePatches, arkwebStorageFilesPatches } from './arkweb/storage';
import { PATCHED_MARKER, versionMatches } from './types';
import type { PatchDefinition, PatchResult } from './types';

export { PATCHED_MARKER, marker, OHOS_REQUIRE, compareVersions, versionMatches } from './types';
export type { PatchDefinition, PatchResult } from './types';

const bundlePatches: PatchDefinition[] = [
  ...platformBundlePatches,
  ...arkwebTargetBundlePatches,
  ...arkwebScreenshotBundlePatches,
  ...arkwebContextBundlePatches,
  ...arkwebPageBundlePatches,
  ...arkwebStorageBundlePatches,
];

const filesPatches: PatchDefinition[] = [
  ...platformFilesPatches,
  ...arkwebTargetFilesPatches,
  ...arkwebScreenshotFilesPatches,
  ...arkwebContextFilesPatches,
  ...arkwebPageFilesPatches,
  ...arkwebStorageFilesPatches,
];

const DEFAULT_BUNDLE_FILE = 'lib/coreBundle.js';

export interface PatchTarget {
  packageRoot: string;
  version: string;
  isBundle: boolean;
}

export const detectTarget = (packageRoot: string): PatchTarget => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const isBundle = fs.existsSync(path.join(packageRoot, DEFAULT_BUNDLE_FILE));
  return { packageRoot, version: packageJson.version, isBundle };
};

export const resolvePackageRoot = (): string => {
  const packageJsonPath = require.resolve('playwright-core/package.json');
  return path.dirname(packageJsonPath);
};

const applyPatchesToFile = (filePath: string, patches: PatchDefinition[], version: string): PatchResult[] => {
  let source = fs.readFileSync(filePath, 'utf8');
  const results: PatchResult[] = [];
  for (const patch of patches) {
    if (!versionMatches(version, patch.versions)) {
      results.push({ id: patch.id, description: patch.description, status: 'skipped', count: 0 });
      continue;
    }
    if (source.includes(`${PATCHED_MARKER}: ${patch.id}`)) {
      results.push({ id: patch.id, description: patch.description, status: 'already', count: 0 });
      continue;
    }
    const matches = [...source.matchAll(patch.find)];
    if (matches.length === 0) {
      results.push({ id: patch.id, description: patch.description, status: 'not-found', count: 0 });
      continue;
    }
    let updated = '';
    let lastIndex = 0;
    for (const match of matches) {
      updated += source.slice(lastIndex, match.index);
      updated += patch.replace(match[0], ...match.slice(1));
      lastIndex = match.index! + match[0].length;
    }
    updated += source.slice(lastIndex);
    source = updated;
    results.push({ id: patch.id, description: patch.description, status: 'applied', count: matches.length });
  }
  fs.writeFileSync(filePath, source);
  return results;
};

export const applyPatches = (packageRoot: string): PatchResult[] => {
  const target = detectTarget(packageRoot);
  // A/B verification support: PW_OHOS_SKIP_PATCHES lists patch ids that are
  // not applied, so the behavior with and without a patch can be compared.
  // Skipping only works against pristine playwright-core files (run
  // `pnpm install --force` first); already-patched files keep their code.
  const skipIds = new Set((process.env.PW_OHOS_SKIP_PATCHES || '').split(',').map(id => id.trim()).filter(Boolean));
  const patches = (target.isBundle ? bundlePatches : filesPatches).filter(patch => !skipIds.has(patch.id));
  const grouped = new Map<string, PatchDefinition[]>();
  for (const patch of patches) {
    const file = patch.file || DEFAULT_BUNDLE_FILE;
    if (!grouped.has(file))
      grouped.set(file, []);
    grouped.get(file)!.push(patch);
  }
  const results: PatchResult[] = [];
  for (const [file, filePatches] of grouped) {
    const filePath = path.join(packageRoot, file);
    if (!fs.existsSync(filePath)) {
      for (const patch of filePatches)
        results.push({ id: patch.id, description: patch.description, status: 'skipped', count: 0 });
      continue;
    }
    results.push(...applyPatchesToFile(filePath, filePatches, target.version));
  }
  return results;
};

export const checkSyntax = (packageRoot: string): boolean => {
  const target = detectTarget(packageRoot);
  const files = target.isBundle ? [DEFAULT_BUNDLE_FILE] : [...new Set(filesPatches.map(patch => patch.file!).filter(Boolean))];
  for (const file of files) {
    const filePath = path.join(packageRoot, file);
    if (!fs.existsSync(filePath))
      continue;
    const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
    if (result.status !== 0)
      return false;
  }
  return true;
};

export const main = (): void => {
  const packageRoot = resolvePackageRoot();
  const target = detectTarget(packageRoot);
  const results = applyPatches(packageRoot);
  for (const result of results) {
    if (result.status === 'skipped')
      continue;
    console.log(`playwright-ohos: patch ${result.id} (${result.description}): ${result.status}${result.count > 1 ? ` x${result.count}` : ''}`);
  }
  const appliedCount = results.filter(result => result.status === 'applied').length;
  const missing = results.filter(result => result.status === 'not-found');
  console.log(`playwright-ohos: playwright-core ${target.version} (${target.isBundle ? 'bundle' : 'separate files'} layout)`);
  if (checkSyntax(packageRoot)) {
    console.log(`playwright-ohos: patched ${appliedCount} patch(es) in ${packageRoot}`);
  } else {
    console.error(`playwright-ohos: syntax check failed after patching ${packageRoot}`);
    process.exitCode = 1;
  }
  if (missing.length) {
    console.warn(`playwright-ohos: warning: ${missing.length} patch(es) not found, the playwright-core version may be unsupported`);
    for (const patch of missing)
      console.warn(`playwright-ohos:   - ${patch.id}: ${patch.description}`);
  }
};

if (require.main === module) {
  main();
}
