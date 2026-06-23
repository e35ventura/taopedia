import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCategoryArticlesDocument, getCategoryArticles } from '../src/lib/category-articles.js';

const ORIGIN = 'https://taopedia.org';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const categoryDir = path.join(projectRoot, 'dist', 'wiki', 'category');
const categoriesJsonPath = path.join(projectRoot, 'public', 'data', 'categories.json');
const slugmapJsonPath = path.join(projectRoot, 'public', 'data', 'slugmap.json');

// ---- 1) Unit: helper and builder behavior ---------------------------------
{
  const categoriesIndex = {
    Subnets: ['subnet_10', 'subnet_2', 'subnet_9', 'subnet_2', 'missing'],
  };
  const slugMap = {
    subnet_10: { title: 'Subnet 10', summary: '' },
    subnet_2: { title: 'Subnet 2', summary: 'two' },
    subnet_9: { title: 'Subnet 9' },
  };

  const articles = getCategoryArticles({ categoryName: 'Subnets', categoriesIndex, slugMap });
  assert.deepEqual(
    articles,
    [
      { slug: 'subnet_2', title: 'Subnet 2', summary: 'two' },
      { slug: 'subnet_9', title: 'Subnet 9', summary: '' },
      { slug: 'subnet_10', title: 'Subnet 10', summary: '' },
    ],
    'helper must dedupe category members, skip missing slugs, and sort numerically by title',
  );

  const doc = buildCategoryArticlesDocument({
    origin: ORIGIN,
    categoryName: 'Subnets',
    categoryPath: 'Subnets',
    articles,
  });
  assert.equal(doc.site, ORIGIN, 'builder: site field');
  assert.equal(doc.category, 'Subnets', 'builder: category field');
  assert.equal(doc.url, `${ORIGIN}/wiki/category/Subnets/`, 'builder: category url');
  assert.equal(doc.articlesJsonUrl, `${ORIGIN}/wiki/category/Subnets/articles.json`, 'builder: category articlesJsonUrl');
  assert.equal(doc.feedUrl, `${ORIGIN}/wiki/category/Subnets/feed.json`, 'builder: category feedUrl');
  assert.equal(doc.atomUrl, `${ORIGIN}/wiki/category/Subnets/atom.xml`, 'builder: category atomUrl');
  assert.equal(doc.rssUrl, `${ORIGIN}/wiki/category/Subnets/rss.xml`, 'builder: category rssUrl');
  assert.equal(doc.count, 3, 'builder: count field');
  assert.deepEqual(
    doc.articles,
    [
      {
        slug: 'subnet_2',
        title: 'Subnet 2',
        summary: 'two',
        url: `${ORIGIN}/wiki/subnet_2/`,
        infoUrl: `${ORIGIN}/wiki/subnet_2/info/`,
        historyUrl: `${ORIGIN}/wiki/subnet_2/history/`,
        historyJsonUrl: `${ORIGIN}/wiki/subnet_2/history.json`,
        backlinksUrl: `${ORIGIN}/wiki/subnet_2/backlinks/`,
        backlinksJsonUrl: `${ORIGIN}/wiki/subnet_2/backlinks.json`,
        citeUrl: `${ORIGIN}/wiki/subnet_2/cite/`,
        citeJsonUrl: `${ORIGIN}/wiki/subnet_2/cite.json`,
        bibtexUrl: `${ORIGIN}/wiki/subnet_2/cite.bib`,
        referencesUrl: `${ORIGIN}/wiki/subnet_2/references.json`,
        relatedUrl: `${ORIGIN}/wiki/subnet_2/related.json`,
        infoJsonUrl: `${ORIGIN}/wiki/subnet_2/info.json`,
        tocJsonUrl: `${ORIGIN}/wiki/subnet_2/toc.json`,
      },
      {
        slug: 'subnet_9',
        title: 'Subnet 9',
        summary: null,
        url: `${ORIGIN}/wiki/subnet_9/`,
        infoUrl: `${ORIGIN}/wiki/subnet_9/info/`,
        historyUrl: `${ORIGIN}/wiki/subnet_9/history/`,
        historyJsonUrl: `${ORIGIN}/wiki/subnet_9/history.json`,
        backlinksUrl: `${ORIGIN}/wiki/subnet_9/backlinks/`,
        backlinksJsonUrl: `${ORIGIN}/wiki/subnet_9/backlinks.json`,
        citeUrl: `${ORIGIN}/wiki/subnet_9/cite/`,
        citeJsonUrl: `${ORIGIN}/wiki/subnet_9/cite.json`,
        bibtexUrl: `${ORIGIN}/wiki/subnet_9/cite.bib`,
        referencesUrl: `${ORIGIN}/wiki/subnet_9/references.json`,
        relatedUrl: `${ORIGIN}/wiki/subnet_9/related.json`,
        infoJsonUrl: `${ORIGIN}/wiki/subnet_9/info.json`,
        tocJsonUrl: `${ORIGIN}/wiki/subnet_9/toc.json`,
      },
      {
        slug: 'subnet_10',
        title: 'Subnet 10',
        summary: null,
        url: `${ORIGIN}/wiki/subnet_10/`,
        infoUrl: `${ORIGIN}/wiki/subnet_10/info/`,
        historyUrl: `${ORIGIN}/wiki/subnet_10/history/`,
        historyJsonUrl: `${ORIGIN}/wiki/subnet_10/history.json`,
        backlinksUrl: `${ORIGIN}/wiki/subnet_10/backlinks/`,
        backlinksJsonUrl: `${ORIGIN}/wiki/subnet_10/backlinks.json`,
        citeUrl: `${ORIGIN}/wiki/subnet_10/cite/`,
        citeJsonUrl: `${ORIGIN}/wiki/subnet_10/cite.json`,
        bibtexUrl: `${ORIGIN}/wiki/subnet_10/cite.bib`,
        referencesUrl: `${ORIGIN}/wiki/subnet_10/references.json`,
        relatedUrl: `${ORIGIN}/wiki/subnet_10/related.json`,
        infoJsonUrl: `${ORIGIN}/wiki/subnet_10/info.json`,
        tocJsonUrl: `${ORIGIN}/wiki/subnet_10/toc.json`,
      },
    ],
    'builder: article row shape',
  );
}

// ---- 2) Built-output checks -----------------------------------------------
assert.ok(fs.existsSync(categoryDir), 'dist/wiki/category not found; run the build first');
assert.ok(fs.existsSync(categoriesJsonPath), 'public/data/categories.json not found; run the build first');
assert.ok(fs.existsSync(slugmapJsonPath), 'public/data/slugmap.json not found; run the build first');

const categoriesIndex = JSON.parse(fs.readFileSync(categoriesJsonPath, 'utf8'));
const slugMap = JSON.parse(fs.readFileSync(slugmapJsonPath, 'utf8'));

const dirToOriginal = new Map();
for (const name of Object.keys(categoriesIndex)) {
  dirToOriginal.set(name.replace(/ /g, '_'), name);
}

const categories = fs
  .readdirSync(categoryDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

assert.ok(categories.length > 0, 'no built category pages found');

let checkedCategories = 0;
let checkedArticles = 0;

for (const category of categories) {
  const originalName = dirToOriginal.get(category);
  assert.ok(originalName, `${category}: built category directory must correspond to a known category label`);

  const expectedArticles = getCategoryArticles({ categoryName: originalName, categoriesIndex, slugMap });
  assert.ok(expectedArticles.length > 0, `${category}: expected at least one category article`);

  const articlesPath = path.join(categoryDir, category, 'articles.json');
  const feedPath = path.join(categoryDir, category, 'feed.json');
  const htmlPath = path.join(categoryDir, category, 'index.html');
  assert.ok(fs.existsSync(articlesPath), `missing built category article list: ${category}/articles.json`);
  assert.ok(fs.existsSync(feedPath), `missing built category JSON feed: ${category}/feed.json`);
  assert.ok(fs.existsSync(htmlPath), `missing built category hub: ${category}/index.html`);

  const doc = JSON.parse(fs.readFileSync(articlesPath, 'utf8'));
  const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
  assert.equal(doc.site, ORIGIN, `${category}: site must be ${ORIGIN}`);
  assert.equal(doc.category, originalName, `${category}: category must match the original category name`);
  assert.equal(doc.url, `${ORIGIN}/wiki/category/${category}/`, `${category}: url must be the canonical category URL`);
  assert.equal(
    doc.articlesJsonUrl,
    `${ORIGIN}/wiki/category/${category}/articles.json`,
    `${category}: articlesJsonUrl must be the document's own canonical URL`,
  );
  // feedUrl advertises the category's JSON Feed (its syndication companion), so
  // a consumer reading the machine-readable article list can subscribe to the
  // category without reconstructing the route.
  assert.equal(
    doc.feedUrl,
    `${ORIGIN}/wiki/category/${category}/feed.json`,
    `${category}: feedUrl must be the canonical category feed.json URL`,
  );
  // atomUrl / rssUrl advertise the category's other syndication feeds, the same
  // feedUrl/atomUrl/rssUrl set categories.json exposes per category, so a
  // feed-reader can subscribe in any format from the article list.
  assert.equal(doc.atomUrl, `${ORIGIN}/wiki/category/${category}/atom.xml`, `${category}: atomUrl must be the canonical category atom.xml URL`);
  assert.equal(doc.rssUrl, `${ORIGIN}/wiki/category/${category}/rss.xml`, `${category}: rssUrl must be the canonical category rss.xml URL`);
  assert.ok(Array.isArray(doc.articles), `${category}: articles must be an array`);
  assert.ok(Array.isArray(feed.items) && feed.items.length > 0, `${category}: feed.json must contain at least one item`);
  assert.equal(doc.count, doc.articles.length, `${category}: count must equal articles.length`);
  assert.equal(doc.count, expectedArticles.length, `${category}: count must equal expected category membership length`);

  const expectedDoc = buildCategoryArticlesDocument({
    origin: ORIGIN,
    categoryName: originalName,
    categoryPath: category,
    articles: expectedArticles,
  });

  assert.deepEqual(
    doc.articles,
    expectedDoc.articles,
    `${category}: articles.json rows must match the expected title-sorted category membership`,
  );

  // Each article row links its Page-information and What-links-here pages, the
  // same per-entry companions the other special JSON endpoints expose, so a
  // consumer of a category's article list can reach each article's metadata and
  // inbound links without reconstructing the route.
  for (const article of doc.articles) {
    assert.equal(
      article.infoUrl,
      `${ORIGIN}/wiki/${article.slug}/info/`,
      `${category}: article ${article.slug} infoUrl must be the canonical Page-information URL`,
    );
    assert.equal(
      article.backlinksUrl,
      `${ORIGIN}/wiki/${article.slug}/backlinks/`,
      `${category}: article ${article.slug} backlinksUrl must be the canonical What-links-here URL`,
    );
    assert.equal(
      article.backlinksJsonUrl,
      `${ORIGIN}/wiki/${article.slug}/backlinks.json`,
      `${category}: article ${article.slug} backlinksJsonUrl must be the canonical backlinks.json URL`,
    );
    assert.equal(
      article.citeUrl,
      `${ORIGIN}/wiki/${article.slug}/cite/`,
      `${category}: article ${article.slug} citeUrl must be the canonical citation-page URL`,
    );
    assert.equal(
      article.citeJsonUrl,
      `${ORIGIN}/wiki/${article.slug}/cite.json`,
      `${category}: article ${article.slug} citeJsonUrl must be the canonical cite.json URL`,
    );
    assert.equal(
      article.bibtexUrl,
      `${ORIGIN}/wiki/${article.slug}/cite.bib`,
      `${category}: article ${article.slug} bibtexUrl must be the canonical cite.bib URL`,
    );
    assert.equal(
      article.referencesUrl,
      `${ORIGIN}/wiki/${article.slug}/references.json`,
      `${category}: article ${article.slug} referencesUrl must be the canonical references.json URL`,
    );
    assert.equal(
      article.relatedUrl,
      `${ORIGIN}/wiki/${article.slug}/related.json`,
      `${category}: article ${article.slug} relatedUrl must be the canonical related.json URL`,
    );
    // infoJsonUrl pairs the HTML info page with its machine-readable form, and
    // tocJsonUrl links the article's table-of-contents endpoint — the same
    // companions every other per-article surface now exposes.
    assert.equal(
      article.infoJsonUrl,
      `${ORIGIN}/wiki/${article.slug}/info.json`,
      `${category}: article ${article.slug} infoJsonUrl must be the canonical info.json URL`,
    );
    assert.equal(
      article.tocJsonUrl,
      `${ORIGIN}/wiki/${article.slug}/toc.json`,
      `${category}: article ${article.slug} tocJsonUrl must be the canonical toc.json URL`,
    );
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const orderedHtmlSlugs = [...html.matchAll(/<a href="\/wiki\/([^/]+)\/" class="card-link"[^>]*>/g)].map(
    (match) => match[1],
  );
  const orderedJsonSlugs = doc.articles.map((article) => article.slug);
  const feedSlugs = new Set(
    feed.items.map((item) => {
      assert.equal(
        typeof item.url,
        'string',
        `${category}: every feed item must expose a canonical article URL string`,
      );
      const pathname = new URL(item.url).pathname;
      assert.match(
        pathname,
        /^\/wiki\/[^/]+\/$/,
        `${category}: every feed item URL must use the canonical /wiki/<slug>/ route`,
      );
      return pathname.slice('/wiki/'.length, -1);
    }),
  );

  assert.equal(
    orderedHtmlSlugs.length,
    orderedJsonSlugs.length,
    `${category}: HTML hub and articles.json must list the same number of category articles`,
  );
  assert.deepEqual(
    orderedJsonSlugs,
    orderedHtmlSlugs,
    `${category}: articles.json order must match the rendered category hub order exactly`,
  );
  assert.deepEqual(
    [...feedSlugs].sort(),
    [...orderedJsonSlugs].sort(),
    `${category}: articles.json membership must match the existing category JSON feed membership`,
  );

  checkedCategories += 1;
  checkedArticles += orderedJsonSlugs.length;
}

console.log(
  `Category articles JSON check passed (${checkedCategories} categories, ${checkedArticles} articles; title-sort + HTML-order parity verified)`,
);
