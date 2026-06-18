// Build the body of /robots.txt. Kept as a pure function in scripts/ (like
// wiki-link-resolver.js) so the Astro route and the regression check share one
// source of truth and can be unit tested without rendering the site.
//
// Directives:
//   - Allow general crawling so every article and listing page is indexable.
//   - Disallow the search route. /search renders no unique content on its own
//     and /search?q=... expands to unbounded parameterized URLs that are not in
//     the sitemap; keeping crawlers off it preserves crawl budget.
//   - Disallow /pagefind/. Pagefind ships WASM/JSON search-index assets for the
//     client-side search UI; they are not article content and are not in the sitemap.
//   - Advertise the XML sitemap. Per the robots.txt protocol the Sitemap value
//     must be an absolute URL, so it is built from the site origin.

export function buildRobotsTxt({ origin }) {
  const base = String(origin || '').replace(/\/$/, '');
  const lines = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /search',
    'Disallow: /pagefind/',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ];
  return lines.join('\n');
}
