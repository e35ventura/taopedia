import type { APIRoute } from 'astro';
import { renderPwaIcon } from '../lib/pwa-icon.js';

// Maskable PWA app icon (512x512, purpose "maskable"), referenced by
// site.webmanifest. The logo is inset into the central safe zone so platform
// icon masking (circle / squircle / rounded-rect) never clips it. Rendered from
// the brand logo at build time, like the OG images.
export const GET: APIRoute = () =>
  new Response(renderPwaIcon(512, { maskable: true }), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
