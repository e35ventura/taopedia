import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { buildArticleOembed } from '../../../lib/oembed';

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  return pages.map((page) => {
    const slug = getPageSlug(page);
    return {
      params: { slug },
      props: { slug, title: page.data.title },
    };
  });
}

// Static oEmbed provider document for every article, discovered via the
// <link rel="alternate" type="application/json+oembed"> tag in the article head.
// Lets link unfurlers render a rich card from the article's title and existing
// OG thumbnail. Reuses the same canonical URL and /og/<slug>.png the page emits
// — no new data, asset, or render.
export const GET: APIRoute = async ({ props, site }) => {
  const { slug, title } = props as { slug: string; title: string };
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const body = JSON.stringify(buildArticleOembed({ slug, title, origin }), null, 2);

  // oEmbed (oembed.com) names the response mime type as exactly application/json.
  return new Response(body, {
    headers: { 'Content-Type': 'application/json' },
  });
};
