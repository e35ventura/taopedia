import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load-bearing regression check for article breadcrumbs. Every built article must
// render a "Home > [primary topic] > Article" breadcrumb whose topic is the
// article's first category (from the slug map) and links to that built category
// page, and the page's Schema.org BreadcrumbList must match the visible trail
// exactly. Fails if the breadcrumb, its topic, coverage, the category link, or
// the structured-data consistency regress.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wikiDir = path.join(projectRoot, 'dist', 'wiki');
const slugmapFile = path.join(projectRoot, 'public', 'data', 'slugmap.json');

assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');
assert.ok(fs.existsSync(slugmapFile), 'public/data/slugmap.json not found; run the build first');
const slugmap = JSON.parse(fs.readFileSync(slugmapFile, 'utf8'));

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
const categoryUrlName = (cat) => cat.replace(/ /g, '_');

// Article walk: the same recursive exclusion the sibling checks use.
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

// Pull the BreadcrumbList out of the page's JSON-LD (\u-escaped, so JSON.parse-safe).
const breadcrumbFromLd = (html) => {
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]);
      const graph = data['@graph'] ?? [data];
      const bc = graph.find((node) => node['@type'] === 'BreadcrumbList');
      if (bc) return bc;
    } catch {
      /* not the JSON-LD script we want */
    }
  }
  return null;
};

let withTopic = 0;
for (const slug of articleSlugs) {
  const html = fs.readFileSync(path.join(wikiDir, slug, 'index.html'), 'utf8');
  const title = slugmap[slug]?.title;
  assert.ok(title, `slug map is missing a title for ${slug}`);
  const primaryTopic = slugmap[slug]?.categories?.[0];

  // Visible breadcrumb.
  const navMatch = html.match(/<nav[^>]*class="mw-breadcrumb"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(navMatch, `/wiki/${slug}/ must render a breadcrumb nav`);
  const nav = navMatch[1];
  assert.ok(/<a[^>]*href="\/"[^>]*>Home<\/a>/.test(nav), `/wiki/${slug}/ breadcrumb must link Home to /`);

  const current = nav.match(/<span[^>]*aria-current="page"[^>]*>([^<]*)<\/span>/);
  assert.ok(current, `/wiki/${slug}/ breadcrumb must mark the current page with aria-current`);
  assert.equal(decode(current[1]), title, `/wiki/${slug}/ breadcrumb current item must be the article title`);

  const topicLink = nav.match(/<a[^>]*href="\/wiki\/category\/([^"]+)\/"[^>]*>([^<]*)<\/a>/);
  if (primaryTopic) {
    assert.ok(topicLink, `/wiki/${slug}/ breadcrumb must include a topic link for "${primaryTopic}"`);
    assert.equal(decode(topicLink[2]), primaryTopic, `/wiki/${slug}/ breadcrumb topic text must be the article's first category`);
    assert.equal(topicLink[1], categoryUrlName(primaryTopic), `/wiki/${slug}/ breadcrumb topic must link to the category page`);
    assert.ok(
      fs.existsSync(path.join(wikiDir, 'category', categoryUrlName(primaryTopic), 'index.html')),
      `/wiki/${slug}/ breadcrumb topic links to /wiki/category/${categoryUrlName(primaryTopic)}/ but that page was not built`,
    );
    withTopic++;
  } else {
    assert.ok(!topicLink, `/wiki/${slug}/ has no category, so the breadcrumb must have no topic link`);
  }

  // Structured-data BreadcrumbList must match the visible trail (names + order).
  const breadcrumb = breadcrumbFromLd(html);
  assert.ok(breadcrumb, `/wiki/${slug}/ must emit a BreadcrumbList in the page's structured data`);
  const names = breadcrumb.itemListElement.map((item) => item.name);
  const expected = primaryTopic ? ['Home', primaryTopic, title] : ['Home', title];
  assert.deepEqual(names, expected, `/wiki/${slug}/ BreadcrumbList must match the visible breadcrumb (Home > [topic] > article)`);
  const positions = breadcrumb.itemListElement.map((item) => item.position);
  assert.deepEqual(
    positions,
    expected.map((_, i) => i + 1),
    `/wiki/${slug}/ BreadcrumbList positions must be contiguous from 1`,
  );
}
assert.ok(withTopic > 0, 'expected at least one article with a topic-level breadcrumb to verify');

console.log(
  `Breadcrumbs check passed (${articleSlugs.length} articles; ${withTopic} with a topic level; visible trail + BreadcrumbList structured data consistent, topic links resolve to built category pages)`,
);
