// ArkWeb storage state patches: setStorageState creates a page and closes
// it in the finally block. On ArkWeb this page doubles as the reused page,
// so it must stay alive; the interceptor is removed instead.
import { marker } from '../types';
import type { PatchDefinition } from '../types';

export const arkwebStorageBundlePatches: PatchDefinition[] = [
  {
    id: 'patch-9b-storage-page',
    description: 'keep the storage state page alive on ArkWeb',
    find: /\} finally \{\n\s+if \(mode !== "resetForReuse"\)\n\s+await page\?\.close\(progress2\);\n\s+else if \(interceptor\)\n\s+await page\?\.removeRequestInterceptor\(interceptor\);\n\s+\}/g,
    replace: () => `} finally {
          ${marker('patch-9b-storage-page')}
          if (this._browser._isArkWeb) {
            if (interceptor) {
              await page?.removeRequestInterceptor(interceptor);
            }
          } else if (mode !== "resetForReuse") {
            await page?.close(progress2);
          } else if (interceptor) {
            await page?.removeRequestInterceptor(interceptor);
          }
        }`,
  },
  {
    // Do not close the reused page when page creation fails on ArkWeb.
    id: 'patch-9c-newpage-guard',
    description: 'skip page close on newPage failure for ArkWeb',
    find: /\} catch \(error\) \{\n\s+await page\?\.close\(progress2, \{ reason: "Failed to create page" \}\)\.catch\(\(\) => \{\n\s+\}\);\n\s+throw error;/g,
    replace: () => `} catch (error) {
          ${marker('patch-9c-newpage-guard')}
          if (!this._browser._isArkWeb) {
            await page?.close(progress2, { reason: "Failed to create page" }).catch(() => {
            });
          }
          throw error;`,
  },
];

export const arkwebStorageFilesPatches: PatchDefinition[] = [
  {
    // 1.51-1.52 install the fulfill-all interceptor through the private
    // _setServerRequestInterceptor API, which is cleared by passing
    // undefined, so no interceptor handle is needed.
    id: 'patch-9b-storage-page',
    description: 'keep the storage state page alive on ArkWeb',
    file: 'lib/server/browserContext.js',
    versions: '>=1.51.0 <1.53.0',
    find: /(\s+await page\._setServerRequestInterceptor\(\(?handler\)? => \{[\s\S]*?\n\s+\}\);)([\s\S]*?)\n(\s+)(await page\.close\(internalMetadata\);)/g,
    replace: (match, install, loop, indent, close) => `${install}${loop}
${indent}${marker('patch-9b-storage-page')}
${indent}if (this._browser._isArkWeb) {
${indent}  await page._setServerRequestInterceptor(undefined);
${indent}} else {
${indent}  ${close}
${indent}}`,
  },
  {
    // 1.53 installs the interceptor anonymously through the public API,
    // which needs a handle to remove, so it is captured in a local const.
    id: 'patch-9b-storage-page',
    description: 'keep the storage state page alive on ArkWeb',
    file: 'lib/server/browserContext.js',
    versions: '>=1.53.0 <1.54.0',
    find: /(\s+)(await page\.addRequestInterceptor\()(\(route\) => \{[\s\S]*?\n\s+\})(, "prepend"\);)([\s\S]*?)\n(\s+)(await page\.close\(internalMetadata\);)/g,
    replace: (match, indent, callPrefix, routeFn, suffix, loop, closeIndent, close) => `${indent}const ohosStorageInterceptor = ${routeFn};
${indent}${callPrefix}ohosStorageInterceptor${suffix}${loop}
${closeIndent}${marker('patch-9b-storage-page')}
${closeIndent}if (this._browser._isArkWeb) {
${closeIndent}  await page.removeRequestInterceptor(ohosStorageInterceptor);
${closeIndent}} else {
${closeIndent}  ${close}
${closeIndent}}`,
  },
  {
    id: 'patch-9b-storage-page',
    description: 'keep the storage state page alive on ArkWeb',
    file: 'lib/server/browserContext.js',
    versions: '>=1.54.0 <1.55.0',
    find: /(\s+)(await page\.addRequestInterceptor\(progress, )(\(route\) => \{[\s\S]*?\n\s+\})(, "prepend"\);)([\s\S]*?)\n(\s+)(await page\.close\(\);)/g,
    replace: (match, indent, callPrefix, routeFn, suffix, loop, closeIndent, close) => `${indent}const ohosStorageInterceptor = ${routeFn};
${indent}${callPrefix}ohosStorageInterceptor${suffix}${loop}
${closeIndent}${marker('patch-9b-storage-page')}
${closeIndent}if (this._browser._isArkWeb) {
${closeIndent}  await page.removeRequestInterceptor(ohosStorageInterceptor);
${closeIndent}} else {
${closeIndent}  ${close}
${closeIndent}}`,
  },
  {
    // 1.55-1.59 carry the interceptor in a local variable already, so the
    // finally block is rewritten like the bundle variant.
    id: 'patch-9b-storage-page',
    description: 'keep the storage state page alive on ArkWeb',
    file: 'lib/server/browserContext.js',
    versions: '>=1.55.0 <1.60.0',
    find: /\} finally \{\n\s+if \(mode !== "resetForReuse"\)\n\s+await page\?\.close\(\);\n\s+else if \(interceptor\)\n\s+await page\?\.removeRequestInterceptor\(interceptor\);\n\s+\}/g,
    replace: () => `} finally {
          ${marker('patch-9b-storage-page')}
          if (this._browser._isArkWeb) {
            if (interceptor) {
              await page?.removeRequestInterceptor(interceptor);
            }
          } else if (mode !== "resetForReuse") {
            await page?.close();
          } else if (interceptor) {
            await page?.removeRequestInterceptor(interceptor);
          }
        }`,
  },
  {
    // Do not close the reused page when page creation fails on ArkWeb.
    id: 'patch-9c-newpage-guard',
    description: 'skip page close on newPage failure for ArkWeb',
    file: 'lib/server/browserContext.js',
    versions: '>=1.55.0 <1.60.0',
    find: /await page\?\.close\(\{ reason: "Failed to create page" \}\)\.catch\(\(\) => \{\n\s+\}\);/g,
    replace: () => `${marker('patch-9c-newpage-guard')}
        if (!this._browser._isArkWeb) {
          await page?.close({ reason: "Failed to create page" }).catch(() => {
          });
        }`,
  },
];
