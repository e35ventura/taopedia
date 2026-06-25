import type { APIRoute } from 'astro';
import { renderOgImage } from '../../lib/og-image';
import slugMap from '../../../public/data/slugmap.json';

export async function getStaticPaths() {
  // Read public/data/slugmap.json for title/summary/categories — the same
  // artifact search-data.json (#1405) and the site-wide feeds (#1422–#1423)
  // use — instead of calling getCollection('pages') and re-reading frontmatter
  // for every article's OG card props.
  const articlePaths = Object.entries(slugMap).map(([slug, entry]) => ({
    params: { slug },
    props: {
      title: entry?.title ?? slug,
      description: entry?.summary ?? '',
      label: entry?.categories?.[0] ?? 'Bittensor Knowledge Base',
      home: false,
    },
  }));

  return [
    {
      params: { slug: 'home' },
      props: {
        title: 'Bittensor Knowledge Base',
        description:
          'A Bittensor-focused knowledge base for TAO, subnets, wallets, staking, mining, validation, and consensus.',
        label: 'Bittensor Knowledge Base',
        home: true,
      },
    },
    ...articlePaths.filter((path) => path.params.slug !== 'home'),
  ];
}

export const GET: APIRoute = ({ props }) =>
  new Response(
    renderOgImage({
      title: props.title,
      description: props.description,
      label: props.label,
      home: props.home,
    }),
    {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    }
  );
