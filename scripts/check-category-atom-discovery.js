import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Each category hub page (/wiki/category/<topic>/) must advertise its own Atom
// feed from the page <head> with rel="alternate" type="application/atom+xml",
// so a feed reader landing on the category page can auto-discover the scoped
// per-category Atom feed — not just the site-wide /atom.xml every page carries,
// and not just the per-category RSS/JSON already guarded by
// check-category-feed-discovery.js.
//
// This is the Atom parallel of check-category-feed-discovery.js: same
// built-output assertion shape, different MIME type and href suffix. It walks
// every built category page's <head> and verifies the Atom <link> renders, so a
// regression that drops it (e.g. a [category].astro refactor that stops
// forwarding the new feeds entry) fails fast.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const categoryDir = path.join(projectRoot, 'dist', 'wiki', 'category');

assert.ok(fs.existsSync(categoryDir), 'dist/wiki/category not found; run the build first');

const categories = fs
  .readdirSync(categoryDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

assert.ok(categories.length > 0, 'no built category pages found');

let checked = 0;
for (const category of categories) {
  const htmlPath = path.join(categoryDir, category, 'index.html');
  assert.ok(fs.existsSync(htmlPath), `missing built category page: ${category}/index.html`);

  const html = fs.readFileSync(htmlPath, 'utf8');
  // Restrict to the rendered <head> block: feed autodiscovery <link> tags only
  // count when they live in <head>, so a body-level link (e.g. inside article
  // HTML) can never satisfy this check by accident. Same boundary as
  // check-category-feed-discovery.js.
  const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  assert.ok(headMatch, `${category}: category page must render a <head> block`);
  const linkTags = [...headMatch[1].matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);

  const atomHref = `/wiki/category/${category}/atom.xml`;
  const hasAtomLink = linkTags.some(
    (tag) =>
      tag.includes('rel="alternate"') &&
      tag.includes('type="application/atom+xml"') &&
      tag.includes(`href="${atomHref}"`),
  );
  assert.ok(
    hasAtomLink,
    `${category}: category page <head> must advertise its Atom feed via rel="alternate" type="application/atom+xml" href="${atomHref}"`,
  );
  checked += 1;
}

console.log(`Category Atom feed discovery check passed (${checked} categories)`);
