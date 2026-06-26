import { getCollection } from 'astro:content';
import { getPageSlug } from './article-history';

export type ContentPage = Awaited<ReturnType<typeof getCollection<'pages'>>>[number];

// Resolve content-collection pages for a slug subset. Special-listing JSON
// endpoints (mostlinkedpages, recentchanges, subnets, category articles) only
// need render()/body for a handful of members — not every published article —
// so they index the collection once and keep only the requested slugs.
export async function contentPagesBySlug(slugs: Iterable<string>): Promise<Record<string, ContentPage>> {
  const slugSet = slugs instanceof Set ? slugs : new Set(slugs);
  const pageBySlug: Record<string, ContentPage> = {};
  if (slugSet.size === 0) return pageBySlug;
  for (const page of await getCollection('pages')) {
    const slug = getPageSlug(page);
    if (slugSet.has(slug)) pageBySlug[slug] = page;
  }
  return pageBySlug;
}
