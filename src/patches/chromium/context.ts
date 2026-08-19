// Chromium-based browser patches: the Haitai browser and Chrome for Dev
// behave like desktop Chrome, so the persistent default context that
// connectOverCDP normally creates is skipped.
import { marker } from '../types';
import type { PatchDefinition } from '../types';

export const chromiumContextBundlePatches: PatchDefinition[] = [
  {
    // Chromium-based device browsers behave like desktop Chrome and do not
    // need the persistent default context that connectOverCDP normally
    // creates. Skipping it keeps `browser.contexts()` empty after launch.
    id: 'patch-1e-no-default-context',
    description: 'skip the default context for Chromium-based browsers',
    find: /const persistent = \{\n\s+noDefaultViewport: true,\n\s+\.\.\.(\w+)\.noDefaults \? \{ acceptDownloads: "internal-browser-default" \} : \{\}\n\s+\};/g,
    replace: (match, optionsName) => `const persistent = ${optionsName}.__ohosNoDefaultContext ? void 0 : {
            ${marker('patch-1e-no-default-context')}
            noDefaultViewport: true,
            ...${optionsName}.noDefaults ? { acceptDownloads: "internal-browser-default" } : {}
          };`,
  },
  {
    // validateBrowserContextOptions does not accept undefined; only validate
    // when a persistent context is actually created.
    id: 'patch-1f-validate-guard',
    description: 'guard context validation for skipped default context',
    find: /\};\n\s+validateBrowserContextOptions\(persistent, browserOptions\);/g,
    replace: (match) => `};
          ${marker('patch-1f-validate-guard')}
          if (persistent) {
            validateBrowserContextOptions(persistent, browserOptions);
          }`,
  },
];

export const chromiumContextFilesPatches: PatchDefinition[] = [
  {
    id: 'patch-1e-no-default-context',
    description: 'skip the default context for Chromium-based browsers',
    file: 'lib/server/chromium/chromium.js',
    versions: '>=1.51.0 <1.52.0',
    find: /const persistent = \{\n\s+noDefaultViewport: true\n\s+\};/g,
    replace: () => `const persistent = options.__ohosNoDefaultContext ? void 0 : {
      ${marker('patch-1e-no-default-context')}
      noDefaultViewport: true
    };`,
  },
  {
    id: 'patch-1e-no-default-context',
    description: 'skip the default context for Chromium-based browsers',
    file: 'lib/server/chromium/chromium.js',
    versions: '>=1.52.0 <1.60.0',
    find: /const persistent = \{ noDefaultViewport: true \};/g,
    replace: () => `const persistent = options.__ohosNoDefaultContext ? void 0 : { noDefaultViewport: true }; ${marker('patch-1e-no-default-context')}`,
  },
  {
    id: 'patch-1f-validate-guard',
    description: 'guard context validation for skipped default context',
    file: 'lib/server/chromium/chromium.js',
    find: /\(0, (\w+)\.validateBrowserContextOptions\)\(persistent, browserOptions\);/g,
    replace: (match, importName) => `${marker('patch-1f-validate-guard')}
    if (persistent) {
      (0, ${importName}.validateBrowserContextOptions)(persistent, browserOptions);
    }`,
  },
];
