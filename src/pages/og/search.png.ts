import type { APIRoute } from 'astro';
import { renderOgImage } from '../../lib/og-image';

export const GET: APIRoute = () =>
  new Response(
    renderOgImage({
      title: 'Search',
      description:
        'Search the Taopedia Bittensor knowledge base for articles on TAO, subnets, staking, mining, validation, and consensus.',
      label: 'Site search',
      home: false,
    }),
    {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
  );
