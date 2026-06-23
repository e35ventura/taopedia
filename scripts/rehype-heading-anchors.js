/*
  Rehype plugin: add a copyable "permalink" anchor to each section heading.

  Section headings (h2–h6) in an article body already carry an id — Astro
  generates one per heading, used by the table of contents and the
  scroll-margin-top offset for the fixed header. This appends a small anchor link
  to each such heading pointing at the heading's own id, so a reader can click it
  to copy a deep link to that section — the same affordance MediaWiki and most
  docs sites offer. The visible glyph is decorative (aria-hidden) and the link
  carries an accessible name ("Permalink to <heading>").

  Only headings that already have an id are touched (so the link target is real);
  the page title's <h1 class="firstHeading"> is added by the layout outside
  Markdown and is never in this tree; and the anchor is idempotent (a heading
  already carrying one is skipped). No dependency — the hast tree is walked
  directly, like rehype-drop-redundant-h1.
*/

const SECTION_HEADINGS = new Set(['h2', 'h3', 'h4', 'h5', 'h6']);
const ANCHOR_CLASS = 'mw-heading-anchor';

function textContent(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  if (Array.isArray(node.children)) return node.children.map(textContent).join('');
  return '';
}

function hasAnchorChild(heading) {
  return (heading.children || []).some(
    (child) =>
      child &&
      child.type === 'element' &&
      child.tagName === 'a' &&
      [].concat(child.properties?.className || []).includes(ANCHOR_CLASS),
  );
}

// Append a permalink anchor to every section heading that has an id. Returns the
// number of anchors added. Exported for the regression check.
export function addHeadingAnchors(tree) {
  let added = 0;

  function walk(node) {
    if (!node || !Array.isArray(node.children)) return;
    for (const child of node.children) {
      if (child && child.type === 'element' && SECTION_HEADINGS.has(child.tagName)) {
        const id = child.properties && child.properties.id;
        if (typeof id === 'string' && id && !hasAnchorChild(child)) {
          const label = textContent(child).trim();
          if (!Array.isArray(child.children)) child.children = [];
          child.children.push({
            type: 'element',
            tagName: 'a',
            properties: {
              className: [ANCHOR_CLASS],
              href: `#${id}`,
              'aria-label': label ? `Permalink to “${label}”` : 'Permalink to this section',
              // Belt-and-suspenders: also keep the anchor out of the Pagefind index.
              'data-pagefind-ignore': '',
            },
            // The visible "¶" glyph is a CSS ::before on .mw-heading-anchor, not a
            // text node — so it never enters the DOM text, keeping it out of the
            // table of contents, the search index, and any heading-text consumer
            // regardless of plugin ordering. The link's accessible name comes from
            // aria-label, so the empty body is fine.
            children: [],
          });
          added += 1;
        }
        // A heading's own descendants are never section headings; skip them.
        continue;
      }
      walk(child);
    }
  }

  walk(tree);
  return added;
}

export default function rehypeHeadingAnchors() {
  return (tree) => {
    addHeadingAnchors(tree);
  };
}
