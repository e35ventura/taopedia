import type { APIRoute } from 'astro';
import { buildOpenSearchDescription } from '../../scripts/opensearch.js';

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  return new Response(buildOpenSearchDescription({ origin }), {
    headers: {
      'Content-Type': 'application/opensearchdescription+xml; charset=utf-8',
    },
  });
};
