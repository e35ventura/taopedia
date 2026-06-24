export const categoryUrlSegment = (category) => category.replace(/ /g, '_');

export const getPrimaryTopic = (categories = []) => (categories.length > 0 ? categories[0] : null);

// Visible breadcrumb trail: Home › [primary topic] › this article. The primary
// topic is the article's first category (frontmatter order), matching the
// Schema.org BreadcrumbList emitted in the page head.
export const getArticleBreadcrumbTrail = ({ title, categories = [] }) => {
  const primaryTopic = getPrimaryTopic(categories);
  const items = [{ position: 1, name: 'Home', href: '/', current: false }];
  if (primaryTopic) {
    items.push({
      position: 2,
      name: primaryTopic,
      href: `/wiki/category/${categoryUrlSegment(primaryTopic)}/`,
      current: false,
    });
  }
  items.push({
    position: items.length + 1,
    name: title,
    href: null,
    current: true,
  });
  return { primaryTopic, items };
};

export const buildArticleBreadcrumb = ({
  slug,
  title,
  origin,
  summary = '',
  categories = [],
  incomingLinks = 0,
  revisionCount = 0,
  firstEdited = null,
  lastEdited = null,
  referencesCount = 0,
  wordCount = 0,
  items = [],
  primaryTopic = null,
}) => {
  const articleUrl = `${origin}/wiki/${slug}/`;
  return {
    slug,
    title,
    summary: summary || null,
    url: articleUrl,
    breadcrumbJsonUrl: `${origin}/wiki/${slug}/breadcrumb.json`,
    tocJsonUrl: `${origin}/wiki/${slug}/toc.json`,
    infoUrl: `${origin}/wiki/${slug}/info/`,
    infoJsonUrl: `${origin}/wiki/${slug}/info.json`,
    historyUrl: `${origin}/wiki/${slug}/history/`,
    historyJsonUrl: `${origin}/wiki/${slug}/history.json`,
    backlinksUrl: `${origin}/wiki/${slug}/backlinks/`,
    backlinksJsonUrl: `${origin}/wiki/${slug}/backlinks.json`,
    citeUrl: `${origin}/wiki/${slug}/cite/`,
    citeJsonUrl: `${origin}/wiki/${slug}/cite.json`,
    bibtexUrl: `${origin}/wiki/${slug}/cite.bib`,
    referencesUrl: `${origin}/wiki/${slug}/references.json`,
    relatedUrl: `${origin}/wiki/${slug}/related.json`,
    imageUrl: `${origin}/og/${slug}.png`,
    categories,
    incomingLinks: Number.isFinite(incomingLinks) ? incomingLinks : 0,
    revisionCount: Number.isFinite(revisionCount) ? revisionCount : 0,
    firstEdited: firstEdited ?? null,
    lastEdited: lastEdited ?? null,
    referencesCount: Number.isFinite(referencesCount) ? referencesCount : 0,
    wordCount: Number.isFinite(wordCount) ? wordCount : 0,
    primaryTopic: primaryTopic ?? null,
    count: items.length,
    items: items.map((item) => ({
      position: item.position,
      name: item.name,
      path: item.href ?? `/wiki/${slug}/`,
      url:
        item.href === '/'
          ? `${origin}/`
          : item.href
            ? `${origin}${item.href}`
            : articleUrl,
      current: item.current,
    })),
  };
};
