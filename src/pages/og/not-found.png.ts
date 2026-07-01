import type { APIRoute } from 'astro';
import { renderOgImage } from '../../lib/og-image';

export const GET: APIRoute = () =>
  new Response(
    renderOgImage({
      title: 'Page not found',
      description:
        'The requested page does not exist in the Taopedia Bittensor knowledge base. Search or browse the article directory to continue.',
      label: 'Error page',
      home: false,
    }),
    {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
  );
