import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { renderOgImage } from '../../lib/og-image';

const getPageSlug = (page: { id: string }) =>
  page.id.replace(/\/index\.(md|mdx)$/, '').replace(/\/index$/, '').replace(/\.(md|mdx)$/, '');

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  const articlePaths = pages.map((page) => ({
    params: { slug: getPageSlug(page) },
    props: {
      title: page.data.title,
      description: page.data.summary,
      label: page.data.categories?.[0] ?? 'Bittensor Knowledge Base',
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
