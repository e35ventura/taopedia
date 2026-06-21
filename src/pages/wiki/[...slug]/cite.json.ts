import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug, historyForSlug } from '../../../lib/article-history';
import { buildCitations, CITATION_META } from '../../../../scripts/citations.js';

// Machine-readable citations at /wiki/<slug>/cite.json: the structured form of
// the per-article HTML "Cite this page" (Special:CiteThisPage), for reference
// managers and programmatic consumers that cannot parse the rendered <pre>
// blocks. The citation strings come from the same buildCitations() pure function
// the HTML page (cite.astro) renders, with the identical title / canonical URL /
// slug / last-revision-date inputs, so the JSON and HTML surfaces cannot drift.

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  return pages.map((page) => {
    const slug = getPageSlug(page);
    return { params: { slug }, props: { page, slug } };
  });
}

export const GET: APIRoute = async ({ site, props }) => {
  const { page, slug } = props as { page: { data: { title: string } }; slug: string };
  // Same canonical, trailing-slash URL and last-revision date the cite page uses
  // (historyForSlug is newest-first; '' when an article has no recorded history).
  const url = new URL(`/wiki/${slug}/`, site ?? new URL('https://taopedia.org')).toString();
  const date = historyForSlug(slug)[0]?.date ?? '';
  const citations = buildCitations({ title: page.data.title, url, slug, date });

  const body = JSON.stringify(
    {
      title: page.data.title,
      slug,
      url,
      // Omitted when the article has no recorded history, matching the HTML cite
      // page (which hides the date row) and the JSON feed (which drops an empty
      // date), so the surfaces never disagree on "no date".
      ...(date ? { date } : {}),
      ...CITATION_META, // author, publisher
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
