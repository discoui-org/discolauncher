import { build } from 'vite';
import * as sass from 'sass';
import { access, copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceRoot = join(projectRoot, 'src/apps');
const outputRoot = join(projectRoot, 'www/apps');
const production = process.argv.includes('--production');
const mode = production ? 'production' : 'development';

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const entries = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();

console.log(`Building ${entries.length} internal apps with Vite in ${mode} mode`);

// Vite-generated shared files use hashes. Remove old versions without touching
// the app HTML/CSS or any hand-maintained assets under www/apps. Do not prefix
// generated asset directories with "_": Android's default AAPT ignore pattern
// excludes underscore-prefixed directories from the APK.
await Promise.all([
  rm(join(outputRoot, '_chunks'), { recursive: true, force: true }),
  rm(join(outputRoot, '_assets'), { recursive: true, force: true }),
  rm(join(outputRoot, 'chunks'), { recursive: true, force: true }),
  rm(join(outputRoot, 'assets'), { recursive: true, force: true })
]);

await Promise.all(entries.map(async appName => {
  const sourceDir = join(sourceRoot, appName);
  const outputDir = join(outputRoot, appName);
  await mkdir(outputDir, { recursive: true });

  const htmlSource = join(sourceDir, 'index.html');
  if (await exists(htmlSource)) {
    await copyFile(htmlSource, join(outputDir, 'index.html'));
  }

  const scssSource = join(sourceDir, 'style.scss');
  if (await exists(scssSource)) {
    const result = await sass.compileAsync(scssSource, {
      loadPaths: [projectRoot, sourceRoot],
      style: production ? 'compressed' : 'expanded',
      sourceMap: false,
      silenceDeprecations: ['import', 'global-builtin', 'slash-div']
    });
    await writeFile(join(outputDir, 'style.css'), result.css);
  }
}));

const scriptEntries = {};
for (const appName of entries) {
  const scriptPath = join(sourceRoot, appName, 'script.js');
  if (await exists(scriptPath)) scriptEntries[appName] = scriptPath;
}

if (Object.keys(scriptEntries).length) {
  await build({
    configFile: false,
    root: projectRoot,
    mode,
    build: {
      target: 'esnext',
      outDir: outputRoot,
      emptyOutDir: false,
      sourcemap: !production,
      minify: production ? 'oxc' : false,
      modulePreload: false,
      rollupOptions: {
        input: scriptEntries,
        output: {
          entryFileNames: chunk => `${basename(chunk.name)}/script.js`,
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]'
        }
      }
    }
  });
}

console.log('Internal apps built successfully.');
