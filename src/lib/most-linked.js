import { compareTitles } from './title-sort.js';

export function publishedInboundLinkCount(backlinks, slug, titleBySlug) {
  const links = backlinks?.[slug];
  return (Array.isArray(links) ? links : []).filter((link) => titleBySlug?.[link?.from]).length;
}

export function buildMostLinkedPages({ backlinks, titleBySlug }) {
  return Object.entries(backlinks ?? {})
    .filter(([slug]) => titleBySlug?.[slug])
    .map(([slug]) => ({
      slug,
      title: titleBySlug[slug],
      count: publishedInboundLinkCount(backlinks, slug, titleBySlug),
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || compareTitles(a.title, b.title) || compareTitles(a.slug, b.slug));
}
