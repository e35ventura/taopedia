const changeSummary = (change) => {
  const authorName = typeof change?.authorName === 'string' ? change.authorName.trim() : '';
  const message = typeof change?.message === 'string' ? change.message.trim() : '';
  if (authorName && message) return `Edited by ${authorName}: ${message}`;
  if (authorName) return `Edited by ${authorName}`;
  return message;
};

const recentChangeEventId = (change) => `urn:taopedia:recentchanges:${change.slug}:${change.sha}`;

export const buildRecentChangesAtomItems = ({ changes = [], origin, categoriesBySlug = {} }) =>
  changes.map((change) => ({
    id: recentChangeEventId(change),
    title: change.title,
    url: `${origin}/wiki/${change.slug}/`,
    image: `${origin}/og/${change.slug}.png`,
    description: changeSummary(change),
    categories: Array.isArray(categoriesBySlug[change.slug]) ? categoriesBySlug[change.slug] : [],
    datePublished: change.date,
    dateModified: change.date,
  }));

export const buildRecentChangesRssItems = ({ changes = [], origin, categoriesBySlug = {} }) =>
  changes.map((change) => ({
    guid: recentChangeEventId(change),
    title: change.title,
    url: `${origin}/wiki/${change.slug}/`,
    image: `${origin}/og/${change.slug}.png`,
    description: changeSummary(change),
    categories: Array.isArray(categoriesBySlug[change.slug]) ? categoriesBySlug[change.slug] : [],
    date: change.date,
  }));

export const buildRecentChangesJsonFeedItems = ({ changes = [], origin, categoriesBySlug = {} }) =>
  changes.map((change) => ({
    id: recentChangeEventId(change),
    title: change.title,
    url: `${origin}/wiki/${change.slug}/`,
    image: `${origin}/og/${change.slug}.png`,
    description: changeSummary(change),
    categories: Array.isArray(categoriesBySlug[change.slug]) ? categoriesBySlug[change.slug] : [],
    datePublished: change.date,
    dateModified: change.date,
  }));
