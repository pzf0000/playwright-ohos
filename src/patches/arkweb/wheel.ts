// ArkWeb scrolling patch: Input.dispatchMouseEvent with type "mouseWheel"
// is ignored, so the wheel is supplemented with a window.scrollBy evaluation.
import { marker } from '../types';
import type { PatchDefinition } from '../types';

export const arkwebWheelBundlePatches: PatchDefinition[] = [
  {
    id: 'patch-4-wheel',
    description: 'mouseWheel supplementary scrollBy scroll',
    find: /async wheel\(progress2, x, y, buttons, modifiers, deltaX, deltaY\) \{\n\s+await progress2\.race\(this\._client\.send\("Input\.dispatchMouseEvent", \{\n\s+type: "mouseWheel",\n\s+x,\n\s+y,\n\s+modifiers: toModifiersMask\(modifiers\),\n\s+deltaX,\n\s+deltaY\n\s+\}\)\);\n\s+\}/g,
    replace: () => `async wheel(progress2, x, y, buttons, modifiers, deltaX, deltaY) {
        await progress2.race(this._client.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x,
          y,
          modifiers: toModifiersMask(modifiers),
          deltaX,
          deltaY
        }));
        ${marker('patch-4-wheel')}
        if (this._page._browserContext._browser._isArkWeb) {
          await this._page._mainFrameSession._client.send("Runtime.evaluate", {
            expression: \`window.scrollBy({ left: \${deltaX}, top: \${deltaY}, behavior: "instant" })\`,
            returnByValue: true
          }).catch(() => {});
        }
      }`,
  },
];

export const arkwebWheelFilesPatches: PatchDefinition[] = [
  {
    id: 'patch-4-wheel',
    description: 'mouseWheel supplementary scrollBy scroll',
    file: 'lib/server/chromium/crInput.js',
    versions: '>=1.51.0 <1.54.0',
    find: /async wheel\(x, y, buttons, modifiers, deltaX, deltaY\) \{\n\s+await this\._client\.send\(["']Input\.dispatchMouseEvent["'], \{\n\s+type: ["']mouseWheel["'],\n\s+x,\n\s+y,\n\s+modifiers: (.+),\n\s+deltaX,\n\s+deltaY\n\s+\}\);\n\s+\}/g,
    replace: (match, modifiersExpr) => `async wheel(x, y, buttons, modifiers, deltaX, deltaY) {
    await this._client.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x,
      y,
      modifiers: ${modifiersExpr},
      deltaX,
      deltaY
    });
    ${marker('patch-4-wheel')}
    if (this._page._browserContext._browser._isArkWeb) {
      await this._page._mainFrameSession._client.send("Runtime.evaluate", {
        expression: \`window.scrollBy({ left: \${deltaX}, top: \${deltaY}, behavior: "instant" })\`,
        returnByValue: true
      }).catch(() => {});
    }
  }`,
  },
  {
    id: 'patch-4-wheel',
    description: 'mouseWheel supplementary scrollBy scroll',
    file: 'lib/server/chromium/crInput.js',
    versions: '>=1.54.0 <1.60.0',
    find: /async wheel\(progress, x, y, buttons, modifiers, deltaX, deltaY\) \{\n\s+await progress\.race\(this\._client\.send\("Input\.dispatchMouseEvent", \{\n\s+type: "mouseWheel",\n\s+x,\n\s+y,\n\s+modifiers: (.+),\n\s+deltaX,\n\s+deltaY\n\s+\}\)\);\n\s+\}/g,
    replace: (match, modifiersExpr) => `async wheel(progress, x, y, buttons, modifiers, deltaX, deltaY) {
    await progress.race(this._client.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x,
      y,
      modifiers: ${modifiersExpr},
      deltaX,
      deltaY
    }));
    ${marker('patch-4-wheel')}
    if (this._page._browserContext._browser._isArkWeb) {
      await this._page._mainFrameSession._client.send("Runtime.evaluate", {
        expression: \`window.scrollBy({ left: \${deltaX}, top: \${deltaY}, behavior: "instant" })\`,
        returnByValue: true
      }).catch(() => {});
    }
  }`,
  },
];
