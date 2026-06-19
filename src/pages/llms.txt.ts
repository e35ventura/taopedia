import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildLlmsTxt } from '../../scripts/llms.js';
import { getPageSlug } from '../lib/article-history';
import { compareTitles } from '../lib/title-sort.js';

// Serve /llms.txt (https://llmstxt.org): a plain-Markdown index of every
// published article so LLMs and agents can discover the wiki's structure and
// canonical URLs without scraping rendered HTML. Ordered by title (numeric
// collation) for a stable, readable map. The origin comes from `site`
// (astro.config.mjs) so absolute URLs are correct in production and previews.
export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');
  const articles = pages
    .filter((page) => page.data.draft !== true)
    .map((page) => ({
      slug: getPageSlug(page),
      title: page.data.title,
      summary: page.data.summary ?? '',
    }))
    .sort((a, b) => compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));

  return new Response(buildLlmsTxt({ siteUrl: origin, articles }), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
