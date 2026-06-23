export const getArticleToc = (headings = []) => {
  const visible = headings.filter((heading) => heading.depth >= 2 && heading.depth <= 4);
  if (visible.length <= 1) return [];

  return visible.map((heading, index) => {
    const hasSubsections = index < visible.length - 1 && visible[index + 1].depth > heading.depth;
    const isSubsection = heading.depth > 2;

    return {
      number: index + 1,
      depth: heading.depth,
      slug: heading.slug,
      title: heading.text,
      hasSubsections,
      isSubsection,
      indent: heading.depth === 2 ? 0 : (heading.depth - 2) * 16,
    };
  });
};

export const buildArticleToc = ({ slug, title, origin, sections = [] }) => ({
  slug,
  title,
  url: `${origin}/wiki/${slug}/`,
  tocJsonUrl: `${origin}/wiki/${slug}/toc.json`,
  infoUrl: `${origin}/wiki/${slug}/info/`,
  infoJsonUrl: `${origin}/wiki/${slug}/info.json`,
  count: sections.length,
  sections: sections.map((section) => ({
    number: section.number,
    depth: section.depth,
    slug: section.slug,
    title: section.title,
    url: `${origin}/wiki/${slug}/#${section.slug}`,
  })),
});
