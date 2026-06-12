// Shared article slug + revision-history helpers for the build-time consumers
// (sitemap.xml.ts, rss.xml.ts, and the Special:Statistics overview page). Kept
// in one place so they derive route slugs and history from a single source
// instead of duplicating the logic. The component-side StructuredData history
// derivation is intentionally separate (it also needs the original publish date).

// Strip a content-collection id (`<slug>/index.mdx`, `<slug>/index`, `<slug>.md`)
// down to the route slug.
export const getPageSlug = (page: { id: string }): string =>
  page.id.replace(/\/index\.(md|mdx)$/, '').replace(/\/index$/, '').replace(/\.(md|mdx)$/, '');

// The build generates per-article revision history at public/history/<slug>.json
// (scripts/generate-history.js, ordered newest-first). Returns [] when none.
const historyModules = import.meta.glob('../../public/history/**/*.json', { eager: true }) as Record<
  string,
  { default?: { history?: Array<{ date?: string }> } }
>;

export const historyForSlug = (slug: string): Array<{ date?: string }> => {
  const mod = historyModules[`../../public/history/${slug}.json`];
  return mod?.default?.history ?? [];
};

// The newest commit date is each article's last-modified time ('' when none).
export const lastmodForSlug = (slug: string): string => {
  const date = historyForSlug(slug)[0]?.date;
  return typeof date === 'string' ? date : '';
};
