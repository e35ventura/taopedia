import { publishedTitleBySlug } from './article-metadata';
import { buildWantedPages } from '../../scripts/wanted-pages.js';

const linkgraphModules = import.meta.glob('../../public/data/linkgraph.json', { eager: true }) as Record<
  string,
  { default?: Record<string, Array<{ target: string }>> }
>;
const linkgraphData = Object.values(linkgraphModules)[0]?.default ?? {};
const titleBySlug = publishedTitleBySlug();
const wantedPages = buildWantedPages({ linkGraph: linkgraphData, titleBySlug });

export function listWantedPages() {
  return wantedPages;
}

export function wantedPageTitleBySlug() {
  return titleBySlug;
}
