import { uniqueFeedCategories } from './feed-categories.js';
import { wikiArticleHref } from './wiki-article-path.js';

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
    url: wikiArticleHref(origin, change.slug),
    // sortKey pins the same-timestamp tiebreak to the article slug so the feeds
    // order identically to Special:RecentChanges (collectRecentChanges tiebreaks
    // on slug). Without it the feed builders fall back to comparing the full
    // canonical URL, which diverges for prefix-pair slugs (e.g. alpha vs
    // alpha_beta) sharing a commit timestamp.
    sortKey: change.slug,
    image: `${origin}/og/${change.slug}.png`,
    description: changeSummary(change),
    categories: uniqueFeedCategories(categoriesBySlug[change.slug]),
    datePublished: change.date,
    dateModified: change.date,
  }));

export const buildRecentChangesRssItems = ({ changes = [], origin, categoriesBySlug = {} }) =>
  changes.map((change) => ({
    guid: recentChangeEventId(change),
    title: change.title,
    url: wikiArticleHref(origin, change.slug),
    // sortKey pins the same-timestamp tiebreak to the article slug so the feeds
    // order identically to Special:RecentChanges (collectRecentChanges tiebreaks
    // on slug). Without it the feed builders fall back to comparing the full
    // canonical URL, which diverges for prefix-pair slugs (e.g. alpha vs
    // alpha_beta) sharing a commit timestamp.
    sortKey: change.slug,
    image: `${origin}/og/${change.slug}.png`,
    description: changeSummary(change),
    categories: uniqueFeedCategories(categoriesBySlug[change.slug]),
    date: change.date,
  }));

export const buildRecentChangesJsonFeedItems = ({ changes = [], origin, categoriesBySlug = {} }) =>
  changes.map((change) => ({
    id: recentChangeEventId(change),
    title: change.title,
    url: wikiArticleHref(origin, change.slug),
    // sortKey pins the same-timestamp tiebreak to the article slug so the feeds
    // order identically to Special:RecentChanges (collectRecentChanges tiebreaks
    // on slug). Without it the feed builders fall back to comparing the full
    // canonical URL, which diverges for prefix-pair slugs (e.g. alpha vs
    // alpha_beta) sharing a commit timestamp.
    sortKey: change.slug,
    image: `${origin}/og/${change.slug}.png`,
    description: changeSummary(change),
    categories: uniqueFeedCategories(categoriesBySlug[change.slug]),
    datePublished: change.date,
    dateModified: change.date,
  }));
