import { execFileSync } from 'node:child_process';

const target = process.argv[2];
const promptOnly = process.argv.includes('--prompt-only');

const configs = {
  'whats-new': {
    label: "What's New",
    createPrompt: (commits) => `Based on these git commits, generate a 'What's New' HTML list for a Disco Launcher nightly build. ONLY include changes that directly affect end users (new features, UI improvements, bug fixes users would notice). EXCLUDE technical changes like code refactoring, build system updates, dependency updates, or developer-only improvements. Format as HTML <li> elements with <strong> tags for feature names. If no user-facing changes are found, return an empty string. IMPORTANT: Return ONLY the HTML content without markdown code blocks. Here are the commits:\n\n${commits}`,
  },
  'release-description': {
    label: 'release description',
    createPrompt: (commits) => `Based on these git commits, generate a concise GitHub release description in markdown for a Disco Launcher nightly build. Only include user-facing Added, Improved, and Fixed categories that have actual changes. Format each item as '- **feature name**: Description'. Do not include a Full Changelog link or markdown code fences. Here are the commits:\n\n${commits}`,
  },
};

if (!configs[target]) {
  console.error('Usage: node scripts/preview-gemini-nightly.mjs <whats-new|release-description> [--prompt-only]');
  process.exit(1);
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const lastNightly = git('tag', '-l', '*-nightly', '--sort=-creatordate').split('\n')[0];
const commits = lastNightly
  ? git('log', `${lastNightly}..HEAD`, '--oneline', '--no-merges')
  : git('log', '--oneline', '--no-merges', '-20');
const prompt = configs[target].createPrompt(commits);

if (promptOnly) {
  console.log(prompt);
  process.exit(0);
}

if (!process.env.GEMINI_API_KEY) {
  console.error('\nSet GEMINI_API_KEY, or pass --prompt-only to inspect the prompt without calling Gemini.');
  process.exit(1);
}

const maxRetries = 3;
let response;
let body;
let requestError;

for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
  response = undefined;
  body = undefined;
  try {
    response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    body = await response.json();
    requestError = undefined;
  } catch (error) {
    requestError = error;
  }

  if (response?.ok) break;

  const retryable = requestError || response?.status === 429 || response?.status >= 500;
  if (!retryable || attempt === maxRetries) break;

  const delaySeconds = 2 ** (attempt + 1);
  const reason = requestError ? 'network error' : `HTTP ${response.status}`;
  console.error(`Gemini returned ${reason}; retrying in ${delaySeconds}s (${attempt + 1}/${maxRetries})...`);
  await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
}

if (!response?.ok) {
  const details = requestError?.message || JSON.stringify(body);
  console.error(`\nGemini request failed${response ? ` (${response.status})` : ''}: ${details}`);
  process.exit(1);
}

const output = body.candidates?.[0]?.content?.parts?.[0]?.text;
if (!output) {
  console.error('\nGemini returned no text:', JSON.stringify(body));
  process.exit(1);
}

console.log('\n=== Gemini output ===\n');
console.log(output);
