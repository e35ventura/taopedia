// Build-time builder for the per-article summary.json endpoint. It implements
// the Wikipedia REST API `/page/summary/{title}` response shape (type/title/
// extract/thumbnail/content_urls) for each article — the same lede-plus-image
// preview the article page already renders, exposed under a named, stable wire
// contract instead of only as page-specific HTML and <meta> tags.
//
// It is distinct from info.json (the Page-information record: link counts,
// revision counts, companion URLs): summary.json carries the article *content*
// preview — the `extract` (lede text) and `thumbnail` (share image) — which no
// existing endpoint serializes.
//
// It serializes ONLY data the article page already renders: the title (the
// <h1> firstHeading), the lede/summary text (the .mw-article-summary block),
// the topic categories (the Topics row), the per-article Open Graph share image
// (/og/<slug>.png, advertised in the page head at 1200x630), and the
// last-modified timestamp (the "Last updated" line, taken from the same revision
// history that drives the sitemap and the history page). No new build pipeline
// or data source is introduced.

// The Open Graph card is rendered at a fixed 1200x630 (src/lib/og-image.ts) and
// the page head advertises exactly these dimensions via og:image:width/height,
// so the thumbnail metadata mirrors the asset the article already exposes.
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

export const buildArticleSummary = ({
  slug,
  title,
  origin,
  summary = '',
  categories = [],
  timestamp = null,
}) => {
  // The article only shows the .mw-article-summary block when a summary exists,
  // so an article without one serializes an empty extract (honest, not invented).
  const extract = typeof summary === 'string' ? summary.trim() : '';
  const normalizedTimestamp = typeof timestamp === 'string' && timestamp ? timestamp : null;

  return {
    type: 'standard',
    title,
    displaytitle: title,
    slug,
    // Wikipedia exposes canonical/normalized/display titles; Taopedia has no
    // namespace prefixes, so the human title is both the normalized and display
    // form and the route slug is the canonical key.
    titles: {
      canonical: slug,
      normalized: title,
      display: title,
    },
    lang: 'en',
    dir: 'ltr',
    timestamp: normalizedTimestamp,
    extract,
    categories: Array.isArray(categories) ? [...categories] : [],
    thumbnail: {
      source: `${origin}/og/${slug}.png`,
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
    },
    url: `${origin}/wiki/${slug}/`,
    summaryJsonUrl: `${origin}/wiki/${slug}/summary.json`,
    // content_urls mirrors the REST API container, limited to the surfaces this
    // static wiki actually publishes: the article itself and its revision list.
    content_urls: {
      desktop: {
        page: `${origin}/wiki/${slug}/`,
        revisions: `${origin}/wiki/${slug}/history/`,
      },
    },
  };
};
