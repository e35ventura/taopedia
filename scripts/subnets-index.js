// Build the machine-readable subnet index served at
// /wiki/special/subnets.json. Kept as a pure function in scripts/ (like
// statistics.js, opml.js, rss-feed.js) so the Astro endpoint and the regression
// check share one source of truth without rendering the site.
//
// The HTML Special:Subnets page (src/pages/wiki/special/subnets.astro) displays
// the same registry for human readers; this builder exposes it as structured
// JSON for programmatic consumers (dashboards, monitoring, subnet explorers).
// The extraction regex and numeric sort match the HTML page exactly, so the two
// surfaces never disagree on which subnets are listed or in what order.

const SUBNET_TITLE_PATTERN = /^Subnet (\d+)(?::\s*(.*))?$/;

export function buildSubnetsIndex({ pages, getPageSlug }) {
  const subnets = [];
  for (const page of pages) {
    const title = String(page?.data?.title ?? '');
    const match = title.match(SUBNET_TITLE_PATTERN);
    if (!match) continue;

    const netuid = Number(match[1]);
    const extractedName = (match[2] ?? '').trim();
    const slug = getPageSlug(page);
    const summary = String(page?.data?.summary ?? '');

    subnets.push({
      netuid,
      name: extractedName || `Subnet ${netuid}`,
      slug,
      summary,
    });
  }

  // Numeric sort by netuid (ascending). This is deterministic by nature — no
  // locale or string-comparison concerns. Matches the HTML page's sort exactly.
  subnets.sort((a, b) => a.netuid - b.netuid);

  return {
    count: subnets.length,
    subnets,
  };
}
