import { compareTitles } from './title-sort.js';

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
  atomUrl: `${origin}/wiki/category/${categoryPath}/atom.xml`,
  rssUrl: `${origin}/wiki/category/${categoryPath}/rss.xml`,
  count: articles.length,
  articles: articles.map((article) => ({
    slug: article.slug,
    title: article.title,
    summary: article.summary || null,
    categories: article.categories ?? [],
    backlinks: Number.isFinite(article.backlinks) ? article.backlinks : 0,
    url: `${origin}/wiki/${article.slug}/`,
    infoUrl: `${origin}/wiki/${article.slug}/info/`,
    infoJsonUrl: `${origin}/wiki/${article.slug}/info.json`,
    historyUrl: `${origin}/wiki/${article.slug}/history/`,
    historyJsonUrl: `${origin}/wiki/${article.slug}/history.json`,
    backlinksUrl: `${origin}/wiki/${article.slug}/backlinks/`,
    backlinksJsonUrl: `${origin}/wiki/${article.slug}/backlinks.json`,
    citeUrl: `${origin}/wiki/${article.slug}/cite/`,
    citeJsonUrl: `${origin}/wiki/${article.slug}/cite.json`,
    bibtexUrl: `${origin}/wiki/${article.slug}/cite.bib`,
    referencesUrl: `${origin}/wiki/${article.slug}/references.json`,
    relatedUrl: `${origin}/wiki/${article.slug}/related.json`,
    tocJsonUrl: `${origin}/wiki/${article.slug}/toc.json`,
    imageUrl: `${origin}/og/${article.slug}.png`,
  })),
});
