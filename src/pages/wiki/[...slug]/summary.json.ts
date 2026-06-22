import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, lastmodForSlug } from '../../../lib/article-history';
import { buildArticleSummary } from '../../../lib/article-summary.js';

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  return pages.map((page) => {
    const slug = getPageSlug(page);
    return {
      params: { slug },
      props: {
        slug,
        title: page.data.title,
        summary: page.data.summary ?? '',
        categories: page.data.categories ?? [],
        // Newest-commit date from public/history/<slug>.json (same source as the
        // article's "Last updated" line and the sitemap <lastmod>); '' when none.
        timestamp: lastmodForSlug(slug),
      },
    };
  });
}

// Machine-readable per-article summary in the Wikipedia REST `/page/summary/`
// shape. It re-serializes only what /wiki/<slug>/ already renders (title, lede
// summary, topic categories, the advertised OG share image, last-modified date),
// giving link-preview and reader tooling a standard document without an HTML
// subpage or any visual change.
export const GET: APIRoute = async ({ props, site }) => {
  const { slug, title, summary, categories, timestamp } = props as {
    slug: string;
    title: string;
    summary: string;
    categories: string[];
    timestamp: string;
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = JSON.stringify(
    buildArticleSummary({ slug, title, origin, summary, categories, timestamp }),
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
