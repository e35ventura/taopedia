import type { APIRoute } from 'astro';
import { renderPwaIcon } from '../lib/pwa-icon.js';

// PWA app icon (512x512), referenced by site.webmanifest. A 512px icon is the
// second size required for browser install eligibility and is used for the
// splash screen. Rendered from the brand logo at build time, like the OG images.
export const GET: APIRoute = () =>
  new Response(renderPwaIcon(512), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
