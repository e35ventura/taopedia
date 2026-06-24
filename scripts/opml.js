// Build the OPML 2.0 subscription index served at /feeds.opml. Kept as a pure
// function beside rss-feed.js / atom-feed.js / json-feed.js so the Astro
// endpoint and the regression check share one source of truth without
// rendering the site.
//
// OPML 2.0 (http://opml.org/spec2.opml) is the standard import/export format
// used by feed readers (Feedly, Inoreader, Reeder, NetNewsWire, etc.) for bulk
// subscription. A reader who wants to follow Taopedia's site-wide article
// stream, the site-wide Recent changes stream, and every per-topic feed in one
// action imports this file instead of subscribing to each feed URL
// individually. The index lists the three site-wide feeds (RSS, Atom, JSON
// Feed), a Recent changes group with its three companion feeds, and one nested
// group per category, each carrying that category's three feeds. Per-category
// feed URLs mirror the routes already built by
// src/pages/wiki/category/[category]/{rss.xml,atom.xml,feed.json}.ts and use
// the same space-to-underscore slug convention as the category hub.

import { compareTitles } from '../src/lib/title-sort.js';

const SITE_NAME = 'Taopedia';
const SITE_DESCRIPTION = 'Taopedia — a Bittensor knowledge base. Subscribe to site-wide, recent-changes, and per-topic feeds.';

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

function categorySlug(name) {
  return String(name ?? '').replace(/ /g, '_');
}

// OPML 2.0 (http://opml.org/spec2.opml) defines only type="rss" for a feed
// subscription outline ("link" and "include" are the other defined types, for
// non-feed outlines); it has no type="atom" or type="json". A subscription
// outline's actual feed format is conveyed by the document at xmlUrl, which the
// reader fetches and sniffs — that is how spec-compliant exporters list Atom and
// JSON feeds. So every feed outline here uses type="rss" and keeps the
// human-readable format in text/title (e.g. "Taopedia (Atom)"); a strict OPML 2.0
// importer would otherwise skip the undefined-type outlines.
function feedOutline({ label, type, xmlUrl, htmlUrl, indent }) {
  return `${indent}<outline type="${escapeXml(type)}" text="${escapeXml(label)}" title="${escapeXml(label)}" xmlUrl="${escapeXml(xmlUrl)}" htmlUrl="${escapeXml(htmlUrl)}" />`;
}

export function buildOpml({
  origin,
  siteName = SITE_NAME,
  description = SITE_DESCRIPTION,
  categories,
  now = new Date(),
}) {
  const root = String(origin || '').replace(/\/+$/, '');
  // Order category groups with compareTitles — the SAME numeric-collation sort
  // (locale-pinned to 'en', so still build-machine-independent) that Special:
  // Categories, Special:Statistics, and the sitemap use. The site has 100+
  // numeric-suffixed "Subnet N" categories, so raw string order would list
  // "Subnet 10" before "Subnet 2"/"Subnet 9", disagreeing with every other
  // category listing on the site.
  const sortedCategories = Array.isArray(categories)
    ? [...categories].filter(Boolean).sort(compareTitles)
    : [];

  // Site-wide feeds: RSS, Atom, JSON Feed — every page advertises these from
  // <head>, and they carry the full article corpus.
  const siteFeedDefs = [
    { type: 'rss', label: `${siteName} (RSS)`, xmlUrl: `${root}/rss.xml` },
    { type: 'rss', label: `${siteName} (Atom)`, xmlUrl: `${root}/atom.xml` },
    { type: 'rss', label: `${siteName} (JSON Feed)`, xmlUrl: `${root}/feed.json` },
  ];
  const siteOutlines = siteFeedDefs
    .map((f) =>
      feedOutline({
        label: f.label,
        type: f.type,
        xmlUrl: f.xmlUrl,
        htmlUrl: `${root}/`,
        indent: '      ',
      }),
    )
    .join('\n');

  // Recent changes already ships three page-scoped companion feeds with the
  // same discovery contract as categories. Include them here so an OPML import
  // surfaces the site-wide editorial stream alongside the full-corpus feeds.
  const recentChangesHub = `${root}/wiki/special/recentchanges/`;
  const recentChangesBlock = `      <outline text="Recent changes" title="Recent changes">\n${[
    { type: 'rss', label: 'Recent changes (RSS)', xmlUrl: `${root}/wiki/special/recentchanges/rss.xml` },
    { type: 'rss', label: 'Recent changes (Atom)', xmlUrl: `${root}/wiki/special/recentchanges/atom.xml` },
    { type: 'rss', label: 'Recent changes (JSON Feed)', xmlUrl: `${root}/wiki/special/recentchanges/feed.json` },
  ]
    .map((f) =>
      feedOutline({
        label: f.label,
        type: f.type,
        xmlUrl: f.xmlUrl,
        htmlUrl: recentChangesHub,
        indent: '        ',
      }),
    )
    .join('\n')}\n      </outline>`;

  // One nested outline per category, each carrying its three per-category
  // feeds. The href/slug derivation mirrors wiki/category/[category].astro
  // and the per-category feed routes so every xmlUrl resolves to a built file.
  let categoriesBlock = '';
  if (sortedCategories.length > 0) {
    const inner = sortedCategories
      .map((name) => {
        const catPath = categorySlug(name);
        const hub = `${root}/wiki/category/${catPath}/`;
        const entries = [
          { type: 'rss', label: `${name} (RSS)`, xmlUrl: `${root}/wiki/category/${catPath}/rss.xml` },
          { type: 'rss', label: `${name} (Atom)`, xmlUrl: `${root}/wiki/category/${catPath}/atom.xml` },
          { type: 'rss', label: `${name} (JSON Feed)`, xmlUrl: `${root}/wiki/category/${catPath}/feed.json` },
        ]
          .map((f) =>
            feedOutline({ label: f.label, type: f.type, xmlUrl: f.xmlUrl, htmlUrl: hub, indent: '          ' }),
          )
          .join('\n');
        return `        <outline text="${escapeXml(name)}" title="${escapeXml(name)}">\n${entries}\n        </outline>`;
      })
      .join('\n');
    categoriesBlock = `      <outline text="Categories" title="Categories">\n${inner}\n      </outline>`;
  }

  const rootChildren = [siteOutlines, recentChangesBlock, categoriesBlock]
    .filter(Boolean)
    .join('\n');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<opml version="2.0">\n' +
    '  <head>\n' +
    `    <title>${escapeXml(siteName)} feeds</title>\n` +
    `    <ownerName>${escapeXml(siteName)}</ownerName>\n` +
    // OPML 2.0 lists <dateModified> (RFC 822) as a <head> child so readers can
    // tell when the index was last refreshed; without it staleness tracking and
    // cache revalidation have no anchor. Date#toUTCString emits the same
    // RFC 822 / RFC 7231 IMF-fixdate format the spec example uses.
    `    <dateModified>${escapeXml(now.toUTCString())}</dateModified>\n` +
    `    <description>${escapeXml(description)}</description>\n` +
    '  </head>\n' +
    '  <body>\n' +
    `    <outline text="${escapeXml(siteName)}" title="${escapeXml(siteName)}">\n` +
    `${rootChildren}\n` +
    '    </outline>\n' +
    '  </body>\n' +
    '</opml>\n'
  );
}
