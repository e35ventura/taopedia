import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { buildCitations, CITATION_META } from '../../../../scripts/citations.js';

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  return pages.map((page) => {
    const slug = getPageSlug(page);
    return { params: { slug }, props: { page, slug } };
  });
}

export const GET: APIRoute = async ({ site, props }) => {
  const { page, slug } = props as { page: { data: { title: string } }; slug: string };
  const url = new URL(`/wiki/${slug}/`, site ?? new URL('https://taopedia.org')).toString();
  const date = historyForSlug(slug)[0]?.date ?? '';
  const citations = buildCitations({ title: page.data.title, url, slug, date });

  const body = JSON.stringify(
    {
      title: page.data.title,
      slug,
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
