import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { fileURLToPath, pathToFileURL } from 'url';
import { buildSlugAliases, extractWikiLinks, resolveTargetSlug } from './wiki-link-resolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const contentDir = path.join(projectRoot, 'src', 'content', 'pages');
const outputDir = path.join(projectRoot, 'public', 'data');

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

export function extractInfoboxWikiLinks(rows) {
  if (!Array.isArray(rows)) return [];

  return rows.flatMap((row) => {
    if (typeof row?.value !== 'string') return [];
    return extractWikiLinks(row.value);
  });
}

export function getVisibleInfoboxRows(articleDir, frontmatterRows) {
  if (Array.isArray(frontmatterRows)) return frontmatterRows;

  const infoboxPath = path.join(articleDir, 'infobox.json');
  if (!fs.existsSync(infoboxPath)) return undefined;

  const infobox = JSON.parse(fs.readFileSync(infoboxPath, 'utf-8'));
  return Array.isArray(infobox?.rows) ? infobox.rows : undefined;
}

function main() {
  console.log('Building link graph and backlinks...');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

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

    // Extract wiki links from both rendered article body and visible infobox metadata.
    const links = [
      ...extractWikiLinks(body),
      ...extractInfoboxWikiLinks(getVisibleInfoboxRows(path.dirname(filePath), data.infoboxRows)),
    ];
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
  const backlinkPairs = new Set();
  Object.keys(linkGraph).forEach(fromSlug => {
    linkGraph[fromSlug].forEach(link => {
      const toSlug = link.target;
      const pairKey = `${toSlug}\0${fromSlug}`;
      if (backlinkPairs.has(pairKey)) {
        return;
      }
      backlinkPairs.add(pairKey);

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
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
