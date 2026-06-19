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
// Both must bind to the same backing variable (canonicalUrl) AND must be the
// only tag of their kind in the document: a second stale or conflicting
// <link rel="canonical"> (e.g. left by a refactor) makes the canonical signal
// ambiguous to crawlers, and a second <meta property="og:url"> makes the share
// card target non-deterministic. No existing check guards either tag directly:
//   - check-structured-data.js tests the JSON-LD builder (a separate consumer
//     surface; social/search crawlers do not all read JSON-LD).
//   - check-share-metadata.js guards the OG/Twitter image-card tags but not
//     og:url or the canonical link.
//   - the discovery check series (rss/opensearch/atom/json-feed/category-feed)
//     guards the other <link rel=...> tags in this component.
//
// This fills the canonical-URL gap so a refactor, deletion, OR duplicate
// insertion fails fast, mirroring the discovery check series on the same
// component.

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const seo = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'Seo.astro'), 'utf8');

// Extract every <link> and <meta> tag once. The extract-then-filter form
// (rather than .some()) lets us assert the EXACTLY-ONE contract below — a
// regression that added a second stale <link rel="canonical"> or a second
// <meta property="og:url"> would silently make the canonical signal ambiguous,
// so passing on the first match is not enough.
const linkTags = [...seo.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
const metaTags = [...seo.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);

// <link rel="canonical">: collect every candidate, then assert exactly one,
// and that the one carries href={canonicalUrl}. A future hreflang on the same
// tag is fine — the [^>]* form tolerates extra attributes — but only one tag
// may carry rel="canonical", and it must bind to canonicalUrl.
const canonicalLinks = linkTags.filter(
  (tag) => /\brel="canonical"/.test(tag) && /\bhref=\{canonicalUrl\}/.test(tag),
);
assert.equal(
  canonicalLinks.length,
  1,
  'Seo head must emit exactly one <link rel="canonical" href={canonicalUrl}> (got ' +
    canonicalLinks.length +
    '): search engines resolve the authoritative URL from this tag, and a duplicate or missing tag makes the canonical signal ambiguous',
);

// <meta property="og:url">: same exactly-one contract, bound to the SAME
// canonicalUrl variable so the share-card URL matches the search-engine
// canonical. A regression that bound og:url to a different variable (or to a
// hardcode) would split the page's link equity between two URLs; a duplicate
// would make the share-card target non-deterministic.
const ogUrlMetas = metaTags.filter(
  (tag) => /\bproperty="og:url"/.test(tag) && /\bcontent=\{canonicalUrl\}/.test(tag),
);
assert.equal(
  ogUrlMetas.length,
  1,
  'Seo head must emit exactly one <meta property="og:url" content={canonicalUrl}> (got ' +
    ogUrlMetas.length +
    '): social-crawler share cards resolve the same canonical URL as <link rel="canonical">, and a duplicate or missing tag makes the share-card target ambiguous',
);

console.log('Canonical URL check passed');
