import type { APIRoute } from 'astro';
import { renderOgImage } from '../../../lib/og-image';
import categoriesIndex from '../../../../public/data/categories.json';
import { categoryPageDescription, categoryShareLabel } from '../../../lib/share-preview';
import { compareTitles } from '../../../lib/title-sort.js';

export async function getStaticPaths() {
  return Object.entries(categoriesIndex)
    .sort(([left], [right]) => compareTitles(left, right))
    .map(([categoryName, slugs]) => ({
      params: { category: categoryName.replace(/ /g, '_') },
      props: {
        title: categoryName,
        description: categoryPageDescription(categoryName),
        label: categoryShareLabel(Array.isArray(slugs) ? slugs.length : 0),
      },
    }));
}

export const GET: APIRoute = ({ props }) =>
  new Response(
    renderOgImage({
      title: props.title,
      description: props.description,
      label: props.label,
      home: false,
    }),
    {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
  );
