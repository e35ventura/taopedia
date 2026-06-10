import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildLlmsTxt } from '../../scripts/llms.js';

// Serve /llms.txt as a static file. Following the llmstxt.org convention, it
// gives LLM and agent crawlers a curated, canonical, summary-rich index of the
// knowledge base instead of scraping HTML — complementing /robots.txt and
// /sitemap.xml. The origin comes from `site` (astro.config.mjs) so absolute URLs
// are correct in production and previews alike.
export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const pages = await getCollection('pages');

  return new Response(buildLlmsTxt({ origin, pages }), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
