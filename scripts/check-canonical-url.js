import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The shared <head> (src/components/Seo.astro) emits two tags that declare the
// page's canonical URL:
//   - <link rel="canonical"> for search engines (Google consolidates ranking
//     signals to the canonical URL; without it, the same content at multiple
//     URLs is treated as duplicate and link equity is split or misattributed).
//   - <meta property="og:url"> for social crawlers (Facebook, LinkedIn, X,
//     Telegram, Slack) — share cards render against the canonical URL, so an
//     og:url that points elsewhere serves the wrong page's preview.
//
// Both must bind to the same backing variable (canonicalUrl) so they stay in
// sync: a regression that pointed them at different URLs (e.g. one at the
// resolved pathname and the other at a stale hardcode) would silently confuse
// crawlers about which URL is authoritative. No existing check guards either
// tag directly:
//   - check-structured-data.js tests the JSON-LD builder (a separate consumer
//     surface; social/search crawlers do not all read JSON-LD).
//   - check-share-metadata.js guards the OG/Twitter image-card tags but not
//     og:url or the canonical link.
//   - the discovery check series (rss/opensearch/atom/json-feed/category-feed)
//     guards the other <link rel=...> tags in this component.
//
// This fills the canonical-URL gap so a refactor or deletion fails fast,
// mirroring the discovery check series on the same component.

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const seo = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'Seo.astro'), 'utf8');

// <link rel="canonical"> must be present and bind its href to the canonicalUrl
// variable. Extract every <link> tag and check both attributes land on the same
// one — a tag with rel="canonical" but a different href (or vice versa) would
// silently point crawlers at the wrong URL. The extract-then-pair form
// tolerates additional attributes (hreflang, media) added later, guarding the
// invariant rather than the attribute order.
const linkTags = [...seo.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
const hasCanonicalLink = linkTags.some(
  (tag) => /\brel="canonical"/.test(tag) && /\bhref=\{canonicalUrl\}/.test(tag),
);
assert.ok(
  hasCanonicalLink,
  'Seo head must emit <link rel="canonical" href={canonicalUrl}> so search engines resolve the authoritative URL for each page',
);

// <meta property="og:url"> must bind to the SAME canonicalUrl variable, so the
// share-card URL matches the search-engine canonical. A regression that bound
// og:url to a different variable (or to a hardcode) would split the page's
// link equity between two URLs and render share cards against the wrong page.
// The same extract-then-pair form guards the property/content pairing without
// pinning attribute order.
const metaTags = [...seo.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
const hasOgUrl = metaTags.some(
  (tag) => /\bproperty="og:url"/.test(tag) && /\bcontent=\{canonicalUrl\}/.test(tag),
);
assert.ok(
  hasOgUrl,
  'Seo head must emit <meta property="og:url" content={canonicalUrl}> so social-crawler share cards resolve the same canonical URL as <link rel="canonical">',
);

console.log('Canonical URL check passed');
