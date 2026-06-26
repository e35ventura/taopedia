import { compareTitles } from './title-sort.js';
import { articleJsonCompanionUrls } from './wiki-article-path.js';

export const getCategoryArticles = ({ categoryName, categoriesIndex = {}, slugMap = {} }) => {
  const slugs = Array.isArray(categoriesIndex[categoryName]) ? categoriesIndex[categoryName] : [];
  const seen = new Set();
  const articles = [];

  for (const slug of slugs) {
    if (seen.has(slug)) continue;
    const meta = slugMap[slug];
    if (!meta || typeof meta.title !== 'string' || !meta.title) continue;

    seen.add(slug);
    articles.push({
      slug,
      title: meta.title,
      summary: typeof meta.summary === 'string' ? meta.summary : '',
      categories: Array.isArray(meta.categories) ? meta.categories : [],
    });
  }

  // Same-title tiebreak must match the rendered category HTML page, which sorts
  // its members with sortPagesByTitle (src/lib/title-sort.js): compareTitles on
  // the title, then a PLAIN code-unit comparison of the stable unique entry id.
  // The slug is that id's stable unique component, so compare it the same way —
  // NOT with compareTitles, whose numeric collation would order two same-title
  // members "subnet_9" before "subnet_10" while the HTML page (raw id order)
  // puts "subnet_10" first, leaving articles.json and the page it mirrors in
  // conflicting order.
  return articles.sort(
    (a, b) => compareTitles(a.title, b.title) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
};

export const buildCategoryArticlesDocument = ({ origin, categoryName, categoryPath, articles = [] }) => ({
  site: origin,
  category: categoryName,
  url: `${origin}/wiki/category/${categoryPath}/`,
  articlesJsonUrl: `${origin}/wiki/category/${categoryPath}/articles.json`,
  feedUrl: `${origin}/wiki/category/${categoryPath}/feed.json`,
  // feedJsonUrl is the same JSON Feed link under the consistent <name>JsonUrl
  // key every other JSON companion uses (articlesJsonUrl, infoJsonUrl,
  // historyJsonUrl, backlinksJsonUrl, citeJsonUrl). feedUrl was the lone
  // outlier naming it without the Json suffix; it is kept for backwards
  // compatibility and feedJsonUrl is the consistent name.
  feedJsonUrl: `${origin}/wiki/category/${categoryPath}/feed.json`,
  atomUrl: `${origin}/wiki/category/${categoryPath}/atom.xml`,
  rssUrl: `${origin}/wiki/category/${categoryPath}/rss.xml`,
  count: articles.length,
  articles: articles.map((article) => ({
    slug: article.slug,
    title: article.title,
    summary: article.summary || null,
    categories: article.categories ?? [],
    backlinks: Number.isFinite(article.backlinks) ? article.backlinks : 0,
    // info.json names this figure incomingLinks; keep backlinks for the field
    // name the HTML listing endpoints (allpages/subnets/category) expose.
    incomingLinks: Number.isFinite(article.backlinks) ? article.backlinks : 0,
    // The article's published OUTBOUND reference count — the complement of
    // backlinks (its inbound count) — the same figure references.json / cite.json
    // / info.json expose and allpages.json / subnets.json expose per directory entry.
    referencesCount: Number.isFinite(article.referencesCount) ? article.referencesCount : 0,
    // The article's revision stats — revisionCount (commit-history length),
    // firstEdited (original publication date), lastEdited (last revision) — the
    // same per-entry trio references.json / allpages.json expose for each entry.
    revisionCount: Number.isFinite(article.revisionCount) ? article.revisionCount : 0,
    firstEdited: article.firstEdited ?? null,
    lastEdited: article.lastEdited ?? null,
    // The article body's word count — the same figure info.json exposes and
    // allpages.json / subnets.json / mostlinkedpages.json expose per directory entry.
    wordCount: Number.isFinite(article.wordCount) ? article.wordCount : 0,
    // The ~200-wpm reading-time estimate derived from wordCount — the same figure
    // info.json / allpages.json / subnets.json expose.
    readingMinutes: Math.max(1, Math.ceil((Number.isFinite(article.wordCount) ? article.wordCount : 0) / 200)),
    // The article's table-of-contents section count — the same figure toc.json
    // exposes as `count` and info.json / history.json expose, and subnets.json /
    // mostlinkedpages.json expose per directory entry.
    sectionCount: Number.isFinite(article.sectionCount) ? article.sectionCount : 0,
    ...articleJsonCompanionUrls(origin, article.slug),
    imageUrl: `${origin}/og/${article.slug}.png`,
  })),
});
