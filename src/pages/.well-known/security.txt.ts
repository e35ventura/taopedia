import type { APIRoute } from 'astro';
import { buildSecurityTxt } from '../../../scripts/security-txt.js';

// Serve /.well-known/security.txt (RFC 9116) so security researchers and
// automated scanners can discover the project's vulnerability-disclosure policy
// (the repository already documents it in SECURITY.md). The origin comes from
// `site` in astro.config.mjs so the Canonical URL is correct in production and
// previews, matching the robots.txt and sitemap routes.
export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  return new Response(buildSecurityTxt({ origin }), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
