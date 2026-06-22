export const getArticleToc = (headings = []) => {
  const visible = headings.filter((heading) => heading.depth >= 2 && heading.depth <= 4);
  if (visible.length <= 1) return [];

  return visible.map((heading, index) => ({
    number: index + 1,
    depth: heading.depth,
    slug: heading.slug,
    title: heading.text,
  }));
};

export const buildArticleToc = ({ slug, title, origin, sections = [] }) => ({
  slug,
  title,
  url: `${origin}/wiki/${slug}/`,
  count: sections.length,
  sections: sections.map((section) => ({
    number: section.number,
    depth: section.depth,
    slug: section.slug,
    title: section.title,
    url: `${origin}/wiki/${slug}/#${section.slug}`,
  })),
});
