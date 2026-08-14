#!/usr/bin/env node

try {
    const patch = require('../dist/patch.cjs');
    patch.main();
} catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
        console.log('playwright-ohos: The script of patch not found. Run `pnpm build` first.');
    } else {
        throw e;
    }
}
