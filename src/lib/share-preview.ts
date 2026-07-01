export interface SpecialPageMeta {
  name: string;
  title: string;
  description: string;
  label: string;
}

const specialPages: SpecialPageMeta[] = [
  {
    name: 'ancientpages',
    title: 'Ancient pages',
    description: 'Published Taopedia articles ranked by oldest page-creation date.',
    label: 'Oldest-article report',
  },
  {
    name: 'allpages',
    title: 'Articles',
    description: 'Browse the full directory of Taopedia articles in the Bittensor knowledge base.',
    label: 'Article directory',
  },
  {
    name: 'categories',
    title: 'Categories',
    description: 'Browse all topics in the Taopedia Bittensor knowledge base.',
    label: 'Topic directory',
  },
  {
    name: 'mostlinkedpages',
    title: 'Most linked pages',
    description:
      'The most-referenced articles across the Taopedia Bittensor knowledge base, ranked by how many other articles link to them.',
    label: 'Reference ranking',
  },
  {
    name: 'random',
    title: 'Random article',
    description: 'Jump to a randomly selected article in the Taopedia Bittensor knowledge base.',
    label: 'Article discovery',
  },
  {
    name: 'recentchanges',
    title: 'Recent changes',
    description: 'The most recently updated articles across the Taopedia Bittensor knowledge base.',
    label: 'Recent activity',
  },
  {
    name: 'statistics',
    title: 'Statistics',
    description: 'Content statistics for the Taopedia Bittensor knowledge base.',
    label: 'Knowledge base stats',
  },
  {
    name: 'subnets',
    title: 'Subnets',
    description: 'A registry of every numbered Bittensor subnet documented on Taopedia, ordered by netuid.',
    label: 'Subnet directory',
  },
];

export function listSpecialPageMeta() {
  return specialPages;
}

export function categoryPageDescription(categoryName: string) {
  return `Taopedia articles about ${categoryName} in the Bittensor knowledge base.`;
}

export function categoryShareLabel(articleCount: number) {
  return `Topic directory · ${articleCount} article${articleCount === 1 ? '' : 's'}`;
}

export function homeShareImageHref() {
  return '/og/home.png';
}

export function articleShareImageHref(slug: string) {
  return `/og/${slug}.png`;
}

export function categoryShareImageHref(category: string) {
  return `/og/category/${category}.png`;
}

export function specialShareImageHref(name: string) {
  return `/og/special/${name}.png`;
}

export function defaultShareImageHref(pathname: string) {
  const normalizedPath = pathname.endsWith('/') ? pathname : `${pathname}/`;

  if (normalizedPath === '/') return homeShareImageHref();

  const specialMatch = normalizedPath.match(/^\/wiki\/special\/([^/]+)\/$/);
  if (specialMatch) return specialShareImageHref(specialMatch[1]);

  const categoryMatch = normalizedPath.match(/^\/wiki\/category\/([^/]+)\/$/);
  if (categoryMatch) return categoryShareImageHref(categoryMatch[1]);

  const articleMatch = normalizedPath.match(/^\/wiki\/([^/]+)(?:\/(?:backlinks|cite|history|info))?\/$/);
  if (articleMatch && articleMatch[1] !== 'special' && articleMatch[1] !== 'category') {
    return articleShareImageHref(articleMatch[1]);
  }

  return homeShareImageHref();
}
