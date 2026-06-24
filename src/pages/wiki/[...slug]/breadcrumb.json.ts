import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { buildArticleBreadcrumb, getArticleBreadcrumbTrail } from '../../../lib/article-breadcrumb.js';
import { getArticleReferences } from '../../../lib/article-references.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';

const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};

const linkgraphModules = import.meta.glob('../../../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target?: string }>> }
>;
const linkgraphData = Object.values(linkgraphModules)[0]?.default ?? {};

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  const titleBySlug = Object.fromEntries(pages.map((page) => [getPageSlug(page), page.data.title]));

  return pages.map((page) => {
    const slug = getPageSlug(page);
    const history = historyForSlug(slug);
    const { primaryTopic, items } = getArticleBreadcrumbTrail({
      title: page.data.title,
      categories: page.data.categories ?? [],
    });

    return {
      params: { slug },
      props: {
        slug,
        title: page.data.title,
        summary: page.data.summary ?? '',
        categories: page.data.categories ?? [],
        incomingLinks: publishedInboundLinkCount(backlinksData, slug, titleBySlug),
        revisionCount: history.length,
        firstEdited: history[history.length - 1]?.date ?? null,
        lastEdited: history[0]?.date ?? null,
        referencesCount: getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length,
        wordCount: (page.body ?? '').trim().split(/\s+/).filter(Boolean).length,
        primaryTopic,
        items,
      },
    };
  });
}

// Machine-readable companion to the rendered article breadcrumb. It uses the same
// shared breadcrumb helper the article page consumes, so the trail, topic link,
// and current-page contract live in one runtime source of truth.
export const GET: APIRoute = async ({ props, site }) => {
  const {
    slug,
    title,
    summary,
    categories,
    incomingLinks,
    revisionCount,
    firstEdited,
    lastEdited,
    referencesCount,
    wordCount,
    primaryTopic,
    items,
  } = props as {
    slug: string;
    title: string;
    summary: string;
    categories: string[];
    incomingLinks: number;
    revisionCount: number;
    firstEdited: string | null;
    lastEdited: string | null;
    referencesCount: number;
    wordCount: number;
    primaryTopic: string | null;
    items: Array<{ position: number; name: string; href: string | null; current: boolean }>;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = JSON.stringify(
    buildArticleBreadcrumb({
      slug,
      title,
      origin,
      summary,
      categories,
      incomingLinks,
      revisionCount,
      firstEdited,
      lastEdited,
      referencesCount,
      wordCount,
      primaryTopic,
      items,
    }),
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
