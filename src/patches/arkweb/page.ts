// ArkWeb page patches: creating new targets degrades after a handful of
// tests, so an existing page is reused and closing it only navigates to
// about:blank instead of closing the target.
import { marker } from '../types';
import type { PatchDefinition } from '../types';

export const arkwebPageBundlePatches: PatchDefinition[] = [
  {
    id: 'patch-6-reuse-page',
    description: 'ArkWeb reuses an existing page',
    find: /async doCreateNewPage\(\) \{\n\s+const \{ targetId \} = await this\._browser\._session\.send\("Target\.createTarget", \{ url: "about:blank", browserContextId: this\._browserContextId \}\);\n\s+return this\._browser\._crPages\.get\(targetId\)\._page;/g,
    replace: () => `async doCreateNewPage() {
        ${marker('patch-6-reuse-page')}
        if (this._browser._isArkWeb) {
          for (const crPage of this._browser._crPages.values()) {
            if (crPage._browserContext === this && crPage._page._closedState === "open") {
              return crPage._page;
            }
          }
        }
        const { targetId } = await this._browser._session.send("Target.createTarget", { url: "about:blank", browserContextId: this._browserContextId });
        return this._browser._crPages.get(targetId)._page;`,
  },
  {
    // Closing a target blocks the ArkWeb debug channel, so the page is
    // kept alive and reused by the next test.
    id: 'patch-6b-close-page',
    description: 'ArkWeb page close keeps the page for reuse',
    find: /async _closePage\(crPage\) \{\n\s+await this\._session\.send\("Target\.closeTarget", \{ targetId: crPage\._targetId \}\);\n\s+\}/g,
    replace: () => `async _closePage(crPage) {
        ${marker('patch-6b-close-page')}
        if (this._isArkWeb) {
          await crPage._mainFrameSession._client.send("Page.navigate", { url: "about:blank" }).catch(() => {});
          return;
        }
        await this._session.send("Target.closeTarget", { targetId: crPage._targetId });
      }`,
  },
];

export const arkwebPageFilesPatches: PatchDefinition[] = [
  {
    id: 'patch-6-reuse-page',
    description: 'ArkWeb reuses an existing page',
    file: 'lib/server/chromium/crBrowser.js',
    versions: '>=1.51.0 <1.53.0',
    find: /async doCreateNewPage\(\) \{\n\s+\(0, (\w+)\.assertBrowserContextIsNotOwned\)\(this\);/g,
    replace: (match, importName) => `async doCreateNewPage() {
    ${marker('patch-6-reuse-page')}
    if (this._browser._isArkWeb) {
      for (const crPage of this._browser._crPages.values()) {
        if (crPage._browserContext === this && crPage._page._closedState === "open") {
          return crPage._page;
        }
      }
    }
    (0, ${importName}.assertBrowserContextIsNotOwned)(this);`,
  },
  {
    id: 'patch-6-reuse-page',
    description: 'ArkWeb reuses an existing page',
    file: 'lib/server/chromium/crBrowser.js',
    versions: '>=1.53.0 <1.55.0',
    find: /async doCreateNewPage\((markAsServerSideOnly)\) \{\n\s+const \{ targetId \} = await this\._browser\._session\.send\("Target\.createTarget", \{ url: "about:blank", browserContextId: this\._browserContextId \}\);/g,
    replace: () => `async doCreateNewPage(markAsServerSideOnly) {
    ${marker('patch-6-reuse-page')}
    if (this._browser._isArkWeb) {
      for (const crPage of this._browser._crPages.values()) {
        if (crPage._browserContext === this && crPage._page._closedState === "open") {
          return crPage._page;
        }
      }
    }
    const { targetId } = await this._browser._session.send("Target.createTarget", { url: "about:blank", browserContextId: this._browserContextId });`,
  },
  {
    id: 'patch-6-reuse-page',
    description: 'ArkWeb reuses an existing page',
    file: 'lib/server/chromium/crBrowser.js',
    versions: '>=1.55.0 <1.60.0',
    find: /async doCreateNewPage\(\) \{\n\s+const \{ targetId \} = await this\._browser\._session\.send\("Target\.createTarget", \{ url: "about:blank", browserContextId: this\._browserContextId \}\);/g,
    replace: () => `async doCreateNewPage() {
    ${marker('patch-6-reuse-page')}
    if (this._browser._isArkWeb) {
      for (const crPage of this._browser._crPages.values()) {
        if (crPage._browserContext === this && crPage._page._closedState === "open") {
          return crPage._page;
        }
      }
    }
    const { targetId } = await this._browser._session.send("Target.createTarget", { url: "about:blank", browserContextId: this._browserContextId });`,
  },
  {
    id: 'patch-6b-close-page',
    description: 'ArkWeb page close keeps the page for reuse',
    file: 'lib/server/chromium/crBrowser.js',
    versions: '>=1.51.0 <1.52.0',
    find: /async _closePage\(crPage\) \{\n\s+await this\._session\.send\('Target\.closeTarget', \{\n\s+targetId: crPage\._targetId\n\s+\}\);\n\s+\}/g,
    replace: () => `async _closePage(crPage) {
    ${marker('patch-6b-close-page')}
    if (this._isArkWeb) {
      await crPage._mainFrameSession._client.send("Page.navigate", { url: "about:blank" }).catch(() => {});
      return;
    }
    await this._session.send('Target.closeTarget', {
      targetId: crPage._targetId
    });
  }`,
  },
  {
    id: 'patch-6b-close-page',
    description: 'ArkWeb page close keeps the page for reuse',
    file: 'lib/server/chromium/crBrowser.js',
    versions: '>=1.52.0 <1.60.0',
    find: /async _closePage\(crPage\) \{\n\s+await this\._session\.send\("Target\.closeTarget", \{ targetId: crPage\._targetId \}\);\n\s+\}/g,
    replace: () => `async _closePage(crPage) {
    ${marker('patch-6b-close-page')}
    if (this._isArkWeb) {
      await crPage._mainFrameSession._client.send("Page.navigate", { url: "about:blank" }).catch(() => {});
      return;
    }
    await this._session.send("Target.closeTarget", { targetId: crPage._targetId });
  }`,
  },
];
