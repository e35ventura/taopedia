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
  historyUrl: `${origin}/wiki/${slug}/history/`,
  historyJsonUrl: `${origin}/wiki/${slug}/history.json`,
  backlinksUrl: `${origin}/wiki/${slug}/backlinks/`,
  backlinksJsonUrl: `${origin}/wiki/${slug}/backlinks.json`,
  citeUrl: `${origin}/wiki/${slug}/cite/`,
  citeJsonUrl: `${origin}/wiki/${slug}/cite.json`,
  bibtexUrl: `${origin}/wiki/${slug}/cite.bib`,
  referencesUrl: `${origin}/wiki/${slug}/references.json`,
  relatedUrl: `${origin}/wiki/${slug}/related.json`,
  imageUrl: `${origin}/og/${slug}.png`,
  count: sections.length,
  sections: sections.map((section) => ({
    number: section.number,
    depth: section.depth,
    slug: section.slug,
    title: section.title,
    url: `${origin}/wiki/${slug}/#${section.slug}`,
  })),
});
