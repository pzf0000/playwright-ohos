// ArkWeb context patches: ArkWeb cannot create additional browser contexts
// and cannot dispose them, so the default context is reused and closing it
// cleans up state instead of closing the browser.
import { marker } from '../types';
import type { PatchDefinition } from '../types';

export const arkwebContextBundlePatches: PatchDefinition[] = [
  {
    id: 'patch-5-reuse-context',
    description: 'ArkWeb reuses the default BrowserContext',
    find: /async doCreateNewContext\((\w+)\) \{\n\s+const proxy = \1\.proxyOverride \|\| \1\.proxy;\n\s+let proxyBypassList = void 0;/g,
    replace: (match, optionsName) => `async doCreateNewContext(${optionsName}) {
        ${marker('patch-5-reuse-context')}
        if (this._isArkWeb && this._defaultContext) {
          return this._defaultContext;
        }
        const proxy = ${optionsName}.proxyOverride || ${optionsName}.proxy;
        let proxyBypassList = void 0;`,
  },
  {
    // ArkWeb context close cleans up pages, bindings and storage instead
    // of closing the browser.
    id: 'patch-7-context-close',
    description: 'ArkWeb context close cleans up instead of closing the browser',
    find: /async doClose\((\w+)\) \{\n\s+await this\.dialogManager\.closeBeforeUnloadDialogs\(\);\n\s+if \(!this\._browserContextId\) \{\n\s+return "close-browser";\n\s+\}/g,
    replace: (match, reasonName) => `async doClose(${reasonName}) {
        await this.dialogManager.closeBeforeUnloadDialogs();
        ${marker('patch-7-context-close')}
        if (this._browser._isArkWeb) {
          for (const binding of this._pageBindings.values()) {
            await binding.dispose().catch(() => {});
          }
          const pages = [...this._crPages()];
          for (const crPage of pages) {
            await this._browser._closePage(crPage).catch(() => {});
          }
          for (const [targetId, serviceWorker] of this._browser._serviceWorkers) {
            if (serviceWorker.browserContext !== this) {
              continue;
            }
            serviceWorker.didClose();
            this._browser._serviceWorkers.delete(targetId);
          }
          try {
            await this._browser._session.send("Storage.clearDataForOrigin", { origin: "*", storageTypes: "all" });
          } catch {
          }
          try {
            await this._browser._session.send("Browser.resetPermissions", { browserContextId: this._browserContextId });
          } catch {
          }
          return;
        }
        if (!this._browserContextId) {
          return "close-browser";
        }`,
  },
  {
    // The reused default context is already "closing" when tests close it
    // a second time, and the regular close path skips emitting Close.
    // Emit it so the dispatcher of this close call notifies the client.
    id: 'patch-7b-close-notify',
    description: 'ArkWeb reused context emits Close on every close',
    find: /if \(!this\._customCloseHandler\)\n\s+this\._didCloseInternal\(\);\n\s+\}\n\s+await this\._closePromise;/g,
    replace: () => `${marker('patch-7b-close-notify')}
        if (!this._customCloseHandler) {
            this._didCloseInternal();
          } else if (this._browser._isArkWeb) {
            this._didCloseInternal();
          }
        }
        await this._closePromise;`,
  },
];

export const arkwebContextFilesPatches: PatchDefinition[] = [
  {
    id: 'patch-5-reuse-context',
    description: 'ArkWeb reuses the default BrowserContext',
    file: 'lib/server/chromium/crBrowser.js',
    find: /async doCreateNewContext\((\w+)\) \{\n\s+const proxy = \1\.proxyOverride \|\| \1\.proxy;\n\s+let proxyBypassList = (?:undefined|void 0);/g,
    replace: (match, optionsName) => `async doCreateNewContext(${optionsName}) {
    ${marker('patch-5-reuse-context')}
    if (this._isArkWeb && this._defaultContext) {
      return this._defaultContext;
    }
    const proxy = ${optionsName}.proxyOverride || ${optionsName}.proxy;
    let proxyBypassList = void 0;`,
  },
  {
    id: 'patch-7-context-close',
    description: 'ArkWeb context close cleans up instead of closing the browser',
    file: 'lib/server/chromium/crBrowser.js',
    versions: '>=1.51.0 <1.53.0',
    find: /const openedBeforeUnloadDialogs = \[\];/g,
    replace: () => `${marker('patch-7-context-close')}

    if (this._browser._isArkWeb) {
      for (const binding of this._pageBindings.values()) {
        await binding.dispose().catch(() => {});
      }
      const pages = [...this._crPages()];
      for (const crPage of pages) {
        await this._browser._closePage(crPage).catch(() => {});
      }
      for (const [targetId, serviceWorker] of this._browser._serviceWorkers) {
        if (serviceWorker.browserContext !== this) {
          continue;
        }
        serviceWorker.didClose();
        this._browser._serviceWorkers.delete(targetId);
      }
      try {
        await this._browser._session.send("Storage.clearDataForOrigin", { origin: "*", storageTypes: "all" });
      } catch {
      }
      try {
        await this._browser._session.send("Browser.resetPermissions", { browserContextId: this._browserContextId });
      } catch {
      }
      return;
    }
    const openedBeforeUnloadDialogs = [];`,
  },
  {
    id: 'patch-7-context-close',
    description: 'ArkWeb context close cleans up instead of closing the browser',
    file: 'lib/server/chromium/crBrowser.js',
    versions: '>=1.53.0 <1.60.0',
    find: /async doClose\((\w+)\) \{\n\s+await this\.dialogManager\.closeBeforeUnloadDialogs\(\);\n\s+if \(!this\._browserContextId\) \{/g,
    replace: (match, reasonName) => `async doClose(${reasonName}) {
    await this.dialogManager.closeBeforeUnloadDialogs();
    ${marker('patch-7-context-close')}
    if (this._browser._isArkWeb) {
      for (const binding of this._pageBindings.values()) {
        await binding.dispose().catch(() => {});
      }
      const pages = [...this._crPages()];
      for (const crPage of pages) {
        await this._browser._closePage(crPage).catch(() => {});
      }
      for (const [targetId, serviceWorker] of this._browser._serviceWorkers) {
        if (serviceWorker.browserContext !== this) {
          continue;
        }
        serviceWorker.didClose();
        this._browser._serviceWorkers.delete(targetId);
      }
      try {
        await this._browser._session.send("Storage.clearDataForOrigin", { origin: "*", storageTypes: "all" });
      } catch {
      }
      try {
        await this._browser._session.send("Browser.resetPermissions", { browserContextId: this._browserContextId });
      } catch {
      }
      return;
    }
    if (!this._browserContextId) {`,
  },
  {
    id: 'patch-7b-close-notify',
    description: 'ArkWeb reused context emits Close on every close',
    file: 'lib/server/browserContext.js',
    versions: '>=1.51.0 <1.52.0',
    find: /if \(!this\._customCloseHandler\) this\._didCloseInternal\(\);\n\s+\}\n\s+await this\._closePromise;/g,
    replace: () => `${marker('patch-7b-close-notify')}
      if (!this._customCloseHandler) {
        this._didCloseInternal();
      } else if (this._browser._isArkWeb) {
        this._didCloseInternal();
      }
    }
    await this._closePromise;`,
  },
  {
    id: 'patch-7b-close-notify',
    description: 'ArkWeb reused context emits Close on every close',
    file: 'lib/server/browserContext.js',
    versions: '>=1.52.0 <1.60.0',
    find: /if \(!this\._customCloseHandler\)\n\s+this\._didCloseInternal\(\);\n\s+\}\n\s+await this\._closePromise;/g,
    replace: () => `${marker('patch-7b-close-notify')}
      if (!this._customCloseHandler) {
        this._didCloseInternal();
      } else if (this._browser._isArkWeb) {
        this._didCloseInternal();
      }
    }
    await this._closePromise;`,
  },
];
