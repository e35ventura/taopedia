const changeSummary = (change) => {
  const authorName = typeof change?.authorName === 'string' ? change.authorName.trim() : '';
  const message = typeof change?.message === 'string' ? change.message.trim() : '';
  if (authorName && message) return `Edited by ${authorName}: ${message}`;
  if (authorName) return `Edited by ${authorName}`;
  return message;
};

export const buildRecentChangesAtomItems = ({ changes = [], origin }) =>
  changes.map((change) => ({
    id: `urn:sha1:${change.sha}`,
    title: change.title,
    url: `${origin}/wiki/${change.slug}/`,
    image: `${origin}/og/${change.slug}.png`,
    description: changeSummary(change),
    datePublished: change.date,
    dateModified: change.date,
  }));
