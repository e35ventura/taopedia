import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Guards public/data/slugmap.json — the artifact every JSON companion, feed, and
// special listing reads instead of getCollection('pages'). Catches incomplete sync
// output (missing titles, category members pointing at unpublished slugs) before
// postbuild JSON checks run.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const slugMap = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'public/data/slugmap.json'), 'utf8'),
);
const categoriesIndex = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'public/data/categories.json'), 'utf8'),
);

const publishedSlugs = [];
const draftSlugs = [];

for (const [slug, entry] of Object.entries(slugMap)) {
  if (entry?.title) {
    publishedSlugs.push(slug);
    assert.equal(typeof entry.title, 'string', `${slug}: title must be a string`);
    if (entry.summary !== undefined) {
      assert.equal(typeof entry.summary, 'string', `${slug}: summary must be a string when present`);
    }
    if (entry.categories !== undefined) {
      assert.ok(Array.isArray(entry.categories), `${slug}: categories must be an array when present`);
    }
  } else {
    draftSlugs.push(slug);
  }
}

const memberSlugs = new Set();
for (const slugs of Object.values(categoriesIndex)) {
  for (const slug of Array.isArray(slugs) ? slugs : []) memberSlugs.add(slug);
}

for (const slug of memberSlugs) {
  assert.ok(
    slugMap[slug]?.title,
    `categories.json member ${slug} must have a published slugmap entry (title required)`,
  );
}

console.log(
  `Slugmap artifact check passed (${publishedSlugs.length} published; ${draftSlugs.length} without title; ${memberSlugs.size} distinct category members verified)`,
);
