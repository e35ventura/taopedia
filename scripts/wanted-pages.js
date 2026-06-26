// Build the "Wanted pages" ranking served at /wiki/special/wantedpages.json — the
// MediaWiki Special:WantedPages report, the one core special page this wiki was
// missing alongside MostLinkedPages / AllPages / RecentChanges. Kept as a pure
// function in scripts/ (like most-linked.js / statistics.js) so the endpoint and
// the regression check share one source of truth without rendering the site.
//
// A "wanted" page is a link TARGET that no published article satisfies: build-
// linkgraph.js resolves every wiki-link target through resolveTargetSlug, which
// returns the slugified target even when no article owns it (a red link), so the
// served linkgraph.json carries outbound targets that point at non-existent slugs.
// Every other consumer silently drops these via a `titleBySlug[target]` filter, so
// the highest-demand missing articles are currently invisible to editors. This
// surfaces them, ranked by how many DISTINCT published articles request each one.

// A target is "wanted" when it is non-empty, not satisfied by a published article
// (absent from titleBySlug), and not the requesting article itself (a self-link is
// never a wanted page). Shared so the endpoint and the check classify identically.
export function isWantedTarget(target, from, titleBySlug) {
  return Boolean(target) && !titleBySlug[target] && target !== from;
}

// Reduce the resolved outbound link graph to wanted targets and their distinct
// published requesters. Only links FROM a published article count, so an unpublished
// or stale source can't inflate demand. Returns a Map<wantedSlug, Set<fromSlug>>.
export function collectWantedRequesters({ linkGraph, titleBySlug }) {
  const requestersByTarget = new Map();
  for (const [from, links] of Object.entries(linkGraph ?? {})) {
    if (!titleBySlug[from]) continue;
    for (const link of Array.isArray(links) ? links : []) {
      const target = link?.target;
      if (!isWantedTarget(target, from, titleBySlug)) continue;
      let requesters = requestersByTarget.get(target);
      if (!requesters) requestersByTarget.set(target, (requesters = new Set()));
      requesters.add(from);
    }
  }
  return requestersByTarget;
}

// Rank wanted pages by distinct-requester count (desc), then by a PLAIN code-unit
// slug comparison — the same slug tiebreak buildMostLinkedPages / getArticleReferences
// / search-data use, NOT compareTitles, whose numeric collation would order subnet_9
// before subnet_10 while every other listing on the site puts subnet_10 first (raw
// '1' < '9'). This keeps the report deterministic regardless of link-graph iteration
// order AND ordered identically to the rest of the site. Each entry lists its
// requesting article slugs in the same plain code-unit order.
export function buildWantedPages({ linkGraph, titleBySlug }) {
  const requestersByTarget = collectWantedRequesters({ linkGraph, titleBySlug });
  return [...requestersByTarget.entries()]
    .map(([slug, requesters]) => ({
      slug,
      count: requesters.size,
      requestedBy: [...requesters].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)),
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}
