#!/usr/bin/env node

try {
    require('../dist/patch.cjs');
} catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
        console.log('playwright-ohos: The script of patch not found.');
    } else {
        throw e;
    }
}