import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => ({
  build: {
    target: 'esnext',
    outDir: resolve(rootDir, 'www/dist'),
    emptyOutDir: false,
    sourcemap: mode !== 'production',
    minify: mode === 'production' ? 'oxc' : false,
    rollupOptions: {
      input: {
        script: resolve(rootDir, 'src/script.js'),
        mock: resolve(rootDir, 'src/mock.js'),
        themeEditor: resolve(rootDir, 'src/themeEditor.js'),
        welcome: resolve(rootDir, 'src/welcome.js')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
}));
