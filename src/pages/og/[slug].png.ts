import type { APIRoute } from 'astro';
import { renderOgImage } from '../../lib/og-image';
import slugMap from '../../../public/data/slugmap.json';

export function getStaticPaths() {
  // Read public/data/slugmap.json — the same build artifact the sitemap (#1416),
  // feed.json (#1422), and atom.xml (#1423) already use — instead of calling
  // getCollection('pages') and re-parsing every article's frontmatter. The sitemap
  // emits each article's card URL as /og/<slugMap key>.png, so keying these routes by
  // the same slugMap entries keeps that coupling explicit and 1:1 (a key drift would
  // otherwise 404 the sitemap image URLs). slugMap stores title (|| slug), summary
  // (|| ''), and normalized categories (|| []), matching the previous frontmatter read.
  const articlePaths = Object.entries(slugMap)
    .filter(([slug]) => slug !== 'home')
    .map(([slug, entry]) => ({
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
    ...articlePaths,
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
