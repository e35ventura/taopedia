import categoriesIndex from '../../public/data/categories.json';
import slugMap from '../../public/data/slugmap.json';
import { historyForSlug, lastmodForSlug } from './article-history';
import { getCategoryArticles } from './category-articles.js';

export const categoryPathFromName = (categoryName: string) => categoryName.replace(/ /g, '_');

type CategoryFeedItem = {
  slug: string;
  title: string;
  summary: string;
  categories: string[];
  datePublished: string;
  dateModified: string;
  date: string;
};

// Static paths for the per-category JSON Feed, Atom, and RSS endpoints. Reads
// public/data/categories.json for membership and slugmap.json for title/summary/
// categories — the same artifacts category articles.json (#1243) and
// categories.json (#1403) use — instead of calling getCollection('pages') and
// re-scanning every article's frontmatter in getStaticPaths.
export function buildCategoryFeedStaticPaths() {
  const historyBySlug: Record<string, ReturnType<typeof historyForSlug>> = {};
  const lastmodBySlug: Record<string, string> = {};

  const cacheSlugHistory = (slug: string) => {
    if (slug in historyBySlug) return;
    historyBySlug[slug] = historyForSlug(slug);
    lastmodBySlug[slug] = lastmodForSlug(slug);
  };

  return Object.keys(categoriesIndex)
    .sort()
    .map((categoryName) => {
      const articles = getCategoryArticles({ categoryName, categoriesIndex, slugMap });
      for (const article of articles) cacheSlugHistory(article.slug);

      const categoryPath = categoryPathFromName(categoryName);
      const items: CategoryFeedItem[] = articles.map((article) => {
        const history = historyBySlug[article.slug] ?? [];
        return {
          slug: article.slug,
          title: article.title,
          summary: article.summary,
          categories: article.categories,
          datePublished: history[history.length - 1]?.date ?? '',
          dateModified: history[0]?.date ?? '',
          date: lastmodBySlug[article.slug] ?? '',
        };
      });

      return {
        params: { category: categoryPath },
        props: { categoryName, categoryPath, items },
      };
    });
}
