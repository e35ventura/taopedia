import { historyForSlug, revisionStatsFromHistory } from './article-history';
import { publishedTitleBySlug } from './article-metadata';
import { buildAncientPages } from '../../scripts/ancient-pages.js';

const titleBySlug = publishedTitleBySlug();
const revisionStatsBySlug = Object.fromEntries(
  Object.keys(titleBySlug).map((slug) => [slug, revisionStatsFromHistory(historyForSlug(slug))]),
);
const ancientPages = buildAncientPages({ titleBySlug, revisionStatsBySlug });

export function listAncientPages() {
  return ancientPages;
}
