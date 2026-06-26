import { articleJsonCompanionUrls, wikiArticleHref } from './wiki-article-path.js';

export const getArticleToc = (headings = []) => {
  const visible = headings.filter((heading) => heading.depth >= 2 && heading.depth <= 4);
  if (visible.length <= 1) return [];

  return visible.map((heading, index) => {
    const hasSubsections = index < visible.length - 1 && visible[index + 1].depth > heading.depth;
    const isSubsection = heading.depth > 2;

    return {
      number: index + 1,
      depth: heading.depth,
      slug: heading.slug,
      title: heading.text,
      hasSubsections,
      isSubsection,
      indent: heading.depth === 2 ? 0 : (heading.depth - 2) * 16,
    };
  });
};

export const buildArticleToc = ({ slug, title, origin, summary = '', categories = [], incomingLinks = 0, revisionCount = 0, firstEdited = null, lastEdited = null, referencesCount = 0, wordCount = 0, sections = [] }) => ({
  slug,
  title,
  summary: summary || null,
  ...articleJsonCompanionUrls(origin, slug),
  imageUrl: `${origin}/og/${slug}.png`,
  // Dedupe repeated frontmatter topics so toc.json cannot list the same category twice.
  categories: [...new Set(categories)],
  incomingLinks: Number.isFinite(incomingLinks) ? incomingLinks : 0,
  revisionCount: Number.isFinite(revisionCount) ? revisionCount : 0,
  firstEdited: firstEdited ?? null,
  lastEdited: lastEdited ?? null,
  // The article's published outbound-reference count — the same figure
  // history.json and references.json expose (via the shared getArticleReferences helper).
  referencesCount: Number.isFinite(referencesCount) ? referencesCount : 0,
  // The article body's word count — the same figure info.json / history.json /
  // cite.json expose and the article footer renders (data-word-count).
  wordCount: Number.isFinite(wordCount) ? wordCount : 0,
  // Estimated reading time in minutes — the same ~200 wpm ceil formula the
  // article-page footer ("N min read") and info.json expose from wordCount.
  readingMinutes: Math.max(1, Math.ceil((Number.isFinite(wordCount) ? wordCount : 0) / 200)),
  // The article's table-of-contents section count — the same figure info.json
  // and history.json expose as sectionCount (here also available as `count`).
  sectionCount: sections.length,
  count: sections.length,
  sections: sections.map((section) => ({
    number: section.number,
    depth: section.depth,
    slug: section.slug,
    title: section.title,
    url: `${wikiArticleHref(origin, slug)}#${section.slug}`,
  })),
});
