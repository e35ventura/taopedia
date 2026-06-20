import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpml } from './opml.js';

// /feeds.opml is the OPML 2.0 subscription index: a single file a reader
// imports into a feed reader (Feedly, Inoreader, Reeder, NetNewsWire) to
// bulk-subscribe to every site-wide and per-category feed at once. The XML
// contract is small but load-bearing — a malformed OPML silently fails to
// import in every reader, and a missing or wrong xmlUrl silently drops a feed
// from the bulk subscription. This check guards both:
//   1) Unit-tests buildOpml with constructed inputs (catches builder regressions
//      before the site is rendered).
//   2) Parses the built dist/feeds.opml and cross-references it against
//      public/data/categories.json so a wiring regression (missing endpoint,
//      divergent slug convention, dropped category) fails the build.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

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
  // OPML 2.0 lists <docs> (absolute URL to the OPML spec) as a recommended
  // <head> child so consumers can resolve the spec version. The value must be
  // an absolute http(s) URL pointing at the canonical OPML 2.0 specification.
  const docsMatch = opml.match(/<docs>([^<]+)<\/docs>/);
  assert.ok(docsMatch, '<head> must contain an OPML 2.0 <docs> element (absolute URL to the OPML spec) so consumers can resolve the spec version');
  assert.match(
    docsMatch[1],
    /^https?:\/\//,
    `<docs> must be an absolute http(s) URL, got ${docsMatch[1]}`,
  );
  // OPML 2.0 lists <dateModified> (RFC 822) as a <head> child so feed readers
  // can tell when the index was last refreshed. The emitted value must parse
  // as a real instant (Date.parse accepts the toUTCString RFC 822 output).
  const dateModifiedMatch = opml.match(/<dateModified>([^<]+)<\/dateModified>/);
  assert.ok(dateModifiedMatch, '<head> must contain an OPML 2.0 <dateModified> element so readers can tell when the index was last refreshed');
  assert.ok(
    !Number.isNaN(Date.parse(dateModifiedMatch[1])),
    `<dateModified> must be a valid RFC 822 date, got ${dateModifiedMatch[1]}`,
  );

  // Site-wide feeds: RSS, Atom, JSON Feed — one outline each, with xmlUrl
  // pointing at the canonical site-wide route and htmlUrl at the homepage.
  assert.match(opml, /xmlUrl="https:\/\/taopedia\.org\/rss\.xml"/, 'must list the site-wide RSS feed');
  assert.match(opml, /xmlUrl="https:\/\/taopedia\.org\/atom\.xml"/, 'must list the site-wide Atom feed');
  assert.match(opml, /xmlUrl="https:\/\/taopedia\.org\/feed\.json"/, 'must list the site-wide JSON Feed feed');

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

// The built endpoint must contain every category already known to the rest of
// the build, with all three per-category feed URLs. A dropped or mis-spelled
// category silently fails the bulk subscription for that topic.
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
