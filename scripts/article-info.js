const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

export const buildArticleInfo = ({
  title,
  slug,
  origin,
  categories = [],
  incomingLinks = 0,
  revisionCount = 0,
  firstEdited = null,
  lastEdited = null,
}) => {
  const canonicalOrigin = trimTrailingSlash(origin || 'https://taopedia.org');

  return {
    title,
    slug,
    url: `${canonicalOrigin}/wiki/${slug}/`,
    categories,
    incomingLinks,
    backlinksUrl: `${canonicalOrigin}/wiki/${slug}/backlinks/`,
    revisionCount,
    historyUrl: `${canonicalOrigin}/wiki/${slug}/history/`,
    firstEdited: firstEdited ?? null,
    lastEdited: lastEdited ?? null,
  };
};
