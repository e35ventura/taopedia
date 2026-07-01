import { render } from 'astro:content';
import categoriesIndex from '../../public/data/categories.json';
import slugMap from '../../public/data/slugmap.json';
import backlinksData from '../../public/data/backlinks.json';
import linkgraphData from '../../public/data/linkgraph.json';
import { publishedTitleBySlug } from './article-metadata';
import { gatherLinkStatsBySlug } from './article-link-stats';
import { historyForSlug, revisionStatsFromHistory } from './article-history';
import { getCategoryArticles } from './category-articles.js';
import { contentPagesBySlug } from './content-pages-by-slug';
import { getArticleToc } from './article-toc.js';
import { compareTitles } from './title-sort.js';

export type CategoryDirectoryArticle = {
  slug: string;
  title: string;
  summary: string;
  categories: string[];
  backlinks: number;
  referencesCount: number;
  revisionCount: number;
  firstEdited: string | null;
  lastEdited: string | null;
  wordCount: number;
  sectionCount: number;
  readingMinutes: number;
};

export type CategoryDirectorySummary = {
  articleCount: number;
  totalBacklinks: number;
  totalReferences: number;
  totalRevisions: number;
  totalWords: number;
  averageReadingMinutes: number;
  newestEdited: string | null;
};

export type CategoryDirectoryStaticPath = {
  params: { category: string };
  props: {
    categoryName: string;
    categoryPath: string;
  };
};

export type CategoryDirectoryEntry = CategoryDirectoryStaticPath['props'] & {
  articles: CategoryDirectoryArticle[];
  summary: CategoryDirectorySummary;
};

type CategoryArticleBase = ReturnType<typeof getCategoryArticles>[number];

type CategoryDirectoryArticleStats = Pick<
  CategoryDirectoryArticle,
  'backlinks' | 'referencesCount' | 'revisionCount' | 'firstEdited' | 'lastEdited' | 'wordCount' | 'sectionCount' | 'readingMinutes'
>;

const CATEGORY_DIRECTORY_BATCH_SIZE = 8;

export const categoryPathFromName = (categoryName: string) => categoryName.replace(/ /g, '_');

const categoryNames = Object.keys(categoriesIndex).sort(compareTitles);
const allCategoryMemberSlugs = new Set<string>();
for (const categoryName of categoryNames) {
  for (const slug of Array.isArray(categoriesIndex[categoryName]) ? categoriesIndex[categoryName] : []) {
    allCategoryMemberSlugs.add(slug);
  }
}

const titleBySlug = publishedTitleBySlug(slugMap);
let pageBySlugPromise: ReturnType<typeof contentPagesBySlug> | null = null;
let linkStatsBySlugPromise: Promise<ReturnType<typeof gatherLinkStatsBySlug>> | null = null;
const articleStatsBySlugPromise = new Map<string, Promise<CategoryDirectoryArticleStats>>();
const categoryEntryByNamePromise = new Map<string, Promise<CategoryDirectoryEntry>>();

const summarizeCategoryArticles = (articles: CategoryDirectoryArticle[]): CategoryDirectorySummary => {
  const articleCount = articles.length;
  const totalBacklinks = articles.reduce((sum, article) => sum + article.backlinks, 0);
  const totalReferences = articles.reduce((sum, article) => sum + article.referencesCount, 0);
  const totalRevisions = articles.reduce((sum, article) => sum + article.revisionCount, 0);
  const totalWords = articles.reduce((sum, article) => sum + article.wordCount, 0);
  const totalReadingMinutes = articles.reduce((sum, article) => sum + article.readingMinutes, 0);
  const newestEdited = articles.reduce<string | null>(
    (latest, article) => {
      if (!article.lastEdited) return latest;
      if (!latest || article.lastEdited > latest) return article.lastEdited;
      return latest;
    },
    null,
  );

  return {
    articleCount,
    totalBacklinks,
    totalReferences,
    totalRevisions,
    totalWords,
    averageReadingMinutes: articleCount > 0 ? Math.round(totalReadingMinutes / articleCount) : 0,
    newestEdited,
  };
};

const mapInBatches = async <Input, Output>(
  items: Input[],
  mapper: (item: Input) => Promise<Output>,
): Promise<Output[]> => {
  const output: Output[] = [];
  for (let index = 0; index < items.length; index += CATEGORY_DIRECTORY_BATCH_SIZE) {
    output.push(...(await Promise.all(items.slice(index, index + CATEGORY_DIRECTORY_BATCH_SIZE).map(mapper))));
  }
  return output;
};

const getCategoryPageBySlug = () => {
  if (!pageBySlugPromise) {
    pageBySlugPromise = contentPagesBySlug(allCategoryMemberSlugs);
  }
  return pageBySlugPromise;
};

const getCategoryLinkStats = () => {
  if (!linkStatsBySlugPromise) {
    linkStatsBySlugPromise = Promise.resolve(
      gatherLinkStatsBySlug(allCategoryMemberSlugs, {
        titleBySlug,
        backlinksData,
        linkgraphData,
      }),
    );
  }
  return linkStatsBySlugPromise;
};

const getCategoryDirectoryArticleStats = (slug: string) => {
  const cached = articleStatsBySlugPromise.get(slug);
  if (cached) return cached;

  const statsPromise = (async (): Promise<CategoryDirectoryArticleStats> => {
    const [{ inboundBySlug, referencesCountBySlug }, pageBySlug] = await Promise.all([
      getCategoryLinkStats(),
      getCategoryPageBySlug(),
    ]);
    const history = historyForSlug(slug);
    const { revisionCount, firstEdited, lastEdited } = revisionStatsFromHistory(history);
    const page = pageBySlug[slug];
    const wordCount = (page?.body ?? '').trim().split(/\s+/).filter(Boolean).length;
    let sectionCount = 0;
    if (page) {
      const { headings } = await render(page);
      sectionCount = getArticleToc(headings).length;
    }

    return {
      backlinks: inboundBySlug[slug] ?? 0,
      referencesCount: referencesCountBySlug[slug] ?? 0,
      revisionCount,
      firstEdited,
      lastEdited,
      wordCount,
      sectionCount,
      readingMinutes: Math.max(1, Math.ceil(wordCount / 200)),
    };
  })();

  articleStatsBySlugPromise.set(slug, statsPromise);
  return statsPromise;
};

const buildCategoryDirectoryArticle = async (article: CategoryArticleBase): Promise<CategoryDirectoryArticle> => ({
  ...article,
  ...(await getCategoryDirectoryArticleStats(article.slug)),
});

export const buildCategoryDirectoryStaticPaths = async (): Promise<CategoryDirectoryStaticPath[]> =>
  categoryNames.map((categoryName) => ({
    params: { category: categoryPathFromName(categoryName) },
    props: {
      categoryName,
      categoryPath: categoryPathFromName(categoryName),
    },
  }));

export const getCategoryDirectoryEntry = (categoryName: string) => {
  const cached = categoryEntryByNamePromise.get(categoryName);
  if (cached) return cached;

  const entryPromise = (async (): Promise<CategoryDirectoryEntry> => {
    const categoryPath = categoryPathFromName(categoryName);
    const baseArticles = getCategoryArticles({ categoryName, categoriesIndex, slugMap });
    const articles = await mapInBatches(baseArticles, buildCategoryDirectoryArticle);

    return {
      categoryName,
      categoryPath,
      articles,
      summary: summarizeCategoryArticles(articles),
    };
  })();

  categoryEntryByNamePromise.set(categoryName, entryPromise);
  return entryPromise;
};
