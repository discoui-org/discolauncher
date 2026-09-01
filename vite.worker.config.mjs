import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => ({
  build: {
    target: 'es2020',
    outDir: resolve(rootDir, 'www/dist'),
    emptyOutDir: false,
    sourcemap: mode !== 'production',
    minify: mode === 'production' ? 'oxc' : false,
    lib: {
      entry: resolve(rootDir, 'src/scripts/liveTileHelper.js'),
      name: 'DiscoLiveTileHelper',
      formats: ['iife'],
      fileName: () => 'liveTileHelper.js'
    },
    rollupOptions: {
      output: {
        exports: 'named'
      }
    }
  }
}));
