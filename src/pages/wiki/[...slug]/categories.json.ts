import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPageSlug } from '../../../lib/article-history';
import { compareTitles } from '../../../lib/title-sort.js';

// Machine-readable per-article category membership at /wiki/<slug>/categories.json.
// Lists every category the article belongs to, sorted alphabetically by name, as
// structured JSON for programmatic consumers. This exposes the reverse direction of
// the per-category article list (/wiki/category/<category>/articles.json): given
// an article slug, callers can discover all the category hubs it belongs to
// without walking the full categories.json index. Each category entry carries the
// human-readable name and the canonical hub URL so the response is self-contained
// for feed aggregators, dashboards, and cross-linking tools.

const slugmapModules = import.meta.glob('../../../../public/data/slugmap.json', { eager: true }) as Record<
  string,
  { default?: Record<string, { title?: string; categories?: string[]; summary?: string }> }
>;

const slugMap = Object.values(slugmapModules)[0]?.default ?? {};

const categorySlug = (categoryName: string) => categoryName.replace(/ /g, '_');

export async function getStaticPaths() {
  const pages = await getCollection('pages');
  return pages.map((page) => {
    const slug = getPageSlug(page);
    const meta = slugMap[slug] ?? {};
    const rawCategories = Array.isArray(meta.categories) ? meta.categories : [];
    // Deduplicate and sort alphabetically with numeric collation so
    // "Subnet 9: Pre-training" sorts before "Subnet 10: Sturdy".
    const categories = [...new Set(rawCategories)].sort(compareTitles);
    return {
      params: { slug },
      props: { slug, title: page.data.title, categories },
    };
  });
}

export const GET: APIRoute = async ({ props, site }) => {
  const { slug, title, categories } = props as {
    slug: string;
    title: string;
    categories: string[];
  };
  const origin = (site ?? new URL('https://taopedia.org')).origin;

  const body = JSON.stringify(
    {
      site: origin,
      slug,
      title,
      url: `${origin}/wiki/${slug}/`,
      count: categories.length,
      categories: categories.map((name) => ({
        name,
        url: `${origin}/wiki/category/${categorySlug(name)}/`,
      })),
    },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
