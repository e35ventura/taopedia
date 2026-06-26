import { getArticleReferences } from './article-references.js';
import { publishedInboundLinkCount } from '../../scripts/most-linked.js';

export interface LinkStatsContext {
  titleBySlug: Record<string, string>;
  backlinksData: Record<string, unknown>;
  linkgraphData: Record<string, unknown>;
}

export interface LinkStatsBySlug {
  inboundBySlug: Record<string, number>;
  referencesCountBySlug: Record<string, number>;
}

// Gather each slug's published inbound-link count and outbound reference count in a
// single pass keyed by slug. Both figures resolve their targets through titleBySlug:
// publishedInboundLinkCount counts inbound links from other published articles, and
// getArticleReferences counts the article's outbound references (a full link-graph
// join). Shared by the special-listing JSON endpoints (allpages, category-articles,
// ...) that each inlined this identical loop.
export function gatherLinkStatsBySlug(
  slugs: Iterable<string>,
  { titleBySlug, backlinksData, linkgraphData }: LinkStatsContext,
): LinkStatsBySlug {
  const inboundBySlug: Record<string, number> = {};
  const referencesCountBySlug: Record<string, number> = {};
  for (const slug of slugs) {
    inboundBySlug[slug] = publishedInboundLinkCount(backlinksData, slug, titleBySlug);
    referencesCountBySlug[slug] = getArticleReferences({ slug, linkGraph: linkgraphData, titleBySlug }).length;
  }
  return { inboundBySlug, referencesCountBySlug };
}
