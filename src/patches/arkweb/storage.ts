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
    // Do not close the reused page when page creation fails on ArkWeb.
    id: 'patch-9c-newpage-guard',
    description: 'skip page close on newPage failure for ArkWeb',
    file: 'lib/server/browserContext.js',
    versions: '>=1.57.0 <1.60.0',
    find: /await page\?\.close\(\{ reason: "Failed to create page" \}\)\.catch\(\(\) => \{\n\s+\}\);/g,
    replace: () => `${marker('patch-9c-newpage-guard')}
        if (!this._browser._isArkWeb) {
          await page?.close({ reason: "Failed to create page" }).catch(() => {
          });
        }`,
  },
];
