import type { APIRoute } from 'astro';
import { renderPwaIcon } from '../lib/pwa-icon.js';

// PWA app icon (192x192), referenced by site.webmanifest. A 192px icon is one of
// the two sizes required for browser install eligibility. Rendered from the brand
// logo at build time, like the OG images.
export const GET: APIRoute = () =>
  new Response(renderPwaIcon(192), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
