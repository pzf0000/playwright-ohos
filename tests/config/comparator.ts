/**
 * Local PNG comparator replacing the playwright-core internal image
 * comparator used by tests/config/comparator.ts.
 */
import { PNG } from 'playwright-core/lib/utilsBundle';

type ComparatorResult = { diff?: Buffer; errorMessage: string; } | null;
type ImageComparatorOptions = { threshold?: number, maxDiffPixels?: number, maxDiffPixelRatio?: number };

export const comparePNGs = (actual: Buffer, expected: Buffer, options: ImageComparatorOptions = {}): ComparatorResult => {
  const actualImage = PNG.sync.read(actual);
  const expectedImage = PNG.sync.read(expected);
  if (actualImage.width !== expectedImage.width || actualImage.height !== expectedImage.height) {
    return {
      errorMessage: `Expected an image ${expectedImage.width}px by ${expectedImage.height}px, received ${actualImage.width}px by ${actualImage.height}px.`,
    };
  }
  const threshold = options.threshold ?? 0.1;
  const maxDiffPixels = options.maxDiffPixels ?? options.maxDiffPixelRatio! * actualImage.width * actualImage.height;
  const diff = new PNG({ width: actualImage.width, height: actualImage.height });
  let diffPixels = 0;
  for (let i = 0; i < actualImage.data.length; i += 4) {
    const dr = Math.abs(actualImage.data[i] - expectedImage.data[i]);
    const dg = Math.abs(actualImage.data[i + 1] - expectedImage.data[i + 1]);
    const db = Math.abs(actualImage.data[i + 2] - expectedImage.data[i + 2]);
    const da = Math.abs(actualImage.data[i + 3] - expectedImage.data[i + 3]);
    if (dr > threshold || dg > threshold || db > threshold || da > threshold) {
      diffPixels++;
      diff.data[i] = 255;
      diff.data[i + 1] = 0;
      diff.data[i + 2] = 0;
      diff.data[i + 3] = 255;
    } else {
      diff.data[i + 3] = 0;
    }
  }
  if (diffPixels > maxDiffPixels) {
    return {
      diff: PNG.sync.write(diff),
      errorMessage: `${diffPixels} pixels (ratio ${(diffPixels / (actualImage.width * actualImage.height)).toFixed(6)} of all image pixels) are different.`,
    };
  }
  return null;
};
