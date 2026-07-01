import type { APIRoute } from 'astro';
import { listAncientPages } from '../../../lib/ancient-pages-context';
import { articleJsonCompanionUrls } from '../../../lib/wiki-article-path.js';

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://taopedia.org')).origin;
  const ancientPages = listAncientPages();

  const body = JSON.stringify(
    {
      site: origin,
      ancientpagesJsonUrl: `${origin}/wiki/special/ancientpages.json`,
      count: ancientPages.length,
      pages: ancientPages.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        ...articleJsonCompanionUrls(origin, entry.slug),
        imageUrl: `${origin}/og/${entry.slug}.png`,
        revisionCount: entry.revisionCount,
        firstEdited: entry.firstEdited,
        lastEdited: entry.lastEdited,
      })),
    },
    null,
    2,
  );

  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
