// oEmbed (https://oembed.com) provider documents for articles. A "link"-type
// response is the honest choice for a wiki page: the consumer (Discord, Slack,
// Notion, WordPress, …) renders a rich link card from the title and thumbnail
// rather than embedding a widget. Everything here is derived from data the page
// already emits — the canonical URL and the existing /og/<slug>.png share image
// — so the oEmbed surface can never describe a different resource than the page.

export interface OembedDocument {
  version: '1.0';
  type: 'link';
  title: string;
  url: string;
  author_name: string;
  author_url: string;
  provider_name: string;
  provider_url: string;
  thumbnail_url: string;
  thumbnail_width: number;
  thumbnail_height: number;
  cache_age: number;
}

// The share image is the 1200×630 card emitted at /og/<slug>.png (same source
// the og:image / twitter:image meta tags point at).
export const OEMBED_THUMBNAIL_WIDTH = 1200;
export const OEMBED_THUMBNAIL_HEIGHT = 630;
// Advise consumers to cache for a day; article content changes slowly.
export const OEMBED_CACHE_AGE = 86400;

export const PROVIDER_NAME = 'Taopedia';

// Root-relative path of an article's oEmbed document. Used by both the route
// and the discovery <link rel="alternate" type="application/json+oembed"> so the
// two can never point at different paths.
export function oembedPath(slug: string): string {
  return `/wiki/${slug}/oembed.json`;
}

export function buildArticleOembed({
  slug,
  title,
  origin,
}: {
  slug: string;
  title: string;
  origin: string;
}): OembedDocument {
  return {
    version: '1.0',
    type: 'link',
    title,
    url: `${origin}/wiki/${slug}/`,
    author_name: PROVIDER_NAME,
    author_url: `${origin}/`,
    provider_name: PROVIDER_NAME,
    provider_url: `${origin}/`,
    thumbnail_url: `${origin}/og/${slug}.png`,
    thumbnail_width: OEMBED_THUMBNAIL_WIDTH,
    thumbnail_height: OEMBED_THUMBNAIL_HEIGHT,
    cache_age: OEMBED_CACHE_AGE,
  };
}
