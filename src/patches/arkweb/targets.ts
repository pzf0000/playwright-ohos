// ArkWeb target recognition patches: ArkWeb reports page targets with
// type "other" and may omit browserContextId for them.
import { marker } from '../types';
import type { PatchDefinition } from '../types';

export const arkwebTargetBundlePatches: PatchDefinition[] = [
  {
    id: 'patch-2-other-targets',
    description: 'ArkWeb "other" targets recognized as pages',
    find: /const treatOtherAsPage = targetInfo\.type === "other" && process\.env\.PW_CHROMIUM_ATTACH_TO_OTHER;/g,
    replace: () => `const treatOtherAsPage = targetInfo.type === "other" && (process.env.PW_CHROMIUM_ATTACH_TO_OTHER || this._isArkWeb); ${marker('patch-2-other-targets')}`,
  },
  {
    id: 'patch-2a-context-assert',
    description: 'ArkWeb targets without browserContextId',
    find: /assert\(targetInfo\.browserContextId, "targetInfo: " \+ JSON\.stringify\(targetInfo, null, 2\)\);/g,
    replace: () => `if (!this._isArkWeb) {
          assert(targetInfo.browserContextId, "targetInfo: " + JSON.stringify(targetInfo, null, 2));
        } ${marker('patch-2a-context-assert')}`,
  },
  {
    // The device browser restores its previous session history when the
    // startup page initializes; reset it once the page is ready so goBack
    // on a fresh page behaves like a clean launch.
    id: 'patch-2b-history-reset',
    description: 'startup page history reset on attach',
    find: /this\._crPages\.set\(targetInfo\.targetId, crPage\);/g,
    replace: (match) => `${match}
        ${marker('patch-2b-history-reset')}
        if (this._isArkWeb) {
          crPage._page.waitForInitializedOrError().then(async () => {
            await crPage._mainFrameSession._client.send("Page.resetNavigationHistory").catch(() => {});
          }).catch(() => {});
        }`,
  },
];

export const arkwebTargetFilesPatches: PatchDefinition[] = [
  {
    id: 'patch-2-other-targets',
    description: 'ArkWeb "other" targets recognized as pages',
    file: 'lib/server/chromium/crBrowser.js',
    find: /const treatOtherAsPage = targetInfo\.type === ["']other["'] && process\.env\.PW_CHROMIUM_ATTACH_TO_OTHER;/g,
    replace: () => `const treatOtherAsPage = targetInfo.type === "other" && (process.env.PW_CHROMIUM_ATTACH_TO_OTHER || this._isArkWeb); ${marker('patch-2-other-targets')}`,
  },
  {
    id: 'patch-2a-context-assert',
    description: 'ArkWeb targets without browserContextId',
    file: 'lib/server/chromium/crBrowser.js',
    find: /\(0, (\w+)\.assert\)\(targetInfo\.browserContextId, ["']targetInfo: ["'] \+ JSON\.stringify\(targetInfo, null, 2\)\);/g,
    replace: (match, importName) => `if (!this._isArkWeb) {
      (0, ${importName}.assert)(targetInfo.browserContextId, "targetInfo: " + JSON.stringify(targetInfo, null, 2));
    } ${marker('patch-2a-context-assert')}`,
  },
  {
    id: 'patch-2b-history-reset',
    description: 'startup page history reset on attach',
    file: 'lib/server/chromium/crBrowser.js',
    versions: '>=1.51.0 <1.60.0',
    find: /this\._crPages\.set\(targetInfo\.targetId, crPage\);/g,
    replace: (match) => `${match}
    ${marker('patch-2b-history-reset')}
    if (this._isArkWeb) {
      crPage._page.waitForInitializedOrError().then(async () => {
        await crPage._mainFrameSession._client.send('Page.resetNavigationHistory').catch(() => {});
      }).catch(() => {});
    }`,
  },
];
