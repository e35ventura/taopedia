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
    });
  }

  return articles.sort((a, b) => compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));
};

export const buildCategoryArticlesDocument = ({ origin, categoryName, categoryPath, articles = [] }) => ({
  site: origin,
  category: categoryName,
  url: `${origin}/wiki/category/${categoryPath}/`,
  count: articles.length,
  articles: articles.map((article) => ({
    slug: article.slug,
    title: article.title,
    summary: article.summary || null,
    url: `${origin}/wiki/${article.slug}/`,
  })),
});
