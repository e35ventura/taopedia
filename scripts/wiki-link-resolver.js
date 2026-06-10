import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export const WIKI_LINK_ALIAS_DIVIDER = '|';

export function parseWikiLinkTokens(content) {
  const value = String(content ?? '');
  const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const tokens = [];
  let lastIndex = 0;
  let match;

  while ((match = wikiLinkRegex.exec(value)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: value.slice(lastIndex, match.index) });
    }

    const target = match[1].trim();
    const label = typeof match[2] === 'string' ? match[2].trim() : '';
    if (target) {
      tokens.push({ type: 'link', target, text: label || target });
    } else {
      tokens.push({ type: 'text', text: match[0] });
    }

    lastIndex = wikiLinkRegex.lastIndex;
  }

  if (lastIndex < value.length) {
    tokens.push({ type: 'text', text: value.slice(lastIndex) });
  }

  return tokens;
}

export function extractWikiLinks(content) {
  return parseWikiLinkTokens(content)
    .filter((token) => token.type === 'link')
    .map(({ target, text }) => ({ target, text }));
}

export function slugify(text) {
  return String(text || '').toLowerCase().replace(/ /g, '_').replace(/[^\w-]/g, '');
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeLinkTarget(rawTarget) {
  let target = String(rawTarget || '').trim();

  try {
    const url = new URL(target);
    const host = url.hostname.toLowerCase();
    if ((host === 'taopedia.org' || host === 'www.taopedia.org') && url.pathname.toLowerCase().startsWith('/wiki/')) {
      target = url.pathname + url.hash;
    }
  } catch {
    // Not an absolute URL; keep handling normal wiki-link targets below.
  }

  const withoutHash = target.trim().split('#')[0];
  const withoutRoutePrefix = withoutHash
    .replace(/^\/+/, '')
    .replace(/^wiki\//i, '')
    .replace(/\/+$/g, '');

  return withoutRoutePrefix.split('/').map(decodePathSegment).join('/');
}

export function buildSlugAliases(slugMap) {
  const aliases = new Map();
  for (const [slug, meta] of Object.entries(slugMap)) {
    const keys = new Set([
      slug,
      slug.toLowerCase(),
      slugify(slug),
      slugify(slug.replaceAll('_', ' ')),
      slugify(meta?.title || ''),
    ]);
    for (const key of keys) {
      if (key) aliases.set(key, slug);
    }
  }
  return aliases;
}

export function resolveTargetSlug(rawTarget, slugAliases) {
  const normalized = normalizeLinkTarget(rawTarget);
  if (!normalized) return '';

  const candidates = [
    normalized,
    normalized.toLowerCase(),
    slugify(normalized),
    slugify(normalized.replaceAll('_', ' ')),
  ];
  for (const candidate of candidates) {
    const resolved = slugAliases.get(candidate);
    if (resolved) return resolved;
  }
  return candidates[2];
}

function walkMarkdownFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;

  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkMarkdownFiles(filePath, fileList);
    } else if (
      file === 'index.md' ||
      file === 'index.mdx' ||
      file.endsWith('.md') ||
      file.endsWith('.mdx')
    ) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

export function loadSlugMapFromContent(contentDir) {
  const slugMap = {};
  for (const filePath of walkMarkdownFiles(contentDir)) {
    const relativePath = path.relative(contentDir, filePath);
    const slug = path.dirname(relativePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf-8');
    const { data } = matter(content);

    slugMap[slug] = {
      title: data.title || slug,
      categories: data.categories || [],
      summary: data.summary || '',
    };
  }
  return slugMap;
}

export function createRemarkWikiLinkOptions(slugMap) {
  const slugAliases = buildSlugAliases(slugMap);
  const permalinks = Object.keys(slugMap);

  return {
    aliasDivider: WIKI_LINK_ALIAS_DIVIDER,
    permalinks,
    pageResolver: (name) => {
      const normalized = normalizeLinkTarget(name);
      if (!normalized) return [''];

      return Array.from(new Set([
        resolveTargetSlug(normalized, slugAliases),
        normalized,
        normalized.toLowerCase(),
        slugify(normalized),
        slugify(normalized.replaceAll('_', ' ')),
      ].filter(Boolean)));
    },
    hrefTemplate: (permalink) => `/wiki/${permalink}`,
  };
}
