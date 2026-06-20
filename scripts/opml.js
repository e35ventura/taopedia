// Build the OPML 2.0 subscription index served at /feeds.opml. Kept as a pure
// function beside rss-feed.js / atom-feed.js / json-feed.js so the Astro
// endpoint and the regression check share one source of truth without
// rendering the site.
//
// OPML 2.0 (http://opml.org/spec2.opml) is the standard import/export format
// used by feed readers (Feedly, Inoreader, Reeder, NetNewsWire, etc.) for bulk
// subscription. A reader who wants to follow every Taopedia topic feed in one
// action imports this file instead of subscribing to each of the 100+ feed
// URLs individually. The index lists the three site-wide feeds (RSS, Atom,
// JSON Feed) and one nested group per category, each carrying that category's
// three feeds. Per-category feed URLs mirror the routes already built by
// src/pages/wiki/category/[category]/{rss.xml,atom.xml,feed.json}.ts and use
// the same space-to-underscore slug convention as the category hub.

import { compareTitles } from '../src/lib/title-sort.js';

const SITE_NAME = 'Taopedia';
const SITE_DESCRIPTION = 'Taopedia — a Bittensor knowledge base. Subscribe to site-wide and per-topic feeds.';

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
    { type: 'atom', label: `${siteName} (Atom)`, xmlUrl: `${root}/atom.xml` },
    { type: 'json', label: `${siteName} (JSON Feed)`, xmlUrl: `${root}/feed.json` },
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
          { type: 'atom', label: `${name} (Atom)`, xmlUrl: `${root}/wiki/category/${catPath}/atom.xml` },
          { type: 'json', label: `${name} (JSON Feed)`, xmlUrl: `${root}/wiki/category/${catPath}/feed.json` },
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

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<opml version="2.0">\n' +
    '  <head>\n' +
    `    <title>${escapeXml(siteName)} feeds</title>\n` +
    `    <ownerName>${escapeXml(siteName)}</ownerName>\n` +
    // OPML 2.0 lists <docs> (an absolute URL to the OPML specification) as a
    // <head> child so consumers can resolve what version of the format the
    // document follows. Omitting it leaves readers guessing the spec from
    // <opml version="2.0"> alone. http://opml.org/spec2.opml is the canonical
    // OPML 2.0 spec URL.
    `    <docs>${escapeXml('http://opml.org/spec2.opml')}</docs>\n` +
    // OPML 2.0 lists <dateModified> (RFC 822) as a <head> child so readers can
    // tell when the index was last refreshed; without it staleness tracking and
    // cache revalidation have no anchor. Date#toUTCString emits the same
    // RFC 822 / RFC 7231 IMF-fixdate format the spec example uses.
    `    <dateModified>${escapeXml(now.toUTCString())}</dateModified>\n` +
    `    <description>${escapeXml(description)}</description>\n` +
    '  </head>\n' +
    '  <body>\n' +
    `    <outline text="${escapeXml(siteName)}" title="${escapeXml(siteName)}">\n` +
    `${siteOutlines}\n` +
    `${categoriesBlock}\n` +
    '    </outline>\n' +
    '  </body>\n' +
    '</opml>\n'
  );
}
