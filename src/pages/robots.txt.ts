import type { APIRoute } from 'astro';
import { buildRobotsTxt } from '../../scripts/robots.js';

// Serve /robots.txt as a static file. The site already emits an XML sitemap at
// /sitemap.xml; this gives crawlers an explicit crawl policy and a pointer to
// that sitemap. The origin comes from `site` (astro.config.mjs) so the absolute
// Sitemap URL is correct in production and previews alike.
export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  return new Response(buildRobotsTxt({ origin }), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
