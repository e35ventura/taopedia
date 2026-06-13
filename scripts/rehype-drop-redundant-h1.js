/*
  Rehype plugin: drop an article body's redundant leading <h1>.

  Each article page already renders its title once as the page's
  <h1 class="firstHeading"> (from frontmatter) — exactly like MediaWiki, where
  the page title is the sole <h1> and body section headings start at <h2>. But
  most article sources also open their Markdown body with a top-level "# Title"
  heading, so the rendered page shows the title as an <h1> twice: a duplicate
  top-level heading that screen readers announce twice, that breaks the single
  document outline (an accessibility/SEO defect), and that visibly repeats the
  title as a large heading right below the summary.

  This removes the body's leading <h1> so the title appears once. To stay
  precise it only acts on the FIRST heading in document order, and only when
  that heading is an <h1>: a leading <h2>+ is a normal section heading and is
  left untouched, as is any <h1> that appears after another heading. The
  layout's firstHeading is added outside Markdown and is never affected.
  No dependency — the hast tree is walked directly, like rehype-external-links.
*/

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

// Remove the redundant leading <h1>. Returns true if one was dropped.
export function dropRedundantLeadingH1(tree) {
  let done = false;
  let dropped = false;

  function walk(node) {
    if (done || !node || !Array.isArray(node.children)) return;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child && child.type === 'element' && HEADING_TAGS.has(child.tagName)) {
        // First heading in the document. Only a leading <h1> duplicates the
        // page title; remove it. Any other first heading is a real section.
        if (child.tagName === 'h1') {
          node.children.splice(i, 1);
          dropped = true;
        }
        done = true;
        return;
      }
      walk(child);
      if (done) return;
    }
  }

  walk(tree);
  return dropped;
}

export default function rehypeDropRedundantH1() {
  return (tree) => {
    dropRedundantLeadingH1(tree);
  };
}
