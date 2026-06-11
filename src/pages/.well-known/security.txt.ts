import type { APIRoute } from 'astro';
import { buildSecurityTxt } from '../../../scripts/security-txt.js';

// Serve /.well-known/security.txt (RFC 9116) so researchers and automated
// scanners can discover the vulnerability-disclosure policy the repository
// already documents in SECURITY.md. The origin comes from `site` in
// astro.config.mjs, which is pinned to production — so the Canonical field
// names the authoritative production location on every deploy, previews
// included, as RFC 9116 intends.
export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  return new Response(buildSecurityTxt({ origin }), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
