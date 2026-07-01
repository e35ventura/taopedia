import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAncientPages } from './ancient-pages.js';
import slugMap from '../public/data/slugmap.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distFile = path.join(projectRoot, 'dist', 'wiki', 'special', 'ancientpages.json');
const distHtml = path.join(projectRoot, 'dist', 'wiki', 'special', 'ancientpages', 'index.html');
const historyDir = path.join(projectRoot, 'public', 'history');

assert.ok(fs.existsSync(distFile), 'dist/wiki/special/ancientpages.json not found; run the build first');
assert.ok(fs.existsSync(distHtml), 'dist/wiki/special/ancientpages/index.html not found; run the build first');
assert.ok(fs.existsSync(historyDir), 'public/history not found; run the build first');

const titleBySlug = Object.fromEntries(
  Object.entries(slugMap).map(([slug, entry]) => [slug, entry?.title ?? slug]),
);
const revisionStatsBySlug = Object.fromEntries(
  Object.keys(titleBySlug).map((slug) => {
    const historyFile = path.join(historyDir, `${slug}.json`);
    const history = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile, 'utf8')).history ?? [] : [];
    return [
      slug,
      {
        revisionCount: history.length,
        firstEdited: history.at(-1)?.date ?? null,
        lastEdited: history[0]?.date ?? null,
      },
    ];
  }),
);
const expected = buildAncientPages({ titleBySlug, revisionStatsBySlug });

const data = JSON.parse(fs.readFileSync(distFile, 'utf8'));
const html = fs.readFileSync(distHtml, 'utf8');

assert.ok(typeof data.site === 'string' && /^https?:\/\//.test(data.site), `site must be a URL string (got ${JSON.stringify(data.site)})`);
assert.equal(data.ancientpagesJsonUrl, `${data.site}/wiki/special/ancientpages.json`, 'ancientpagesJsonUrl must be the canonical self-link');
assert.ok(Array.isArray(data.pages), 'pages must be an array');
assert.equal(data.count, data.pages.length, 'count must equal pages.length');
assert.equal(data.pages.length, expected.length, `ancientpages.json must list all ${expected.length} ranked pages (got ${data.pages.length})`);

data.pages.forEach((row, index) => {
  const entry = expected[index];
  assert.equal(row.slug, entry.slug, `row ${index} slug must match the ancient-pages ranking`);
  assert.equal(row.title, entry.title, `row ${index} title must match the published slug map`);
  assert.equal(row.revisionCount, entry.revisionCount, `row ${index} revisionCount must match history`);
  assert.equal(row.firstEdited, entry.firstEdited, `row ${index} firstEdited must match history`);
  assert.equal(row.lastEdited, entry.lastEdited, `row ${index} lastEdited must match history`);
  assert.equal(row.url, `${data.site}/wiki/${entry.slug}/`, `row ${index} url must be the canonical article URL`);
  assert.equal(row.historyUrl, `${data.site}/wiki/${entry.slug}/history/`, `row ${index} historyUrl must be canonical`);
});

assert.match(
  html,
  /<h1[^>]*class="firstHeading"[^>]*>Ancient pages<\/h1>/,
  'ancientpages HTML page must render the Ancient pages heading',
);

if (expected.length === 0) {
  assert.match(html, /No ancient pages available yet\./, 'ancientpages HTML page must render the empty-state copy when the report is empty');
} else {
  for (const entry of expected.slice(0, 10)) {
    assert.ok(html.includes(`/wiki/${entry.slug}/`), `ancientpages HTML page must link to /wiki/${entry.slug}/`);
    assert.ok(html.includes(`/wiki/${entry.slug}/history/`), `ancientpages HTML page must link to /wiki/${entry.slug}/history/`);
  }
}

console.log(`Ancient pages check passed (${data.pages.length} ranked pages from the built endpoint match article history)`);
