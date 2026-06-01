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

// Normalize an author-supplied redirect alias to a wiki slug. Mirrors the URL
// convention used by wiki links (lowercase, spaces -> underscores) and tolerates
// authors who prefix the alias with `/wiki/` or a leading slash.
function normalizeRedirect(text) {
  return String(text)
    .trim()
    .replace(/^\/+/, '')
    .replace(/^wiki\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase()
    .replace(/ /g, '_');
}

console.log('Building link graph and backlinks...');

const markdownFiles = walkDirectory(contentDir).sort();
const linkGraph = {};
const backlinks = {};
const slugMap = {};
const categoryIndex = {};
// Raw redirect declarations, collected before we know the full slug map so we
// can validate aliases against every real page in a second pass below.
const rawRedirects = [];

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

  // Collect redirect aliases declared in frontmatter for resolution below.
  if (Array.isArray(data.redirects)) {
    data.redirects.forEach(alias => {
      rawRedirects.push({ alias, targetSlug: slug });
    });
  }
  
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
    target: slugify(link.target),
    text: link.text,
  }));
});

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

// Resolve redirect aliases into a { "/wiki/<alias>": "/wiki/<target>" } map.
// Validation rules:
//  - an alias that resolves to an existing real page is skipped (never shadow a page);
//  - an alias equal to its own page is skipped (no-op);
//  - if two pages claim the same alias, the first (in sorted file order) wins and
//    the conflict is reported.
const redirectMap = {};
const redirectOwners = {}; // normalized alias -> target slug that claimed it
// Map each real page's normalized form to its canonical slug for collision checks.
const normalizedRealSlugs = new Map();
Object.keys(slugMap).forEach(realSlug => {
  normalizedRealSlugs.set(normalizeRedirect(realSlug), realSlug);
});

let redirectConflicts = 0;
rawRedirects.forEach(({ alias, targetSlug }) => {
  const normalized = normalizeRedirect(alias);
  if (!normalized) {
    console.warn(`⚠ Ignoring empty redirect alias declared on "${targetSlug}"`);
    return;
  }
  if (normalized === normalizeRedirect(targetSlug)) {
    console.warn(`⚠ Ignoring self-referential redirect "${alias}" on "${targetSlug}"`);
    return;
  }
  const shadowed = normalizedRealSlugs.get(normalized);
  if (shadowed) {
    console.warn(
      `⚠ Redirect "${alias}" (on "${targetSlug}") collides with existing page "${shadowed}" — skipped`
    );
    redirectConflicts += 1;
    return;
  }
  if (redirectOwners[normalized] && redirectOwners[normalized] !== targetSlug) {
    console.warn(
      `⚠ Redirect "${alias}" claimed by both "${redirectOwners[normalized]}" and "${targetSlug}" — keeping "${redirectOwners[normalized]}"`
    );
    redirectConflicts += 1;
    return;
  }
  redirectOwners[normalized] = targetSlug;
  redirectMap[`/wiki/${normalized}`] = `/wiki/${targetSlug}`;
});

// Write outputs
fs.writeFileSync(
  path.join(outputDir, 'redirects.json'),
  JSON.stringify(redirectMap, null, 2)
);

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
console.log(
  `✓ Generated ${Object.keys(redirectMap).length} redirect aliases` +
    (redirectConflicts ? ` (${redirectConflicts} conflict${redirectConflicts === 1 ? '' : 's'} skipped)` : '')
);
