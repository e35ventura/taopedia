import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSubnets } from './subnets.js';

// Run after `npm run build`: the landing-page hero should link article, topic,
// and subnet counts to their special pages. Refs #521.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const homeHtml = path.join(projectRoot, 'dist', 'index.html');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');
const contentDir = path.join(projectRoot, 'src', 'content', 'pages');

assert.ok(fs.existsSync(homeHtml), 'dist/index.html not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
assert.ok(fs.existsSync(contentDir), 'src/content/pages not found; run the build first');

const html = fs.readFileSync(homeHtml, 'utf8');
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

const articleSlugs = fs
  .readdirSync(contentDir, { withFileTypes: true })
  .flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const dir = path.join(contentDir, entry.name);
    const hasIndex =
      fs.existsSync(path.join(dir, 'index.mdx')) || fs.existsSync(path.join(dir, 'index.md'));
    return hasIndex ? [entry.name] : [];
  });

const topicSet = new Set();
for (const entry of Object.values(slugmap)) {
  for (const topic of entry?.categories ?? []) {
    topicSet.add(topic);
  }
}

const pages = articleSlugs.map((slug) => ({
  data: {
    title: slugmap[slug]?.title ?? slug,
    summary: slugmap[slug]?.summary ?? '',
    categories: slugmap[slug]?.categories ?? [],
  },
  id: `${slug}/index.mdx`,
}));
const getPageSlug = (page) => page.id.replace(/\/index\.mdx$/, '');
const activeSubnetCount = buildSubnets({ pages, getPageSlug }).filter(
  (subnet) => !/deprecated/i.test(subnet.name),
).length;

const articleCount = pages.length;
const topicCount = topicSet.size;

for (const [href, label] of [
  ['/wiki/special/allpages', `${articleCount} articles`],
  ['/wiki/special/categories', `${topicCount} topics`],
  ['/wiki/special/subnets', `${activeSubnetCount} subnets`],
]) {
  assert.ok(html.includes(`href="${href}"`), `home page hero must link to ${href}`);
  assert.ok(html.includes(label), `home page hero must show ${label}`);
}

console.log(
  `Home site stats check passed (${articleCount} articles, ${topicCount} topics, ${activeSubnetCount} subnets)`,
);
