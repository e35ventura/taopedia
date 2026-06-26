import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Guards public/data/linkgraph.json — outbound reference edges must only target
// slugs that exist in slugmap.json with a title. getArticleReferences and every
// references.json / cite.json companion rely on this published-only join.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const slugMap = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'public/data/slugmap.json'), 'utf8'),
);
const linkgraph = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'public/data/linkgraph.json'), 'utf8'),
);

const published = new Set(Object.keys(slugMap).filter((slug) => slugMap[slug]?.title));

let edgeCount = 0;
for (const [from, targets] of Object.entries(linkgraph)) {
  assert.ok(published.has(from), `linkgraph source ${from} must be a published slugmap entry`);
  for (const target of Array.isArray(targets) ? targets : []) {
    edgeCount += 1;
    const slug = typeof target === 'string' ? target : target?.target;
    assert.ok(slug, 'linkgraph target must carry a slug');
    assert.ok(published.has(slug), `linkgraph edge ${from} -> ${slug} must target a published slugmap entry`);
  }
}

console.log(
  `Linkgraph slugmap check passed (${Object.keys(linkgraph).length} sources; ${edgeCount} outbound edges verified)`,
);
