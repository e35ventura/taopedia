import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpml } from './opml.js';

// /feeds.opml is the OPML 2.0 subscription index: a single file a reader
// imports into a feed reader (Feedly, Inoreader, Reeder, NetNewsWire) to
// bulk-subscribe to every site-wide feed, the site-wide Recent changes feed
// family, and every per-category feed at once. The XML contract is small but
// load-bearing — a malformed OPML silently fails to import in every reader, and
// a missing or wrong xmlUrl silently drops a feed from the bulk subscription.
// This check guards both:
//   1) Unit-tests buildOpml with constructed inputs (catches builder regressions
//      before the site is rendered).
//   2) Parses the built dist/feeds.opml and cross-references it against
//      public/data/categories.json so a wiring regression (missing endpoint,
//      divergent slug convention, dropped category) fails the build.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasOutlineWithUrls = (opml, { xmlUrl, htmlUrl }) => {
  const xmlUrlPattern = escapeRegex(xmlUrl);
  const htmlUrlPattern = escapeRegex(htmlUrl);
  return (
    new RegExp(`<outline\\b[^>]*xmlUrl="${xmlUrlPattern}"[^>]*htmlUrl="${htmlUrlPattern}"[^>]*/>`).test(opml) ||
    new RegExp(`<outline\\b[^>]*htmlUrl="${htmlUrlPattern}"[^>]*xmlUrl="${xmlUrlPattern}"[^>]*/>`).test(opml)
  );
};

// ---- 1) Unit: buildOpml produces a well-formed OPML 2.0 document ----------
{
  const opml = buildOpml({
    origin: 'https://taopedia.org',
    categories: ['Subnets', 'Consensus', 'Tokenomics'],
  });

  // XML prologue + OPML 2.0 root.
  assert.match(opml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/, 'must emit the XML prologue');
  assert.match(opml, /<opml version="2\.0">/, 'must declare OPML version 2.0');

  // Required <head> child: <title>. ownerName + description are also emitted.
  assert.match(
    opml,
    /<head>[\s\S]*<title>[^<]+ feeds<\/title>[\s\S]*<\/head>/,
    '<head> must contain a <title>',
  );
  assert.match(opml, /<ownerName>[^<]+<\/ownerName>/, '<head> must contain an <ownerName>');
  // OPML 2.0 lists <dateModified> (RFC 822) as a <head> child so feed readers
  // can tell when the index was last refreshed. The emitted value must parse
  // as a real instant (Date.parse accepts the toUTCString RFC 822 output).
  const dateModifiedMatch = opml.match(/<dateModified>([^<]+)<\/dateModified>/);
  assert.ok(dateModifiedMatch, '<head> must contain an OPML 2.0 <dateModified> element so readers can tell when the index was last refreshed');
  assert.ok(
    !Number.isNaN(Date.parse(dateModifiedMatch[1])),
    `<dateModified> must be a valid RFC 822 date, got ${dateModifiedMatch[1]}`,
  );
  assert.ok(
    opml.includes('<description>Taopedia — a Bittensor knowledge base. Subscribe to site-wide, recent-changes, and per-topic feeds.</description>'),
    '<head> must describe the site-wide, recent-changes, and per-topic subscription coverage',
  );

  // Site-wide feeds: RSS, Atom, JSON Feed — one outline each, with xmlUrl
  // pointing at the canonical site-wide route and htmlUrl at the homepage.
  assert.match(opml, /xmlUrl="https:\/\/taopedia\.org\/rss\.xml"/, 'must list the site-wide RSS feed');
  assert.match(opml, /xmlUrl="https:\/\/taopedia\.org\/atom\.xml"/, 'must list the site-wide Atom feed');
  assert.match(opml, /xmlUrl="https:\/\/taopedia\.org\/feed\.json"/, 'must list the site-wide JSON Feed feed');

  // OPML 2.0 defines only type="rss" for a feed-subscription outline; type="atom"
  // and type="json" are not valid OPML 2.0 outline types (the actual format is
  // conveyed by xmlUrl), so every feed outline must use type="rss" and no outline
  // may carry the non-spec atom/json types.
  assert.doesNotMatch(opml, /type="(?:atom|json)"/, 'feed outlines must use OPML-2.0 type="rss", not type="atom"/"json"');
  const rssTypedFeedOutlines = (opml.match(/<outline\s+type="rss"[^>]*\bxmlUrl="/g) || []).length;
  assert.ok(
    rssTypedFeedOutlines >= 3,
    `every feed-subscription outline must use type="rss"; found ${rssTypedFeedOutlines}`,
  );

  // Recent changes has its own scoped RSS/Atom/JSON feed family. OPML imports
  // should surface those page-scoped feeds too, using the Special:RecentChanges
  // page as the htmlUrl for each format entry.
  assert.match(
    opml,
    /<outline text="Recent changes" title="Recent changes">/,
    'must group the Recent changes feed family under a dedicated outline',
  );
  const recentChangesHub = 'https://taopedia.org/wiki/special/recentchanges/';
  for (const ext of ['rss.xml', 'atom.xml', 'feed.json']) {
    const xmlUrl = `https://taopedia.org/wiki/special/recentchanges/${ext}`;
    assert.ok(
      hasOutlineWithUrls(opml, { xmlUrl, htmlUrl: recentChangesHub }),
      `must list the Recent changes /${ext} feed with htmlUrl="${recentChangesHub}"`,
    );
  }

  // Each input category appears with all three per-category feed URLs, using
  // the space-to-underscore slug convention matching the category hub and
  // per-category feed routes.
  for (const label of ['Subnets', 'Consensus', 'Tokenomics']) {
    const hub = `https://taopedia.org/wiki/category/${label}/`;
    for (const ext of ['rss.xml', 'atom.xml', 'feed.json']) {
      const xmlUrl = `https://taopedia.org/wiki/category/${label}/${ext}`;
      assert.ok(
        opml.includes(`xmlUrl="${xmlUrl}"`),
        `category "${label}" must list its /${ext} feed (expected xmlUrl="${xmlUrl}")`,
      );
      assert.ok(
        opml.includes(`htmlUrl="${hub}"`),
        `category "${label}" /${ext} entry must point htmlUrl at the category hub`,
      );
    }
  }

  // Category names AND the URLs that contain them must be XML-escaped: a raw
  // ampersand would otherwise produce malformed OPML that no reader can import.
  // The `&` becomes &amp; both in the text attribute and inside the xmlUrl.
  const escaped = buildOpml({ origin: 'https://taopedia.org', categories: ['A & B'] });
  assert.ok(
    escaped.includes('text="A &amp; B"'),
    'category names with ampersands must be XML-escaped in text/title (& → &amp;)',
  );
  assert.ok(
    escaped.includes('xmlUrl="https://taopedia.org/wiki/category/A_&amp;_B/rss.xml"'),
    'xmlUrls containing ampersands must be XML-escaped (& → &amp;) so the OPML stays well-formed',
  );

  // Deterministic ordering: category groups appear in compareTitles order — the
  // same numeric-collation sort (locale-pinned to 'en', so still build-machine-
  // independent) that Special:Categories / Special:Statistics / the sitemap use.
  // With the inputs above the order is ["Consensus", "Subnets", "Tokenomics"].
  const consensusIdx = opml.indexOf('text="Consensus"');
  const subnetsIdx = opml.indexOf('text="Subnets"');
  const tokenomicsIdx = opml.indexOf('text="Tokenomics"');
  assert.ok(consensusIdx > -1 && subnetsIdx > -1 && tokenomicsIdx > -1, 'all test categories must be present');
  assert.ok(consensusIdx < subnetsIdx, 'Consensus must sort before Subnets');
  assert.ok(subnetsIdx < tokenomicsIdx, 'Subnets must sort before Tokenomics');

  // Numeric-suffixed categories (the site has 100+ "Subnet N" topics) must order
  // NUMERICALLY — Subnet 2 before Subnet 9 before Subnet 10 — matching every other
  // category listing on the site. Raw string order would put "Subnet 10" before
  // "Subnet 2"/"Subnet 9"; this pins the compareTitles fix.
  const numeric = buildOpml({
    origin: 'https://taopedia.org',
    categories: ['Subnet 10', 'Subnet 2', 'Subnet 9'],
  });
  const s2 = numeric.indexOf('text="Subnet 2"');
  const s9 = numeric.indexOf('text="Subnet 9"');
  const s10 = numeric.indexOf('text="Subnet 10"');
  assert.ok(s2 > -1 && s9 > -1 && s10 > -1, 'all numeric test categories must be present');
  assert.ok(
    s2 < s9 && s9 < s10,
    'numeric-suffixed categories must order numerically (Subnet 2 < Subnet 9 < Subnet 10), not by raw string',
  );

  // Origin trailing slash must be normalized away (no doubled slash in URLs).
  const withSlash = buildOpml({ origin: 'https://taopedia.org/', categories: [] });
  assert.match(
    withSlash,
    /xmlUrl="https:\/\/taopedia\.org\/rss\.xml"/,
    'origin trailing slash must be normalized (no doubled slash in feed URLs)',
  );
}

// ---- 2) Built output: dist/feeds.opml is wired and matches categories.json -
const distOpml = path.join(projectRoot, 'dist', 'feeds.opml');
const categoriesJsonPath = path.join(projectRoot, 'public', 'data', 'categories.json');
assert.ok(fs.existsSync(distOpml), 'dist/feeds.opml not found; run the build first');

const builtOpml = fs.readFileSync(distOpml, 'utf8');
const categoriesData = JSON.parse(fs.readFileSync(categoriesJsonPath, 'utf8'));
const builtCategories = Object.keys(categoriesData);
assert.ok(builtCategories.length > 0, 'no categories in public/data/categories.json');
assert.ok(
  builtOpml.includes('<description>Taopedia — a Bittensor knowledge base. Subscribe to site-wide, recent-changes, and per-topic feeds.</description>'),
  'dist/feeds.opml must describe the site-wide, recent-changes, and per-topic subscription coverage',
);

// The built endpoint must contain the full Recent changes feed family and every
// category already known to the rest of the build, with all three per-category
// feed URLs. A dropped or mis-spelled entry silently fails the bulk
// subscription for that stream.
const builtRecentChangesHub = 'https://taopedia.org/wiki/special/recentchanges/';
for (const ext of ['rss.xml', 'atom.xml', 'feed.json']) {
  const xmlUrl = `https://taopedia.org/wiki/special/recentchanges/${ext}`;
  assert.ok(
    hasOutlineWithUrls(builtOpml, { xmlUrl, htmlUrl: builtRecentChangesHub }),
    `dist/feeds.opml must list the Recent changes /${ext} feed with htmlUrl="${builtRecentChangesHub}"`,
  );
}
assert.ok(
  builtOpml.includes('<outline text="Recent changes" title="Recent changes">'),
  'dist/feeds.opml must group the Recent changes feeds under a dedicated outline',
);

let checked = 0;
for (const name of builtCategories) {
  const slug = String(name).replace(/ /g, '_');
  for (const ext of ['rss.xml', 'atom.xml', 'feed.json']) {
    const xmlUrl = `https://taopedia.org/wiki/category/${slug}/${ext}`;
    assert.ok(
      builtOpml.includes(`xmlUrl="${xmlUrl}"`),
      `dist/feeds.opml must list the /${ext} feed for category "${name}" (expected xmlUrl="${xmlUrl}")`,
    );
  }
  checked += 1;
}

console.log(`OPML check passed (${checked} categories with RSS/Atom/JSON feeds each)`);
