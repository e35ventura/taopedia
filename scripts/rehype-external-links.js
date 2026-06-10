/*
  Rehype plugin: make external article links safe and open in a new tab.

  Article bodies link out to many external references (docs, explorers, etc.).
  By default Markdown renders them as same-tab `<a href>` with no `rel`, so
  following one silently leaves the wiki, and adding `target="_blank"` without a
  safe `rel` would expose `window.opener` (reverse tabnabbing) and leak the
  reader's URL via the Referer header.

  This gives genuinely-external links the standard wiki treatment: open in a new
  tab with `rel="noopener noreferrer"`. Internal (taopedia.org and its
  subdomains), relative, in-page anchor, and non-http(s) links (mailto:, tel:,
  …) are left untouched. No dependency — the hast tree is walked directly.
*/

const SITE_HOSTNAME = 'taopedia.org';

export function isExternalHref(href) {
  if (typeof href !== 'string') return false;
  const value = href.trim();
  let url;
  try {
    url = value.startsWith('//') ? new URL(`https:${value}`) : new URL(value);
  } catch {
    return false; // relative path, in-page anchor (#…), or otherwise not absolute
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return host !== SITE_HOSTNAME && !host.endsWith(`.${SITE_HOSTNAME}`);
}

function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (
    node.type === 'element' &&
    node.tagName === 'a' &&
    node.properties &&
    isExternalHref(node.properties.href)
  ) {
    node.properties.target = '_blank';
    // hast renders the `rel` array as a space-separated attribute value.
    node.properties.rel = ['noopener', 'noreferrer'];
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) visit(child);
  }
}

export default function rehypeExternalLinks() {
  return (tree) => {
    visit(tree);
  };
}
