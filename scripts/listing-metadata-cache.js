// Process-wide cache for buildArticleSlugMetadata() so the four special listing
// JSON endpoints (allpages, mostlinkedpages, subnets, recentchanges) each render
// every article exactly once per build instead of four independent render sweeps.
// Reset in tests via resetListingMetadataCache() when needed.

import { buildArticleSlugMetadata } from './article-listing.js';

let cache = null;

export async function getListingArticleSlugMetadata(args) {
  if (!cache) {
    cache = await buildArticleSlugMetadata(args);
  }
  return cache;
}

export function resetListingMetadataCache() {
  cache = null;
}
