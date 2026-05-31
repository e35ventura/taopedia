import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const contentDir = path.join(projectRoot, 'src', 'content', 'pages');
const outputDir = path.join(projectRoot, 'public', 'data');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function walkDirectory(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDirectory(filePath, fileList);
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

function extractWikiLinks(content) {
  // Match [[Wiki Link]] or [[Wiki Link|Display Text]]
  const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const links = [];
  let match;
  
  while ((match = wikiLinkRegex.exec(content)) !== null) {
    const target = match[1].trim();
    const text = match[2] ? match[2].trim() : target;
    links.push({ target, text });
  }
  
  return links;
}

function slugify(text) {
  return text.toLowerCase().replace(/ /g, '_').replace(/[^\w-]/g, '');
}

function normalizeLinkTarget(rawTarget) {
  return String(rawTarget || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .split('#')[0];
}

function buildSlugAliases(slugMap) {
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

function resolveTargetSlug(rawTarget, slugAliases) {
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

console.log('Building link graph and backlinks...');

const markdownFiles = walkDirectory(contentDir);
const linkGraph = {};
const backlinks = {};
const slugMap = {};
const categoryIndex = {};

// First pass: build slug map and extract links
markdownFiles.forEach(filePath => {
  const relativePath = path.relative(contentDir, filePath);
  const slug = path.dirname(relativePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf-8');
  const { data, content: body } = matter(content);
  
  slugMap[slug] = {
    title: data.title || slug,
    categories: data.categories || [],
    summary: data.summary || '',
  };
  
  // Build category index
  (data.categories || []).forEach(cat => {
    if (!categoryIndex[cat]) {
      categoryIndex[cat] = [];
    }
    categoryIndex[cat].push(slug);
  });
  
  // Extract wiki links
  const links = extractWikiLinks(body);
  linkGraph[slug] = links.map(link => ({
    target: link.target,
    text: link.text,
  }));
});

const slugAliases = buildSlugAliases(slugMap);
for (const [fromSlug, links] of Object.entries(linkGraph)) {
  linkGraph[fromSlug] = links.map(link => ({
    target: resolveTargetSlug(link.target, slugAliases),
    text: link.text,
  })).filter(link => link.target);
}

// Second pass: build backlinks
Object.keys(linkGraph).forEach(fromSlug => {
  linkGraph[fromSlug].forEach(link => {
    const toSlug = link.target;
    if (!backlinks[toSlug]) {
      backlinks[toSlug] = [];
    }
    backlinks[toSlug].push({
      from: fromSlug,
      fromTitle: slugMap[fromSlug]?.title || fromSlug,
    });
  });
});

// Write outputs
fs.writeFileSync(
  path.join(outputDir, 'linkgraph.json'),
  JSON.stringify(linkGraph, null, 2)
);

fs.writeFileSync(
  path.join(outputDir, 'backlinks.json'),
  JSON.stringify(backlinks, null, 2)
);

fs.writeFileSync(
  path.join(outputDir, 'slugmap.json'),
  JSON.stringify(slugMap, null, 2)
);

fs.writeFileSync(
  path.join(outputDir, 'categories.json'),
  JSON.stringify(categoryIndex, null, 2)
);

console.log(`✓ Built link graph for ${Object.keys(linkGraph).length} pages`);
console.log(`✓ Generated ${Object.keys(backlinks).length} backlink entries`);
console.log(`✓ Indexed ${Object.keys(categoryIndex).length} categories`);
