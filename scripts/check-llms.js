import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { buildLlmsTxt } from './llms.js';

// Load-bearing regression check for /llms.txt (https://llmstxt.org). Part 1 unit-
// tests the pure builder; part 2 pins the built file to the article sources --
// every published article must appear exactly once as a Markdown link, so the
// LLM index cannot silently drift from the wiki.

// --- Part 1: the pure builder format ---
const sample = buildLlmsTxt({
  siteUrl: 'https://taopedia.org/',
  articles: [
    { slug: 'staking', title: 'Staking', summary: 'How staking\n  locks TAO.' },
    { slug: 'tao', title: 'TAO', summary: '' },
  ],
});
assert.ok(sample.startsWith('# Taopedia\n'), 'llms.txt must start with the H1 site title');
assert.ok(/\n> .+\n/.test(sample), 'llms.txt must include a one-line summary blockquote');
assert.ok(sample.includes('\n## Articles\n'), 'llms.txt must have an Articles section');
assert.ok(
  sample.includes('- [Staking](https://taopedia.org/wiki/staking/): How staking locks TAO.'),
  'each article must be a Markdown link with its single-line (whitespace-collapsed) summary',
);
assert.ok(
  sample.includes('- [TAO](https://taopedia.org/wiki/tao/)\n'),
  'a summary-less article must render as the bare Markdown link',
);
assert.ok(sample.endsWith('\n'), 'llms.txt must end with a trailing newline');
assert.ok(!sample.includes('//wiki/'), 'a trailing slash on siteUrl must not double up before /wiki/');

// --- Part 2: the built file matches the article sources ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const builtFile = path.join(projectRoot, 'dist', 'llms.txt');
const contentDir = path.join(projectRoot, 'src', 'content', 'pages');
assert.ok(fs.existsSync(builtFile), 'dist/llms.txt not found; run the build first');
assert.ok(fs.existsSync(contentDir), 'src/content/pages not found; run the article sync first');

const text = fs.readFileSync(builtFile, 'utf8');
assert.ok(text.startsWith('# Taopedia\n'), 'built llms.txt must start with the H1 site title');
assert.ok(/\n> .+\n/.test(text), 'built llms.txt must include the summary blockquote');
assert.ok(text.includes('\n## Articles\n'), 'built llms.txt must contain the Articles section');

const expectedSlugs = [];
for (const dirent of fs.readdirSync(contentDir, { withFileTypes: true })) {
  if (!dirent.isDirectory()) continue;
  const slug = dirent.name;
  const source = ['index.mdx', 'index.md']
    .map((name) => path.join(contentDir, slug, name))
    .find((file) => fs.existsSync(file));
  if (!source) continue;
  const { data } = matter(fs.readFileSync(source, 'utf8'));
  if (!data || typeof data.title !== 'string' || data.draft === true) continue;
  expectedSlugs.push(slug);
}
assert.ok(expectedSlugs.length > 0, 'expected at least one published article');

const linkCount = (text.match(/^- \[[^\]]+\]\(https?:\/\/[^)]+\/wiki\/[^)]+\/\)/gm) || []).length;
assert.equal(
  linkCount,
  expectedSlugs.length,
  `llms.txt must list all ${expectedSlugs.length} published articles (got ${linkCount})`,
);
for (const slug of expectedSlugs) {
  assert.ok(text.includes(`/wiki/${slug}/)`), `llms.txt must link to /wiki/${slug}/`);
}

console.log(`llms.txt check passed (${linkCount} articles indexed)`);
