import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugFromWikiHref } from '../src/lib/wiki-article-path.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const sitemapPath = path.join(projectRoot, 'dist', 'sitemap.xml');

assert.ok(fs.existsSync(sitemapPath), 'dist/sitemap.xml not found; run the build first');
const xml = fs.readFileSync(sitemapPath, 'utf8');

// The image-sitemap namespace must be declared so <image:image> validates.
assert.match(
  xml,
  /<urlset[^>]*xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/,
  'urlset must declare the image-sitemap namespace',
);

// Split into <url> blocks and classify each as an article route or not.
const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
assert.ok(urlBlocks.length > 0, 'sitemap has no <url> entries');

let articleUrls = 0;
for (const block of urlBlocks) {
  const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1] ?? '';
  const isArticle = /^\/wiki\/[^/].+\/$/.test(new URL(loc).pathname)
    && !loc.includes('/wiki/category/')
    && !loc.includes('/wiki/special/');
  const imageCount = (block.match(/<image:image>/g) ?? []).length;

  if (isArticle) {
    articleUrls += 1;
    // Exactly one image per article URL, pointing at that article's OG card.
    assert.equal(imageCount, 1, `article URL ${loc} must carry exactly one <image:image>`);
    const slug = slugFromWikiHref(new URL(loc).pathname);
    const imageLoc = block.match(/<image:loc>([^<]+)<\/image:loc>/)?.[1] ?? '';
    assert.ok(
      imageLoc.endsWith(`/og/${slug}.png`),
      `article ${slug} image:loc must be its /og/${slug}.png card (got ${imageLoc})`,
    );
    assert.ok(imageLoc.startsWith('http'), 'image:loc must be an absolute URL');
    assert.match(block, /<image:title>[^<]+<\/image:title>/, `article ${slug} image must have a title`);
  } else {
    // Homepage, special listing, and category-hub URLs are not content images.
    assert.equal(imageCount, 0, `non-article URL ${loc} must not carry an <image:image>`);
  }
}

assert.ok(articleUrls > 0, 'no article URLs found in the sitemap');

// The special content overview pages are canonical, indexable routes and must
// stay in the sitemap so discovery does not regress when a new one is added.
for (const special of ['allpages', 'categories', 'mostlinkedpages', 'recentchanges', 'statistics', 'subnets']) {
  assert.ok(
    xml.includes(`/wiki/special/${special}/</loc>`),
    `sitemap must include the /wiki/special/${special}/ page`,
  );
}

// XML-escaping must survive into image titles (an ampersand in a title, etc.).
for (const title of xml.match(/<image:title>([\s\S]*?)<\/image:title>/g) ?? []) {
  assert.ok(!/&(?!(amp|lt|gt|quot|apos);)/.test(title), `unescaped & in image title: ${title}`);
}

console.log(`Sitemap image check passed (${articleUrls} article OG images, none on non-article URLs)`);
