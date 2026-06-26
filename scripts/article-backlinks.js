// Pure builder: no file I/O, no side effects. Converts the pre-joined and
// pre-sorted backlinks list into the canonical JSON shape for
// /wiki/<slug>/backlinks.json, mirroring what backlinks.astro renders.

import { compareTitles } from '../src/lib/title-sort.js';
import { articleJsonCompanionUrls } from '../src/lib/wiki-article-path.js';

// Title sort, then raw slug code-unit order when titles tie — the same rule
// references.json (#1487) and most-linked (#1546) use, NOT compareTitles on slug.
export function sortInboundBacklinkEntries(entries) {
  return [...entries].sort(
    (a, b) =>
      compareTitles(a.title, b.title) ||
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
}

export const buildArticleBacklinks = ({ slug, title, origin, summary = '', categories = [], incomingLinks = 0, referencesCount = 0, sectionCount = 0, wordCount = 0, revisionCount = 0, firstEdited = null, lastEdited = null, backlinks = [] }) => ({
  slug,
  title,
  summary: summary || null,
  ...articleJsonCompanionUrls(origin, slug),
  imageUrl: `${origin}/og/${slug}.png`,
  // Dedupe repeated frontmatter topics on the envelope and each linking entry.
  categories: [...new Set(categories)],
  // The article's own published inbound-link count — the same figure info.json
  // exposes (count here equals backlinks.length, the listed linking pages).
  incomingLinks: Number.isFinite(incomingLinks) ? incomingLinks : 0,
  // The article's published OUTBOUND reference count — the complement of
  // incomingLinks, the same figure info.json / history.json / cite.json /
  // related.json expose on their envelopes.
  referencesCount: Number.isFinite(referencesCount) ? referencesCount : 0,
  // The article's table-of-contents section count — the same figure toc.json
  // exposes as `count` (via the shared getArticleToc helper).
  sectionCount: Number.isFinite(sectionCount) ? sectionCount : 0,
  // The article body's word count — the same figure info.json / history.json
  // expose and the article-page footer (mw-article-meta data-word-count) renders.
  wordCount: Number.isFinite(wordCount) ? wordCount : 0,
  // Estimated reading time in minutes — the same ~200 wpm ceil formula
  // info.json exposes and the article-page footer ("N min read") renders
  // from wordCount.
  readingMinutes: Math.max(1, Math.ceil((Number.isFinite(wordCount) ? wordCount : 0) / 200)),
  // The article's revision count (its commit-history length) — the same figure
  // info.json / history.json / cite.json expose on their envelopes.
  revisionCount: Number.isFinite(revisionCount) ? revisionCount : 0,
  // The article's first/last revision dates (history is newest-first) — the same
  // firstEdited/lastEdited pair info.json and history.json expose.
  firstEdited: firstEdited ?? null,
  lastEdited: lastEdited ?? null,
  count: backlinks.length,
  backlinks: backlinks.map((link) => ({
    slug: link.slug,
    title: link.title,
    summary: link.summary || null,
    categories: Array.isArray(link.categories) ? [...new Set(link.categories)] : [],
    backlinks: Number.isFinite(link.backlinks) ? link.backlinks : 0,
    // info.json names this same published inbound-link figure incomingLinks; keep
    // backlinks for field-name compatibility and expose incomingLinks too, the
    // per-entry alias related.json / references.json / allpages.json carry.
    incomingLinks: Number.isFinite(link.backlinks) ? link.backlinks : 0,
    // The linking article's published OUTBOUND reference count — the inbound
    // complement of backlinks, the same per-entry referencesCount allpages.json
    // and subnets.json expose for each directory entry.
    referencesCount: Number.isFinite(link.referencesCount) ? link.referencesCount : 0,
    // The linking article's table-of-contents section count — the same figure its
    // own toc.json / info.json expose and allpages.json / subnets.json expose per entry.
    sectionCount: Number.isFinite(link.sectionCount) ? link.sectionCount : 0,
    // The linking article's body word count — the same figure info.json /
    // history.json expose and allpages.json / subnets.json expose per entry.
    wordCount: Number.isFinite(link.wordCount) ? link.wordCount : 0,
    // The linking article's ~200-wpm reading-time estimate derived from wordCount —
    // the same figure info.json / allpages.json / subnets.json expose.
    readingMinutes: Math.max(1, Math.ceil((Number.isFinite(link.wordCount) ? link.wordCount : 0) / 200)),
    // The linking article's revision-history summary — the same trio info.json
    // and history.json expose per article, so a consumer scanning the backlink
    // list can gauge each linking page's age and edit activity without a fetch.
    revisionCount: Number.isFinite(link.revisionCount) ? link.revisionCount : 0,
    firstEdited: link.firstEdited ?? null,
    lastEdited: link.lastEdited ?? null,
    ...articleJsonCompanionUrls(origin, link.slug),
    imageUrl: `${origin}/og/${link.slug}.png`,
  })),
});
