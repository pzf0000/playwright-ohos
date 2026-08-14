import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        patch: resolve(__dirname, 'src/patch.ts'),
      },
      formats: ["cjs"],
    },
    minify: 'terser',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: [
        'playwright-core',
        /playwright-core\/.*/,
        'debug',
        'patch-package',
        /node:.*/,
        'fs',
        'path',
        'os',
        'child_process',
        'http',
        'net',
        'stream',
        'crypto',
        'url',
        'events',
        'buffer',
      ],
      output: {
        entryFileNames: '[name].cjs',
        chunkFileNames: '[name].cjs',
        preserveModules: false,
      },
    },
    sourcemap: false,
  }
});