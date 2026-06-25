// Build the machine-readable subnet registry served at
// /wiki/special/subnets.json. Kept as a pure function in scripts/ (like
// statistics.js, most-linked.js, categories.js) so the Astro endpoint and the
// regression check share one source of truth without rendering the site.
//
// The HTML Special:Subnets page (src/pages/wiki/special/subnets.astro) and this
// builder use the SAME "Subnet <n>: <name>" parsing, fallback name, slug, and
// numeric-netuid sort, so the JSON and HTML surfaces never disagree on which
// articles are subnets or what their netuid order is. Both call this function
// (the .astro page imports it the same way it imports statistics.js /
// most-linked.js / categories.js).

const SUBNET_TITLE_PATTERN = /^Subnet (\d+)(?::\s*(.*))?$/;

export function buildSubnets({ pages, getPageSlug }) {
  const subnets = (Array.isArray(pages) ? pages : [])
    .map((page) => {
      const title = page?.data?.title ?? '';
      const match = SUBNET_TITLE_PATTERN.exec(title);
      if (!match) return null;
      const netuid = Number(match[1]);
      if (!Number.isInteger(netuid) || netuid < 0) return null;
      const rawName = (match[2] ?? '').trim();
      const name = rawName || `Subnet ${match[1]}`;
      return {
        netuid,
        name,
        slug: getPageSlug(page),
        summary: page?.data?.summary ?? '',
        categories: Array.isArray(page?.data?.categories) ? [...new Set(page.data.categories)] : [],
      };
    })
    .filter((entry) => entry !== null);

  // Numeric-netuid sort, ascending. Both surfaces (HTML + JSON) derive this
  // from the same builder so the two never disagree on order, including the
  // tied netuid case (stable, in input order) the HTML page currently
  // produces via Array.prototype.sort.
  return subnets.sort((a, b) => a.netuid - b.netuid);
}

// Build the subnet registry from public/data/slugmap.json — the same artifact
// check-subnets-json.js uses as ground truth — instead of calling
// getCollection('pages') and re-reading every article's frontmatter.
export function buildSubnetsFromSlugMap(slugMap = {}) {
  return buildSubnets({
    pages: Object.entries(slugMap).map(([slug, entry]) => ({
      id: `${slug}/index.mdx`,
      data: {
        title: entry?.title ?? slug,
        summary: entry?.summary ?? '',
        categories: Array.isArray(entry?.categories) ? entry.categories : [],
      },
    })),
    getPageSlug: (page) => String(page.id).replace(/\/index\.mdx$/, ''),
  });
}
