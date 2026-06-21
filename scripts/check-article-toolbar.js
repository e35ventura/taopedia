import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression check for per-article peer navigation. The article page, History,
// What links here, Cite this page, and Page information should all expose the
// same peer destinations so readers can move between article tools directly.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');

assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');

const articleSlugs = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (entry.name !== 'index.html') continue;
    const segs = path.relative(wikiDir, full).split(path.sep);
    if (segs.length < 2) continue;
    if (segs[0] === 'special' || segs[0] === 'category') continue;
    const parent = segs[segs.length - 2];
    if (parent === 'history' || parent === 'backlinks' || parent === 'cite' || parent === 'info') continue;
    articleSlugs.push(segs.slice(0, -1).join('/'));
  }
};
walk(wikiDir);

assert.ok(articleSlugs.length > 0, 'no built article pages found to verify');

const peerPages = [
  { key: 'article', label: 'Article', suffix: '', activePath: '' },
  { key: 'history', label: 'History', suffix: 'history', activePath: 'history' },
  { key: 'backlinks', label: 'What links here', suffix: 'backlinks', activePath: 'backlinks' },
  { key: 'cite', label: 'Cite this page', suffix: 'cite', activePath: 'cite' },
  { key: 'info', label: 'Page information', suffix: 'info', activePath: 'info' },
];

const pageFile = (slug, suffix) => path.join(wikiDir, slug, ...(suffix ? [suffix] : []), 'index.html');
const hrefFor = (slug, suffix) => `/wiki/${slug}/${suffix ? `${suffix}/` : ''}`;
const toolbarBlock = (html, route) => {
  const match = html.match(/<nav[^>]*class="[^"]*\bmw-article-toolbar\b[^"]*"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(match, `${route} must render an article toolbar`);
  return match[1];
};
const attr = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match?.[1] ?? '';
};

for (const slug of articleSlugs) {
  for (const current of peerPages) {
    const route = hrefFor(slug, current.suffix);
    const file = pageFile(slug, current.suffix);
    assert.ok(fs.existsSync(file), `${route} must be built`);
    const toolbar = toolbarBlock(fs.readFileSync(file, 'utf8'), route);

    for (const peer of peerPages) {
      assert.ok(
        toolbar.includes(`href="${hrefFor(slug, peer.suffix)}"`),
        `${route} toolbar must link to ${peer.label}`,
      );
    }

    const activeMatches = [...toolbar.matchAll(/<a\b[^>]*>/g)]
      .filter((match) => attr(match[0], 'class').split(/\s+/).includes('active') && attr(match[0], 'aria-current') === 'page')
      .map((match) => attr(match[0], 'href'));
    assert.deepEqual(activeMatches, [hrefFor(slug, current.activePath)], `${route} must mark only its own toolbar item active`);
  }
}

console.log(`Article toolbar peer navigation check passed (${articleSlugs.length} articles, ${peerPages.length} peer pages each)`);
