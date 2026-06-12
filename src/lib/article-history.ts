// Shared article slug + last-modified helpers for the build-time XML endpoints
// (sitemap.xml.ts and rss.xml.ts). Kept in one place so the two endpoints derive
// route slugs and lastmod dates from a single source instead of duplicating the
// logic. The component-side StructuredData history derivation is intentionally
// separate (it also needs the original publish date, not just the newest).

// Strip a content-collection id (`<slug>/index.mdx`, `<slug>/index`, `<slug>.md`)
// down to the route slug.
export const getPageSlug = (page: { id: string }): string =>
  page.id.replace(/\/index\.(md|mdx)$/, '').replace(/\/index$/, '').replace(/\.(md|mdx)$/, '');

// The build generates per-article revision history at public/history/<slug>.json
// (scripts/generate-history.js, ordered newest-first), so the newest commit date
// is each article's last-modified time. Returns '' when no history is recorded.
const historyModules = import.meta.glob('../../public/history/**/*.json', { eager: true }) as Record<
  string,
  { default?: { history?: Array<{ date?: string }> } }
>;

export const lastmodForSlug = (slug: string): string => {
  const mod = historyModules[`../../public/history/${slug}.json`];
  const date = mod?.default?.history?.[0]?.date;
  return typeof date === 'string' ? date : '';
};
