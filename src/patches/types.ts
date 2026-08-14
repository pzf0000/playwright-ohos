// Shared types and helpers for the patch definitions and the patch engine.
import path from 'path';

export const PATCHED_MARKER = '@playwright-ohos-patched';

// Absolute path of the playwright-ohos entry, injected into the patched files
// so the patched code can reach the launcher at runtime.
const INDEX_CJS_PATH = path.join(__dirname, 'index.cjs');
export const OHOS_REQUIRE = JSON.stringify(INDEX_CJS_PATH);

export interface PatchDefinition {
  id: string;
  description: string;
  find: RegExp;
  replace: (match: string, ...groups: string[]) => string;
  /**
   * File to patch, relative to the playwright-core package root.
   * Defaults to `lib/coreBundle.js` for the bundle era.
   */
  file?: string;
  /**
   * Restricts the patch to a semver range of playwright-core, e.g.
   * `>=1.51.0 <1.54.0`. Patches outside the range are skipped silently.
   */
  versions?: string;
}

export interface PatchResult {
  id: string;
  description: string;
  status: 'applied' | 'already' | 'not-found' | 'skipped';
  count: number;
}

export const marker = (id: string): string => `/* ${PATCHED_MARKER}: ${id} */`;

export const compareVersions = (a: string, b: string): number => {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0)
      return diff;
  }
  return 0;
};

/** Parses a simple semver range like `>=1.51.0 <1.54.0` or `1.57.0`. */
const parseRange = (range: string): { min?: string; minInclusive: boolean; max?: string; maxInclusive: boolean; exact?: string } => {
  const result: { min?: string; minInclusive: boolean; max?: string; maxInclusive: boolean; exact?: string } = {
    minInclusive: true,
    maxInclusive: false,
  };
  for (const part of range.trim().split(/\s+/)) {
    if (part.startsWith('>=')) {
      result.min = part.slice(2);
      result.minInclusive = true;
    } else if (part.startsWith('>')) {
      result.min = part.slice(1);
      result.minInclusive = false;
    } else if (part.startsWith('<=')) {
      result.max = part.slice(2);
      result.maxInclusive = true;
    } else if (part.startsWith('<')) {
      result.max = part.slice(1);
      result.maxInclusive = false;
    } else {
      result.exact = part;
    }
  }
  return result;
};

export const versionMatches = (version: string, range: string | undefined): boolean => {
  if (!range)
    return true;
  const { min, minInclusive, max, maxInclusive, exact } = parseRange(range);
  if (exact && compareVersions(version, exact) !== 0)
    return false;
  if (min !== undefined) {
    const diff = compareVersions(version, min);
    if (diff < 0 || (diff === 0 && !minInclusive))
      return false;
  }
  if (max !== undefined) {
    const diff = compareVersions(version, max);
    if (diff > 0 || (diff === 0 && !maxInclusive))
      return false;
  }
  return true;
};
