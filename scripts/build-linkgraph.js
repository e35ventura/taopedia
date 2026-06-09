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
    target: slugify(link.target),
    text: link.text,
  }));
});

// Second pass: build backlinks (deduplicated per source→target pair)
Object.keys(linkGraph).forEach(fromSlug => {
  const seen = new Set();
  linkGraph[fromSlug].forEach(link => {
    const toSlug = link.target;
    if (seen.has(toSlug)) return;
    seen.add(toSlug);
    if (!backlinks[toSlug]) {
      backlinks[toSlug] = [];
    }
    backlinks[toSlug].push({
      from: fromSlug,
      fromTitle: slugMap[fromSlug]?.title || fromSlug,
    });
  });
});

// Derive wanted pages: link targets with no matching article slug
const knownSlugs = new Set(Object.keys(slugMap));
const wantedCounts = {};
Object.values(linkGraph).forEach(links => {
  links.forEach(link => {
    if (!knownSlugs.has(link.target)) {
      wantedCounts[link.target] = (wantedCounts[link.target] || 0) + 1;
    }
  });
});
const wantedPages = Object.entries(wantedCounts)
  .sort(([, a], [, b]) => b - a)
  .map(([slug, count]) => ({ slug, count }));

// Derive orphan pages: articles with zero inbound links
const linkedSlugs = new Set(Object.keys(backlinks));
const orphanPages = Object.keys(slugMap)
  .filter(slug => !linkedSlugs.has(slug))
  .sort()
  .map(slug => ({ slug, title: slugMap[slug].title }));

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

fs.writeFileSync(
  path.join(outputDir, 'wantedpages.json'),
  JSON.stringify(wantedPages, null, 2)
);

fs.writeFileSync(
  path.join(outputDir, 'orphanpages.json'),
  JSON.stringify(orphanPages, null, 2)
);

console.log(`✓ Built link graph for ${Object.keys(linkGraph).length} pages`);
console.log(`✓ Generated ${Object.keys(backlinks).length} backlink entries`);
console.log(`✓ Indexed ${Object.keys(categoryIndex).length} categories`);
console.log(`✓ Found ${wantedPages.length} wanted pages`);
console.log(`✓ Found ${orphanPages.length} orphan pages`);
