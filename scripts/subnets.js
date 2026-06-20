// Build the machine-readable subnet registry served at
// /wiki/special/subnets.json. Kept as a pure function in scripts/ (like
// statistics.js, most-linked.js, categories.js) so the Astro endpoint and the
// regression check share one source of truth without rendering the site.
//
// The HTML Special:Subnets page (src/pages/wiki/special/subnets.astro) renders
// the same netuid-ordered registry for humans; this builder exposes it as
// structured JSON for programmatic consumers (Bittensor dashboards, tooling,
// cross-referencing). Each entry comes from an article titled "Subnet <n>: <name>"
// — the netuid, the subnet name, the article slug, and its one-line summary —
// ordered by netuid (numeric), the same order the HTML page uses.

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
