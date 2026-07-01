import type { APIRoute } from 'astro';
import { renderOgImage } from '../../../lib/og-image';
import { listSpecialPageMeta } from '../../../lib/share-preview';

export async function getStaticPaths() {
  return listSpecialPageMeta().map((page) => ({
    params: { name: page.name },
    props: {
      title: page.title,
      description: page.description,
      label: page.label,
      kind: 'special',
    },
  }));
}

export const GET: APIRoute = ({ props }) =>
  new Response(
    renderOgImage({
      title: props.title,
      description: props.description,
      label: props.label,
      kind: props.kind,
      home: false,
    }),
    {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
  );
