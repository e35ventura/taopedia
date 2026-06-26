// Parse canonical /wiki/<slug>/ article hrefs into route slugs, including
// nested multi-segment slugs (e.g. /wiki/alpha_tokens/notes/ -> alpha_tokens/notes).
// Several post-build regression checks previously used href.split('/')[2], which
// silently truncates nested slugs to their first segment.

export function slugFromWikiHref(href) {
  if (typeof href !== 'string' || !href) return '';
  if (isWikiCategoryOrSpecialHref(href)) return '';
  const match = href.trim().match(/\/wiki\/(.+?)\/?(?:[#?]|$)/i);
  if (!match) return '';
  const raw = match[1].replace(/\/+$/, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function isWikiCategoryOrSpecialHref(href) {
  return typeof href === 'string' && (href.includes('/wiki/category/') || href.includes('/wiki/special/'));
}

/** True for built article pages: /wiki/<slug>/ with optional fragment/query. */
export function isBuiltWikiArticleHref(href) {
  if (typeof href !== 'string' || !href) return false;
  if (isWikiCategoryOrSpecialHref(href)) return false;
  return /^\/wiki\/[^/].+\/$/.test(href.split(/[#?]/)[0]);
}

/** True for any article href (built pages or history/backlinks companions). */
export function isWikiArticleHref(href) {
  if (typeof href !== 'string' || !href) return false;
  if (isWikiCategoryOrSpecialHref(href)) return false;
  return /^\/wiki\/[^/].+/.test(href);
}

export function wikiArticleHref(origin, slug) {
  const base = String(origin ?? '').replace(/\/+$/, '');
  const clean = String(slug ?? '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .join('/');
  return clean ? `${base}/wiki/${clean}/` : `${base}/wiki/`;
}

/** Build /wiki/<slug>/<companion>/ URLs (history, backlinks, cite, info, …). */
export function wikiCompanionHref(origin, slug, companion) {
  const article = wikiArticleHref(origin, slug).replace(/\/$/, '');
  const segment = String(companion ?? '').replace(/^\/+|\/+$/g, '');
  return segment ? `${article}/${segment}/` : `${article}/`;
}

/** Build /wiki/<slug>/<name>.json machine-readable companion URLs. */
export function wikiCompanionJsonHref(origin, slug, name) {
  const article = wikiArticleHref(origin, slug).replace(/\/$/, '');
  const base = String(name ?? '').replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '');
  return base ? `${article}/${base}.json` : `${article}.json`;
}

/** Build /wiki/<slug>/<filename> static companion files (e.g. cite.bib). */
export function wikiCompanionFileHref(origin, slug, filename) {
  const article = wikiArticleHref(origin, slug).replace(/\/$/, '');
  const file = String(filename ?? '').replace(/^\/+/, '');
  return file ? `${article}/${file}` : `${article}/`;
}
