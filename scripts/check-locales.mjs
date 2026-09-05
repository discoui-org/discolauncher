import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const defaultLocalesDir = path.join(projectRoot, 'www', 'assets', 'defaultlocales');
const localesDir = path.join(projectRoot, 'www', 'assets', 'locales');

async function readJson(filePath) {
  const source = await readFile(filePath, 'utf8');
  return JSON.parse(source);
}

function collectStringPaths(value, prefix = '', result = []) {
  if (typeof value === 'string') {
    result.push(prefix);
    return result;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      collectStringPaths(child, prefix ? `${prefix}.${key}` : key, result);
    }
  }

  return result;
}

function getValueAtPath(value, keyPath) {
  let current = value;

  for (const key of keyPath.split('.')) {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, key)) {
      return { found: false };
    }
    current = current[key];
  }

  return { found: true, value: current };
}

async function getLocaleNames() {
  const requestedLocales = process.argv.slice(2);
  if (requestedLocales.length > 0) return requestedLocales;

  const entries = await readdir(localesDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const defaultFiles = (await readdir(defaultLocalesDir))
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  const expectedPathsByFile = new Map();
  for (const file of defaultFiles) {
    const defaultJson = await readJson(path.join(defaultLocalesDir, file));
    expectedPathsByFile.set(file, collectStringPaths(defaultJson));
  }

  const localeNames = await getLocaleNames();
  let issueCount = 0;

  for (const locale of localeNames) {
    const localeDir = path.join(localesDir, locale);
    const localeIssues = [];

    try {
      if (!(await stat(localeDir)).isDirectory()) {
        localeIssues.push('not a locale directory');
      }
    } catch {
      localeIssues.push('locale directory not found');
    }

    if (localeIssues.length === 0) {
      for (const file of defaultFiles) {
        const localeFile = path.join(localeDir, file);
        let localeJson;

        try {
          localeJson = await readJson(localeFile);
        } catch (error) {
          const reason = error?.code === 'ENOENT' ? 'missing file' : `invalid JSON: ${error.message}`;
          localeIssues.push(`${file}: ${reason}`);
          continue;
        }

        for (const keyPath of expectedPathsByFile.get(file)) {
          const result = getValueAtPath(localeJson, keyPath);
          if (!result.found) {
            localeIssues.push(`${file}: ${keyPath} (missing)`);
          } else if (typeof result.value !== 'string' || result.value.trim() === '') {
            localeIssues.push(`${file}: ${keyPath} (empty or not a string)`);
          }
        }
      }
    }

    if (localeIssues.length === 0) {
      console.log(`✓ ${locale}`);
      continue;
    }

    issueCount += localeIssues.length;
    console.log(`\n✗ ${locale} — ${localeIssues.length} issues`);
    for (const issue of localeIssues) console.log(`  - ${issue}`);
  }

  console.log(`\nChecked ${localeNames.length} locales.`);
  if (issueCount > 0) {
    console.error(`Found ${issueCount} missing or invalid translations.`);
    process.exitCode = 1;
  } else {
    console.log('All translation strings are complete.');
  }
}

main().catch(error => {
  console.error(`Failed to check locales: ${error.message}`);
  process.exitCode = 1;
});
