// Build the machine-readable subnet registry served at
// /wiki/special/subnets.json. Kept as a pure function in scripts/ (like
// statistics.js, most-linked.js, categories.js) so the Astro endpoint and the
// regression check share one source of truth without rendering the site.
//
// This builder is shared by the JSON endpoint and its regression check. The HTML
// Special:Subnets page (src/pages/wiki/special/subnets.astro) parses the same
// "Subnet <n>: <name>" titles with its own independent inline logic; rather than
// claim it shares this builder, check-subnets-json.js re-derives the registry
// straight from the article sources and asserts the JSON matches it, so the two
// surfaces cannot silently drift. Each entry is the netuid, subnet name, article
// slug, and one-line summary, ordered by netuid (numeric).

export function buildSubnets({ pages, getPageSlug }) {
  return (pages ?? [])
    .map((page) => {
      const match = String(page?.data?.title ?? '').match(/^Subnet (\d+)(?::\s*(.*))?$/);
      if (!match) return null;
      const name = (match[2] ?? '').trim();
      return {
        netuid: Number(match[1]),
        name: name || `Subnet ${match[1]}`,
        slug: getPageSlug(page),
        summary: String(page?.data?.summary ?? '').replace(/\s+/g, ' ').trim(),
      };
    })
    .filter((entry) => entry !== null)
    .sort((a, b) => a.netuid - b.netuid);
}
