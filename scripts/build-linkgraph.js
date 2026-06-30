import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import matter from './frontmatter.js';
import { buildSlugAliases, extractWikiLinks, resolveTargetSlug, slugFromContentPath } from './wiki-link-resolver.js';
import { relatedAliasKeys, splitPlainTextRelatedTargets } from '../src/lib/related-link-targets.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const contentDir = path.join(projectRoot, 'src', 'content', 'pages');
const outputDir = path.join(projectRoot, 'public', 'data');

const compareGeneratedKeys = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });

function orderedObject(object, mapValue = (value) => value) {
  return Object.fromEntries(
    Object.entries(object)
      .sort(([a], [b]) => compareGeneratedKeys(a, b))
      .map(([key, value]) => [key, mapValue(value, key)]),
  );
}

function orderedBacklinks(entries) {
  return [...entries].sort((a, b) =>
    compareGeneratedKeys(a.from, b.from) ||
    compareGeneratedKeys(a.fromTitle ?? '', b.fromTitle ?? ''),
  );
}

export function normalizeArticleCategories(categories) {
  // Dedupe repeated frontmatter topics at linkgraph build time so slugmap.json and
  // categories.json never carry duplicate tags for one article.
  return [...new Set(Array.isArray(categories) ? categories : [])];
}

export function orderGeneratedData({ linkGraph, backlinks, slugMap, categoryIndex }) {
  return {
    linkGraph: orderedObject(linkGraph),
    backlinks: orderedObject(backlinks, orderedBacklinks),
    slugMap: orderedObject(slugMap),
    // De-dupe each category's member slugs: an article whose frontmatter repeats a
    // category (e.g. categories: ['TAO', 'TAO']) otherwise lists its slug twice under
    // that topic, double-counting it in category hubs and statistics. Mirrors the
    // distinct-article counting (#1472) and the feed category de-dupe (#1494).
    categoryIndex: orderedObject(categoryIndex, (slugs) => [...new Set(slugs)].sort(compareGeneratedKeys)),
  };
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

export function extractInfoboxWikiLinks(rows) {
  if (!Array.isArray(rows)) return [];

  return rows.flatMap((row) => {
    if (typeof row?.value !== 'string') return [];
    const wikiLinks = extractWikiLinks(row.value);
    if (wikiLinks.length > 0) return wikiLinks;

    if (!/\brelated\b/i.test(String(row?.label ?? ''))) return [];

    const target = row.value.trim();
    if (!target) return [];

    // Current article content often uses a plain-text "Related" infobox row
    // instead of [[wiki-links]]. Treat that visible related term as a local
    // graph candidate only when it resolves to an existing article.
    return [{ target, text: target, requireExisting: true }];
  });
}

export function getVisibleInfoboxRows(articleDir, frontmatterRows) {
  if (Array.isArray(frontmatterRows)) return frontmatterRows;

  const infoboxPath = path.join(articleDir, 'infobox.json');
  if (!fs.existsSync(infoboxPath)) return undefined;

  const infobox = JSON.parse(fs.readFileSync(infoboxPath, 'utf-8'));
  return Array.isArray(infobox?.rows) ? infobox.rows : undefined;
}

export function dedupeOutgoingLinks(links) {
  const seen = new Set();
  return links.filter((link) => {
    if (!link?.target || seen.has(link.target)) return false;
    seen.add(link.target);
    return true;
  });
}

export function resolveBuildLinkTargets({ target, slugAliases, slugMap, requireExisting = false }) {
  const resolvedTarget = resolveTargetSlug(target, slugAliases);
  if (slugMap[resolvedTarget]) return [resolvedTarget];
  if (!requireExisting) return resolvedTarget ? [resolvedTarget] : [];

  for (const aliasKey of relatedAliasKeys(target)) {
    const aliasTarget = slugAliases.get(aliasKey);
    if (aliasTarget && slugMap[aliasTarget]) {
      return [aliasTarget];
    }
  }

  return [...new Set(
    splitPlainTextRelatedTargets(target)
      .map((part) => resolveTargetSlug(part, slugAliases))
      .filter((part) => slugMap[part]),
  )];
}

function main() {
  console.log('Building link graph and backlinks...');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const markdownFiles = walkDirectory(contentDir).sort(compareGeneratedKeys);
  const linkGraph = {};
  const backlinks = {};
  const slugMap = {};
  const categoryIndex = {};
  const slugSources = new Map();

  // First pass: build slug map and extract links
  markdownFiles.forEach(filePath => {
    const relativePath = path.relative(contentDir, filePath);
    const slug = slugFromContentPath(relativePath);
    if (slugSources.has(slug)) {
      throw new Error(
        `Duplicate article slug "${slug}" from ${relativePath} and ${slugSources.get(slug)}`,
      );
    }
    slugSources.set(slug, relativePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const { data, content: body } = matter(content);
    const articleCategories = normalizeArticleCategories(data.categories || []);

    slugMap[slug] = {
      title: data.title || slug,
      infoboxTitle: data.infoboxTitle || '',
      categories: articleCategories,
      summary: data.summary || '',
    };

    // Build category index — one membership per topic even when frontmatter repeats it.
    for (const cat of articleCategories) {
      if (!categoryIndex[cat]) {
        categoryIndex[cat] = [];
      }
      categoryIndex[cat].push(slug);
    }

    // Extract wiki links from both rendered article body and visible infobox metadata.
    const links = [
      ...extractWikiLinks(body),
      ...extractInfoboxWikiLinks(getVisibleInfoboxRows(path.dirname(filePath), data.infoboxRows)),
    ];
    linkGraph[slug] = links.map(link => ({
      target: link.target,
      text: link.text,
      requireExisting: link.requireExisting === true,
    }));
  });

  const slugAliases = buildSlugAliases(slugMap);
  for (const [fromSlug, links] of Object.entries(linkGraph)) {
    linkGraph[fromSlug] = dedupeOutgoingLinks(
      links.flatMap((link) =>
        resolveBuildLinkTargets({
          target: link.target,
          slugAliases,
          slugMap,
          requireExisting: link.requireExisting,
        }).map((target) => ({
          target,
          text: link.text,
        })),
      ),
    );
  }

  // Second pass: build backlinks
  const backlinkPairs = new Set();
  Object.keys(linkGraph).forEach(fromSlug => {
    linkGraph[fromSlug].forEach(link => {
      const toSlug = link.target;
      // Skip self-links: an article that links to itself must not appear as its
      // own backlink ("What links here") or count toward its own inbound total.
      // getArticleReferences already excludes self-references on the OUTBOUND
      // side (target === slug); the inbound graph uses the same rule so the two
      // directions agree and Special:MostLinkedPages is not inflated by a
      // self-link.
      if (toSlug === fromSlug) {
        return;
      }
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

  const generatedData = orderGeneratedData({ linkGraph, backlinks, slugMap, categoryIndex });

  // Write outputs
  fs.writeFileSync(
    path.join(outputDir, 'linkgraph.json'),
    JSON.stringify(generatedData.linkGraph, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, 'backlinks.json'),
    JSON.stringify(generatedData.backlinks, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, 'slugmap.json'),
    JSON.stringify(generatedData.slugMap, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, 'categories.json'),
    JSON.stringify(generatedData.categoryIndex, null, 2)
  );

  console.log(`✓ Built link graph for ${Object.keys(linkGraph).length} pages`);
  console.log(`✓ Generated ${Object.keys(backlinks).length} backlink entries`);
  console.log(`✓ Indexed ${Object.keys(categoryIndex).length} categories`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
