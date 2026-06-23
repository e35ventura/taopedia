import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { buildCitations, CITATION_META } from '../../../../scripts/citations.js';
import { publishedInboundLinkCount } from '../../../../scripts/most-linked.js';

const backlinksModules = import.meta.glob('../../../../public/data/backlinks.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ from: string }>> }
>;
const backlinksData = Object.values(backlinksModules)[0]?.default ?? {};

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  const titleBySlug = Object.fromEntries(pages.map((page) => [getPageSlug(page), page.data.title]));

  return pages.map((page) => {
    const slug = getPageSlug(page);
    return {
      params: { slug },
      props: {
        page,
        slug,
        incomingLinks: publishedInboundLinkCount(backlinksData, slug, titleBySlug),
      },
    };
  });
}

export const GET: APIRoute = async ({ site, props }) => {
  const { page, slug, incomingLinks } = props as {
    page: { data: { title: string; summary?: string; categories?: string[] } };
    slug: string;
    incomingLinks: number;
  };
  const url = new URL(`/wiki/${slug}/`, site ?? new URL('https://taopedia.org')).toString();
  const date = historyForSlug(slug)[0]?.date ?? '';
  const citations = buildCitations({ title: page.data.title, url, slug, date });

  const body = JSON.stringify(
    {
      title: page.data.title,
      slug,
      summary: page.data.summary || null,
      url,
      citeJsonUrl: new URL(`/wiki/${slug}/cite.json`, site ?? new URL('https://taopedia.org')).toString(),
      citeUrl: new URL(`/wiki/${slug}/cite/`, site ?? new URL('https://taopedia.org')).toString(),
      bibtexUrl: new URL(`/wiki/${slug}/cite.bib`, site ?? new URL('https://taopedia.org')).toString(),
      historyUrl: new URL(`/wiki/${slug}/history/`, site ?? new URL('https://taopedia.org')).toString(),
      historyJsonUrl: new URL(`/wiki/${slug}/history.json`, site ?? new URL('https://taopedia.org')).toString(),
      backlinksUrl: new URL(`/wiki/${slug}/backlinks/`, site ?? new URL('https://taopedia.org')).toString(),
      backlinksJsonUrl: new URL(`/wiki/${slug}/backlinks.json`, site ?? new URL('https://taopedia.org')).toString(),
      infoUrl: new URL(`/wiki/${slug}/info/`, site ?? new URL('https://taopedia.org')).toString(),
      infoJsonUrl: new URL(`/wiki/${slug}/info.json`, site ?? new URL('https://taopedia.org')).toString(),
      tocJsonUrl: new URL(`/wiki/${slug}/toc.json`, site ?? new URL('https://taopedia.org')).toString(),
      referencesUrl: new URL(`/wiki/${slug}/references.json`, site ?? new URL('https://taopedia.org')).toString(),
      relatedUrl: new URL(`/wiki/${slug}/related.json`, site ?? new URL('https://taopedia.org')).toString(),
      imageUrl: new URL(`/og/${slug}.png`, site ?? new URL('https://taopedia.org')).toString(),
      categories: page.data.categories ?? [],
      incomingLinks: Number.isFinite(incomingLinks) ? incomingLinks : 0,
      ...(date ? { date } : {}),
      ...CITATION_META,
      citations,
    },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
