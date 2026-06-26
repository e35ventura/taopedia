// Pure builder: no file I/O, no side effects. Converts the pre-loaded revision
// list into the canonical JSON shape for /wiki/<slug>/history.json, mirroring
// what history.astro renders.
import { articleJsonCompanionUrls } from '../src/lib/wiki-article-path.js';

export const buildArticleHistory = ({ slug, title, origin, summary = '', categories = [], incomingLinks = 0, referencesCount = 0, sectionCount = 0, wordCount = 0, revisions = [] }) => ({
  slug,
  title,
  summary: summary || null,
  ...articleJsonCompanionUrls(origin, slug),
  imageUrl: `${origin}/og/${slug}.png`,
  // Dedupe repeated frontmatter topics so history.json cannot list the same
  // category twice when an article's YAML repeats a topic tag.
  categories: [...new Set(categories)],
  incomingLinks: Number.isFinite(incomingLinks) ? incomingLinks : 0,
  // The article's published outbound-reference count — the same figure
  // references.json exposes as `count` (via the shared getArticleReferences helper).
  referencesCount: Number.isFinite(referencesCount) ? referencesCount : 0,
  // The article's table-of-contents section count — the same figure toc.json
  // exposes as `count` (via the shared getArticleToc helper).
  sectionCount: Number.isFinite(sectionCount) ? sectionCount : 0,
  // The article's word count — the same figure the article footer exposes as
  // data-word-count (whitespace-split of the raw page body).
  wordCount: Number.isFinite(wordCount) ? wordCount : 0,
  // Estimated reading time in minutes — the same ~200 wpm ceil formula the
  // article-page footer ("N min read") and info.json expose from wordCount.
  readingMinutes: Math.max(1, Math.ceil((Number.isFinite(wordCount) ? wordCount : 0) / 200)),
  revisionCount: revisions.length,
  firstEdited: revisions.length > 0 ? revisions[revisions.length - 1].date : null,
  lastEdited: revisions.length > 0 ? revisions[0].date : null,
  revisions: revisions.map((r) => ({
    sha: r.sha,
    date: r.date,
    authorName: r.authorName,
    message: r.message ?? '',
  })),
});
