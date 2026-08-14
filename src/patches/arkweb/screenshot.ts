// ArkWeb screenshot patches: ArkWeb never responds to Page.captureScreenshot,
// so the display is captured through HDC. Other HDC browsers keep the CDP
// screenshot and only fall back to HDC when it fails.
import { marker, OHOS_REQUIRE } from '../types';
import type { PatchDefinition } from '../types';

export const arkwebScreenshotBundlePatches: PatchDefinition[] = [
  {
    id: 'patch-3-screenshot',
    description: 'CDP screenshot HDC fallback',
    find: /async takeScreenshot\(progress2, format2, documentRect, viewportRect, quality, fitsViewport, scale\) \{\n\s+const \{ visualViewport, contentSize, cssContentSize \} = await progress2\.race\(this\._mainFrameSession\._client\.send\("Page\.getLayoutMetrics"\)\);/g,
    replace: () => `async takeScreenshot(progress2, format2, documentRect, viewportRect, quality, fitsViewport, scale) {
        ${marker('patch-3-screenshot')}
        if (this._browserContext._browser._isArkWeb) {
          const { hdcScreenshot } = require(${OHOS_REQUIRE});
          return await hdcScreenshot(this._browserContext._browser._hdcBackend);
        }
        const { visualViewport, contentSize, cssContentSize } = await progress2.race(this._mainFrameSession._client.send("Page.getLayoutMetrics"));`,
  },
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

export const arkwebScreenshotFilesPatches: PatchDefinition[] = [
  {
    id: 'patch-3-screenshot',
    description: 'CDP screenshot HDC fallback',
    file: 'lib/server/chromium/crPage.js',
    versions: '>=1.51.0 <1.52.0',
    find: /async takeScreenshot\(progress, format, documentRect, viewportRect, quality, fitsViewport, scale\) \{\n\s+const \{\n\s+visualViewport\n\s+\} = await this\._mainFrameSession\._client\.send\(['"]Page\.getLayoutMetrics['"]\);/g,
    replace: () => `async takeScreenshot(progress, format, documentRect, viewportRect, quality, fitsViewport, scale) {
    ${marker('patch-3-screenshot')}
    if (this._browserContext._browser._isArkWeb) {
      const { hdcScreenshot } = require(${OHOS_REQUIRE});
      return await hdcScreenshot(this._browserContext._browser._hdcBackend);
    }
    const {
      visualViewport
    } = await this._mainFrameSession._client.send('Page.getLayoutMetrics');`,
  },
  {
    id: 'patch-3-screenshot',
    description: 'CDP screenshot HDC fallback',
    file: 'lib/server/chromium/crPage.js',
    versions: '>=1.52.0 <1.54.0',
    find: /async takeScreenshot\(progress, format, documentRect, viewportRect, quality, fitsViewport, scale\) \{\n\s+const \{ visualViewport \} = await this\._mainFrameSession\._client\.send\("Page\.getLayoutMetrics"\);/g,
    replace: () => `async takeScreenshot(progress, format, documentRect, viewportRect, quality, fitsViewport, scale) {
    ${marker('patch-3-screenshot')}
    if (this._browserContext._browser._isArkWeb) {
      const { hdcScreenshot } = require(${OHOS_REQUIRE});
      return await hdcScreenshot(this._browserContext._browser._hdcBackend);
    }
    const { visualViewport } = await this._mainFrameSession._client.send("Page.getLayoutMetrics");`,
  },
  {
    id: 'patch-3-screenshot',
    description: 'CDP screenshot HDC fallback',
    file: 'lib/server/chromium/crPage.js',
    versions: '>=1.54.0 <1.60.0',
    find: /async takeScreenshot\(progress, format, documentRect, viewportRect, quality, fitsViewport, scale\) \{\n\s+const \{ visualViewport(?:, contentSize, cssContentSize)? \} = await progress\.race\(this\._mainFrameSession\._client\.send\("Page\.getLayoutMetrics"\)\);/g,
    replace: (match) => `async takeScreenshot(progress, format, documentRect, viewportRect, quality, fitsViewport, scale) {
    ${marker('patch-3-screenshot')}
    if (this._browserContext._browser._isArkWeb) {
      const { hdcScreenshot } = require(${OHOS_REQUIRE});
      return await hdcScreenshot(this._browserContext._browser._hdcBackend);
    }
${match.slice(match.indexOf('const'))}`,
  },
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
