// Screenshot fallback patch shared by every device browser: the native CDP
// screenshot is used and only a failure falls back to the HDC display
// capture (png only).
import { marker, OHOS_REQUIRE } from '../types';
import type { PatchDefinition } from '../types';

export const commonScreenshotBundlePatches: PatchDefinition[] = [
  {
    id: 'patch-3b-screenshot-fallback',
    description: 'CDP screenshot failure falls back to HDC',
    find: /const result2 = await progress2\.race\(this\._mainFrameSession\._client\.send\("Page\.captureScreenshot", \{ format: format2, quality, clip, captureBeyondViewport: !fitsViewport \}\)\);\n\s+return Buffer\.from\(result2\.data, "base64"\);/g,
    replace: () => `try {
          const result2 = await progress2.race(this._mainFrameSession._client.send("Page.captureScreenshot", { format: format2, quality, clip, captureBeyondViewport: !fitsViewport }));
          return Buffer.from(result2.data, "base64");
        } catch (error) {
          ${marker('patch-3b-screenshot-fallback')}
          const hdcBackend = this._browserContext._browser._hdcBackend;
          if (!hdcBackend || format2 !== "png") {
            throw error;
          }
          const { hdcScreenshot } = require(${OHOS_REQUIRE});
          return await hdcScreenshot(hdcBackend);
        }`,
  },
];

export const commonScreenshotFilesPatches: PatchDefinition[] = [
  {
    id: 'patch-3b-screenshot-fallback',
    description: 'CDP screenshot failure falls back to HDC',
    file: 'lib/server/chromium/crPage.js',
    versions: '>=1.51.0 <1.52.0',
    find: /const result = await this\._mainFrameSession\._client\.send\('Page\.captureScreenshot', \{\n\s+format,\n\s+quality,\n\s+clip,\n\s+captureBeyondViewport: !fitsViewport\n\s+\}\);\n\s+return Buffer\.from\(result\.data, 'base64'\);/g,
    replace: () => `try {
    const result = await this._mainFrameSession._client.send('Page.captureScreenshot', {
      format,
      quality,
      clip,
      captureBeyondViewport: !fitsViewport
    });
    return Buffer.from(result.data, 'base64');
  } catch (error) {
    ${marker('patch-3b-screenshot-fallback')}
    const hdcBackend = this._browserContext._browser._hdcBackend;
    if (!hdcBackend || format !== 'png') {
      throw error;
    }
    const { hdcScreenshot } = require(${OHOS_REQUIRE});
    return await hdcScreenshot(hdcBackend);
  }`,
  },
  {
    id: 'patch-3b-screenshot-fallback',
    description: 'CDP screenshot failure falls back to HDC',
    file: 'lib/server/chromium/crPage.js',
    versions: '>=1.52.0 <1.54.0',
    find: /const result = await this\._mainFrameSession\._client\.send\("Page\.captureScreenshot", \{ format, quality, clip, captureBeyondViewport: !fitsViewport \}\);\n\s+return Buffer\.from\(result\.data, "base64"\);/g,
    replace: () => `try {
    const result = await this._mainFrameSession._client.send("Page.captureScreenshot", { format, quality, clip, captureBeyondViewport: !fitsViewport });
    return Buffer.from(result.data, "base64");
  } catch (error) {
    ${marker('patch-3b-screenshot-fallback')}
    const hdcBackend = this._browserContext._browser._hdcBackend;
    if (!hdcBackend || format !== "png") {
      throw error;
    }
    const { hdcScreenshot } = require(${OHOS_REQUIRE});
    return await hdcScreenshot(hdcBackend);
  }`,
  },
  {
    id: 'patch-3b-screenshot-fallback',
    description: 'CDP screenshot failure falls back to HDC',
    file: 'lib/server/chromium/crPage.js',
    versions: '>=1.54.0 <1.60.0',
    find: /const result = await progress\.race\(this\._mainFrameSession\._client\.send\("Page\.captureScreenshot", \{ format, quality, clip, captureBeyondViewport: !fitsViewport \}\)\);\n\s+return Buffer\.from\(result\.data, "base64"\);/g,
    replace: () => `try {
    const result = await progress.race(this._mainFrameSession._client.send("Page.captureScreenshot", { format, quality, clip, captureBeyondViewport: !fitsViewport }));
    return Buffer.from(result.data, "base64");
  } catch (error) {
    ${marker('patch-3b-screenshot-fallback')}
    const hdcBackend = this._browserContext._browser._hdcBackend;
    if (!hdcBackend || format !== "png") {
      throw error;
    }
    const { hdcScreenshot } = require(${OHOS_REQUIRE});
    return await hdcScreenshot(hdcBackend);
  }`,
  },
];
