import { compareTitles } from './title-sort.js';
import { articleJsonCompanionUrls } from './wiki-article-path.js';

export const getArticleReferences = ({ slug, linkGraph = {}, titleBySlug = {} }) => {
  const links = Array.isArray(linkGraph[slug]) ? linkGraph[slug] : [];
  const seen = new Set();
  const references = [];

  for (const link of links) {
    const target = typeof link?.target === 'string' ? link.target : '';
    if (!target || target === slug || !titleBySlug[target] || seen.has(target)) continue;

    seen.add(target);
    references.push({ slug: target, title: titleBySlug[target] });
  }

  // Same-title tiebreak must match sortPagesByTitle / getCategoryArticles: compareTitles
  // on the title, then a PLAIN code-unit comparison of the slug — NOT compareTitles
  // on the slug, whose numeric collation would order subnet_9 before subnet_10 while
  // the HTML listings (raw id order) put subnet_10 first.
  return references.sort(
    (a, b) => compareTitles(a.title, b.title) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
};

export const buildArticleReferences = ({ slug, title, origin, summary = '', categories = [], incomingLinks = 0, referencesCount = 0, revisionCount = 0, firstEdited = null, lastEdited = null, sectionCount = 0, wordCount = 0, references = [] }) => ({
  slug,
  title,
  summary: summary || null,
  ...articleJsonCompanionUrls(origin, slug),
  imageUrl: `${origin}/og/${slug}.png`,
  // Dedupe repeated frontmatter topics on the envelope and each reference entry.
  categories: [...new Set(categories)],
  // The article's own published inbound-link count — the same figure info.json /
  // history.json / cite.json expose on their envelopes (via the shared helper).
  incomingLinks,
  // The article's published outbound reference count — the same figure
  // info.json / history.json / cite.json / backlinks.json / related.json expose.
  referencesCount: Number.isFinite(referencesCount) ? referencesCount : 0,
  // The article's revision count (its commit-history length) — the same figure
  // info.json / history.json / cite.json expose on their envelopes.
  revisionCount: Number.isFinite(revisionCount) ? revisionCount : 0,
  // The article's first/last revision dates (history is newest-first) — the same
  // firstEdited/lastEdited pair info.json and history.json expose.
  firstEdited: firstEdited ?? null,
  lastEdited: lastEdited ?? null,
  // The article's rendered table-of-contents section total — the same count
  // toc.json exposes for this article.
  sectionCount: Number.isFinite(sectionCount) ? sectionCount : 0,
  // The article body's word count — the same figure info.json / history.json
  // expose and the article-page footer (mw-article-meta data-word-count) renders.
  wordCount: Number.isFinite(wordCount) ? wordCount : 0,
  // The ~200-wpm reading-time estimate derived from wordCount — the same figure
  // info.json / history.json / cite.json / toc.json expose and the article-page
  // footer ("N min read") renders.
  readingMinutes: Math.max(1, Math.ceil((Number.isFinite(wordCount) ? wordCount : 0) / 200)),
  count: references.length,
  references: references.map((link) => ({
    slug: link.slug,
    title: link.title,
    summary: link.summary || null,
    categories: Array.isArray(link.categories) ? [...new Set(link.categories)] : [],
    backlinks: Number.isFinite(link.backlinks) ? link.backlinks : 0,
    // info.json names this figure incomingLinks; keep backlinks for the field
    // name the HTML listing endpoints (allpages/subnets/category) expose.
    incomingLinks: Number.isFinite(link.backlinks) ? link.backlinks : 0,
    // The referenced article's published outbound-reference count — the same
    // figure its own history.json / cite.json / info.json / references.json
    // envelope exposes, so consumers can compare both inbound and outbound link
    // totals across the referenced set without a second fetch.
    referencesCount: Number.isFinite(link.referencesCount) ? link.referencesCount : 0,
    // The referenced article's table-of-contents section count — the same figure
    // its own toc.json / info.json expose and allpages.json / subnets.json
    // expose per directory entry.
    sectionCount: Number.isFinite(link.sectionCount) ? link.sectionCount : 0,
    // The referenced article's body word count — the same figure info.json /
    // history.json expose and allpages.json / subnets.json expose per entry.
    wordCount: Number.isFinite(link.wordCount) ? link.wordCount : 0,
    // The referenced article's ~200-wpm reading-time estimate derived from
    // wordCount — the same figure info.json / allpages.json / subnets.json expose.
    readingMinutes: Math.max(1, Math.ceil((Number.isFinite(link.wordCount) ? link.wordCount : 0) / 200)),
    // The referenced article's revision-history summary — the same trio
    // info.json and history.json expose per article.
    revisionCount: Number.isFinite(link.revisionCount) ? link.revisionCount : 0,
    firstEdited: link.firstEdited ?? null,
    lastEdited: link.lastEdited ?? null,
    ...articleJsonCompanionUrls(origin, link.slug),
    imageUrl: `${origin}/og/${link.slug}.png`,
  })),
});
