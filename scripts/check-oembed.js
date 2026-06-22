import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildArticleOembed,
  oembedPath,
  OEMBED_THUMBNAIL_WIDTH,
  OEMBED_THUMBNAIL_HEIGHT,
  OEMBED_CACHE_AGE,
} from '../src/lib/oembed.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const ORIGIN = 'https://taopedia.org';

// ---- 1) Unit: the pure builder is the single source of the document shape ----
{
  assert.equal(oembedPath('tao'), '/wiki/tao/oembed.json', 'oembedPath must be the root-relative per-article path');
  assert.deepEqual(
    buildArticleOembed({ slug: 'tao', title: 'TAO', origin: ORIGIN }),
    {
      version: '1.0',
      type: 'link',
      title: 'TAO',
      url: 'https://taopedia.org/wiki/tao/',
      author_name: 'Taopedia',
      author_url: 'https://taopedia.org/',
      provider_name: 'Taopedia',
      provider_url: 'https://taopedia.org/',
      thumbnail_url: 'https://taopedia.org/og/tao.png',
      thumbnail_width: OEMBED_THUMBNAIL_WIDTH,
      thumbnail_height: OEMBED_THUMBNAIL_HEIGHT,
      cache_age: OEMBED_CACHE_AGE,
    },
    'oEmbed link document must carry version/type, the canonical url, provider/author, and the /og/<slug>.png thumbnail',
  );
}

// ---- 2) Built output: a valid oEmbed document for every article, consistent
//         with the page it describes, plus a working discovery link ----------
assert.ok(fs.existsSync(distDir), 'dist not found; run the build first');
const wikiDir = path.join(distDir, 'wiki');
// Authoritative raw titles (same source page.data.title the route reads), so
// the title check is robust against HTML entity escaping in the page <title>.
const slugMap = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public', 'data', 'slugmap.json'), 'utf8'));
const slugs = fs
  .readdirSync(wikiDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !['special', 'category'].includes(e.name))
  .map((e) => e.name)
  .filter((slug) => fs.existsSync(path.join(wikiDir, slug, 'index.html')));
assert.ok(slugs.length >= 50, `expected the built article set, found ${slugs.length}`);

const ABS = /^https:\/\/[^/]+\//;
let checked = 0;
for (const slug of slugs) {
  const where = `oembed for ${slug}`;
  const jsonFile = path.join(wikiDir, slug, 'oembed.json');
  assert.ok(fs.existsSync(jsonFile), `${where}: dist/wiki/${slug}/oembed.json must be served`);

  const doc = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  assert.equal(doc.version, '1.0', `${where}: version must be "1.0"`);
  assert.equal(doc.type, 'link', `${where}: type must be "link"`);
  assert.equal(doc.provider_name, 'Taopedia', `${where}: provider_name`);
  assert.equal(doc.author_name, 'Taopedia', `${where}: author_name`);
  assert.equal(doc.cache_age, OEMBED_CACHE_AGE, `${where}: cache_age`);
  assert.equal(doc.thumbnail_width, OEMBED_THUMBNAIL_WIDTH, `${where}: thumbnail_width`);
  assert.equal(doc.thumbnail_height, OEMBED_THUMBNAIL_HEIGHT, `${where}: thumbnail_height`);
  for (const field of ['url', 'author_url', 'provider_url', 'thumbnail_url']) {
    assert.match(doc[field], ABS, `${where}: ${field} must be an absolute https URL`);
  }
  assert.equal(doc.provider_url, doc.author_url, `${where}: provider_url and author_url both point at the site root`);

  // The thumbnail must point at a share image that was actually built.
  assert.ok(doc.thumbnail_url.endsWith(`/og/${slug}.png`), `${where}: thumbnail_url must be the article OG image`);
  assert.ok(fs.existsSync(path.join(distDir, 'og', `${slug}.png`)), `${where}: the /og/${slug}.png thumbnail must exist`);

  // Parity with the page the document describes: same canonical URL and title.
  const html = fs.readFileSync(path.join(wikiDir, slug, 'index.html'), 'utf8');
  const canonical = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1];
  assert.ok(canonical, `${where}: source article must have a canonical link`);
  assert.equal(doc.url, canonical, `${where}: oEmbed url must equal the article canonical URL`);

  const expectedTitle = slugMap[slug]?.title;
  assert.ok(expectedTitle, `${where}: slug must be present in the slug map`);
  assert.equal(doc.title, expectedTitle, `${where}: oEmbed title must match the article title`);

  // The page must advertise the document via oEmbed discovery so embedders find
  // it: a rel="alternate" link of type application/json+oembed at the served path.
  const discovery = html.match(/<link[^>]*type="application\/json\+oembed"[^>]*>/);
  assert.ok(discovery, `${where}: article must include an application/json+oembed discovery <link>`);
  assert.ok(discovery[0].includes('rel="alternate"'), `${where}: oEmbed discovery <link> must be rel="alternate"`);
  assert.ok(
    discovery[0].includes(`href="${oembedPath(slug)}"`),
    `${where}: discovery <link> must point at ${oembedPath(slug)}`,
  );
  checked += 1;
}

console.log(`oEmbed check passed (${checked} articles; valid link-type documents, canonical+title parity, thumbnails built, discovery links wired)`);
