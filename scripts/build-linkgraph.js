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

    return splitPlainTextRelatedTargets(row.value).map((target) => ({
      target,
      text: target,
      preferResolvedTitle: true,
      requireExisting: true,
    }));
  });
}

export function extractCanonicalGlossaryLinks(content) {
  const value = String(content ?? '');
  const glossaryLinkRegex = /(?<!!)\[([^\]]+)\]\((https:\/\/docs\.learnbittensor\.org\/resources\/glossary#[^)]+)\)/g;
  const links = [];
  let match;

  while ((match = glossaryLinkRegex.exec(value)) !== null) {
    const text = match[1].trim();
    const hasGlossaryPrefix = /^Glossary:\s*/i.test(text);
    const rawTarget = text.replace(/^Glossary:\s*/i, '').trim();
    const slashParts = hasGlossaryPrefix && rawTarget.includes('/')
      ? rawTarget.split('/').map((part) => part.trim()).filter(Boolean)
      : [];
    const target = hasGlossaryPrefix
      ? rawTarget.replace(/\/+/g, ' ').replace(/\s+/g, ' ').trim()
      : rawTarget;
    const alternateTarget = slashParts.length > 0
      ? slashParts[0].replace(/\s+/g, ' ')
      : hasGlossaryPrefix && /^([A-Za-z]+)-([A-Za-z]+)/.test(rawTarget)
        ? rawTarget.replace(/^([A-Za-z]+)-([A-Za-z]+)/, '$2-$1').trim()
        : '';
    const slashSecondTarget = slashParts.length > 1
      ? slashParts.slice(1).join(' ').replace(/\s+/g, ' ').trim()
      : '';
    if (!target) continue;
    let canonicalTarget = decodeURIComponent(match[2].split('#')[1] || '').replace(/[-_]+/g, ' ').trim();
    if (
      hasGlossaryPrefix &&
      /^[A-Z0-9-]+$/.test(target) &&
      canonicalTarget.toLowerCase().startsWith(`${target.toLowerCase()} `)
    ) {
      canonicalTarget = canonicalTarget.slice(target.length).trim();
    }

    // Current article prose often references Learn Bittensor glossary anchors
    // whose visible label already names an existing local Taopedia concept,
    // including labels written as "Glossary: Foo". Strip only that prefix,
    // preserve the visible label as link text, and keep the stricter exact-only
    // resolver path only for prefixed labels so existing plural/split glossary
    // recovery keeps working for plain labels. When a glossary label misses,
    // keep the canonical glossary anchor as an exact-only fallback so the link
    // graph can still recover the existing local concept without rewriting any
    // label that already resolves locally.
    // Also treat slash-separated visible labels like "Drand/time-lock encryption"
    // as word boundaries for the exact-only local match without broadening other
    // wiki-link resolution paths. If a slash-separated prefixed label still
    // misses after that normalization, keep the first visible alternative as a
    // second exact-only fallback, then the remaining slash-separated segment(s),
    // before consulting the canonical glossary anchor. Likewise, some glossary
    // the start of the canonical anchor ("adr alpha ..."); strip that
    // redundant acronym only in the prefixed exact-only fallback path. When a
    // prefixed label ends with a parenthetical acronym like "(EMA)", allow one
    // final exact-only retry that strips the acronym and pluralizes the last
    // word so glossary singular phrasing can still recover an existing local
    // plural concept article. When a prefixed label's first hyphen compound is
    // word-order-reversed from the local title (e.g. "Coldkey-hotkey pair" vs
    // "Hotkey-Coldkey Pair"), keep a swapped hyphen fallback before consulting
    // the canonical glossary anchor. When a prefixed glossary verb like
    // "Recycle" names a local gerund concept article ("Recycling"), allow one
    // final exact-only retry on the -ing form. When a prefixed glossary singular
    // like "Extrinsic" names a local plural concept article ("Extrinsics"), allow
    // one exact-only retry on the pluralized label. When a prefixed glossary short
    // label like "Alpha" names a local compound concept article ("Alpha Tokens"),
    // allow one exact-only retry on the suffixed title.
    links.push({
      target,
      alternateTarget,
      slashSecondTarget,
      canonicalTarget,
      text,
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: !hasGlossaryPrefix,
    });
  }

  return links;
}

function expandGlossaryAcronymPluralTarget(target, canonicalTarget) {
  const match = String(target || '').trim().match(/^(.*)\(([A-Z0-9-]+)\)\s*$/);
  if (!match) return '';

  const baseTarget = match[1].trim();
  if (!baseTarget) return '';

  const pluralizedBaseTarget = pluralizeFinalWord(baseTarget);
  if (pluralizedBaseTarget) return pluralizedBaseTarget;

  const acronym = match[2].trim().toLowerCase();
  const normalizedCanonicalTarget = String(canonicalTarget || '').trim();
  const canonicalSuffix = ` ${acronym}`;
  if (!normalizedCanonicalTarget.toLowerCase().endsWith(canonicalSuffix)) return '';

  return pluralizeFinalWord(
    normalizedCanonicalTarget.slice(0, normalizedCanonicalTarget.length - canonicalSuffix.length).trim(),
  );
}

function pluralizeFinalWord(target) {
  const words = String(target || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';

  const lastWord = words.at(-1);
  if (!/^[A-Za-z][A-Za-z-]*$/.test(lastWord) || /s$/i.test(lastWord)) return '';

  words[words.length - 1] = `${lastWord}s`;
  return words.join(' ');
}

function gerundFinalWord(target) {
  const words = String(target || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';

  const lastWord = words.at(-1);
  if (!/^[A-Za-z][A-Za-z-]*$/.test(lastWord) || /ing$/i.test(lastWord)) return '';

  const gerundWord = /e$/i.test(lastWord) && lastWord.length > 2
    ? `${lastWord.slice(0, -1)}ing`
    : `${lastWord}ing`;
  words[words.length - 1] = gerundWord;
  return words.join(' ');
}

export function expandGlossaryGerundConceptTarget(target, canonicalTarget) {
  for (const base of [target, canonicalTarget]) {
    const gerundTarget = gerundFinalWord(String(base || '').trim());
    if (!gerundTarget || gerundTarget.toLowerCase() === String(base || '').trim().toLowerCase()) continue;
    return gerundTarget;
  }

  return '';
}

export function expandGlossaryPluralConceptTarget(target, canonicalTarget) {
  for (const base of [target, canonicalTarget]) {
    const pluralTarget = pluralizeFinalWord(String(base || '').trim());
    if (!pluralTarget || pluralTarget.toLowerCase() === String(base || '').trim().toLowerCase()) continue;
    return pluralTarget;
  }

  return '';
}

function titleCaseWord(word) {
  const value = String(word || '').trim();
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function expandGlossaryTokensConceptTarget(target, canonicalTarget) {
  for (const base of [target, canonicalTarget]) {
    const word = String(base || '').trim();
    if (!word || /\s/.test(word)) continue;
    const tokensTarget = `${titleCaseWord(word)} Tokens`;
    if (tokensTarget.toLowerCase() === word.toLowerCase()) continue;
    return tokensTarget;
  }

  return '';
}

export function getVisibleInfoboxRows(articleDir, frontmatterRows) {
  if (Array.isArray(frontmatterRows)) return frontmatterRows;

  const infoboxPath = path.join(articleDir, 'infobox.json');
  if (!fs.existsSync(infoboxPath)) return undefined;

  const infobox = JSON.parse(fs.readFileSync(infoboxPath, 'utf-8'));
  return Array.isArray(infobox?.rows) ? infobox.rows : undefined;
}

export function dedupeOutgoingLinks(links) {
  const deduped = [];
  const indexByTarget = new Map();

  for (const link of links) {
    if (!link?.target) continue;

    const existingIndex = indexByTarget.get(link.target);
    if (existingIndex === undefined) {
      indexByTarget.set(link.target, deduped.length);
      deduped.push(link);
      continue;
    }

    const existing = deduped[existingIndex];
    // Prefer a later non-prefixed visible label when a newly recovered
    // "Glossary: Foo" edge points at the same target as an existing link.
    if (/^Glossary:\s*/i.test(String(existing?.text ?? '')) && !/^Glossary:\s*/i.test(String(link?.text ?? ''))) {
      deduped[existingIndex] = link;
    }
  }

  return deduped;
}

export function resolveBuildLinkTargets({ target, slugAliases, slugMap, requireExisting = false, allowSplitTargets = true }) {
  const resolvedTarget = resolveTargetSlug(target, slugAliases);
  if (slugMap[resolvedTarget]) return [resolvedTarget];
  if (!requireExisting) return resolvedTarget ? [resolvedTarget] : [];
  if (!allowSplitTargets) return [];

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

function shouldUseResolvedTitleText(text, resolvedTitle) {
  const normalizedText = String(text || '').trim().toLowerCase().replace(/[^\w]+/g, ' ');
  const normalizedResolvedTitle = String(resolvedTitle || '').trim().toLowerCase().replace(/[^\w]+/g, ' ');
  return Boolean(normalizedText) && normalizedText === normalizedResolvedTitle;
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
  const slugAliasMap = {};
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
      categories: articleCategories,
      summary: data.summary || '',
    };
    // Plain-text Related rows often use the article's visible infobox label
    // (for example "MEV") rather than its full title or slug. Feed that
    // short on-page label into the alias resolver without widening the
    // published slugmap.json contract.
    slugAliasMap[slug] = {
      title: data.title || slug,
      infoboxTitle: data.infoboxTitle || '',
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
      ...extractCanonicalGlossaryLinks(body),
      ...extractInfoboxWikiLinks(getVisibleInfoboxRows(path.dirname(filePath), data.infoboxRows)),
    ];
    linkGraph[slug] = links.map(link => ({
      target: link.target,
      alternateTarget: link.alternateTarget || '',
      slashSecondTarget: link.slashSecondTarget || '',
      canonicalTarget: link.canonicalTarget || '',
      text: link.text,
      preferResolvedTitle: link.preferResolvedTitle === true,
      requireExisting: link.requireExisting === true,
      skipSelf: link.skipSelf === true,
      allowSplitTargets: link.allowSplitTargets !== false,
    }));
  });

  const slugAliases = buildSlugAliases(slugAliasMap);
  for (const [fromSlug, links] of Object.entries(linkGraph)) {
    const resolvedLinks = links.map((link) => {
      const isPrefixedGlossaryLabel = /^Glossary:\s*/i.test(String(link.text || ''));
      const isGenericGlossaryLabel = /^glossary$/i.test(String(link.text || '').trim());
      const filterSelfTargets = (targets) => targets.filter(
        (target) => !(link.skipSelf && target === fromSlug),
      );
      const labelTargets = resolveBuildLinkTargets({
        target: link.target,
        slugAliases,
        slugMap,
        requireExisting: link.requireExisting,
        allowSplitTargets: link.allowSplitTargets,
      });
      const nonSelfLabelTargets = filterSelfTargets(labelTargets);
      const alternateTargets = nonSelfLabelTargets.length === 0 && link.alternateTarget
        ? filterSelfTargets(resolveBuildLinkTargets({
            target: link.alternateTarget,
            slugAliases,
            slugMap,
            requireExisting: true,
            allowSplitTargets: false,
          }))
        : [];
      const slashSecondTargets = nonSelfLabelTargets.length === 0
        && alternateTargets.length === 0
        && link.slashSecondTarget
        ? filterSelfTargets(resolveBuildLinkTargets({
            target: link.slashSecondTarget,
            slugAliases,
            slugMap,
            requireExisting: true,
            allowSplitTargets: false,
          }))
        : [];
      const canonicalTargets = link.canonicalTarget
        ? filterSelfTargets(resolveBuildLinkTargets({
            target: link.canonicalTarget,
            slugAliases,
            slugMap,
            requireExisting: true,
            allowSplitTargets: false,
          }))
        : [];
      const fallbackCanonicalTargets = isPrefixedGlossaryLabel || !isGenericGlossaryLabel
        ? canonicalTargets
        : [];
      const glossaryAcronymPluralTargets = nonSelfLabelTargets.length === 0
        && alternateTargets.length === 0
        && slashSecondTargets.length === 0
        && fallbackCanonicalTargets.length === 0
        && isPrefixedGlossaryLabel
        ? filterSelfTargets(resolveBuildLinkTargets({
            target: expandGlossaryAcronymPluralTarget(link.target, link.canonicalTarget),
            slugAliases,
            slugMap,
            requireExisting: true,
            allowSplitTargets: false,
          }))
        : [];
        const glossaryGerundTargets = nonSelfLabelTargets.length === 0
          && alternateTargets.length === 0
          && slashSecondTargets.length === 0
          && glossaryAcronymPluralTargets.length === 0
          && fallbackCanonicalTargets.length === 0
          && isPrefixedGlossaryLabel
          ? filterSelfTargets(resolveBuildLinkTargets({
              target: expandGlossaryGerundConceptTarget(link.target, link.canonicalTarget),
              slugAliases,
              slugMap,
              requireExisting: true,
              allowSplitTargets: false,
            }))
          : [];
        const glossaryPluralTargets = nonSelfLabelTargets.length === 0
          && alternateTargets.length === 0
          && slashSecondTargets.length === 0
          && glossaryAcronymPluralTargets.length === 0
          && glossaryGerundTargets.length === 0
          && fallbackCanonicalTargets.length === 0
          && isPrefixedGlossaryLabel
          ? filterSelfTargets(resolveBuildLinkTargets({
              target: expandGlossaryPluralConceptTarget(link.target, link.canonicalTarget),
              slugAliases,
              slugMap,
              requireExisting: true,
              allowSplitTargets: false,
            }))
          : [];
        const glossaryTokensTargets = nonSelfLabelTargets.length === 0
          && alternateTargets.length === 0
          && slashSecondTargets.length === 0
          && glossaryAcronymPluralTargets.length === 0
          && glossaryGerundTargets.length === 0
          && glossaryPluralTargets.length === 0
          && fallbackCanonicalTargets.length === 0
          && isPrefixedGlossaryLabel
          ? filterSelfTargets(resolveBuildLinkTargets({
              target: expandGlossaryTokensConceptTarget(link.target, link.canonicalTarget),
              slugAliases,
              slugMap,
              requireExisting: true,
              allowSplitTargets: false,
            }))
          : [];
        const resolvedTargets = nonSelfLabelTargets.length > 0
          ? nonSelfLabelTargets
          : alternateTargets.length > 0
            ? alternateTargets
            : slashSecondTargets.length > 0
              ? slashSecondTargets
              : glossaryAcronymPluralTargets.length > 0
                ? glossaryAcronymPluralTargets
                : glossaryGerundTargets.length > 0
                  ? glossaryGerundTargets
                  : glossaryPluralTargets.length > 0
                    ? glossaryPluralTargets
                    : glossaryTokensTargets.length > 0
                      ? glossaryTokensTargets
                      : fallbackCanonicalTargets;

      return {
        link,
        resolvedTargets,
        isPlainGlossaryCanonicalFallback:
          !isPrefixedGlossaryLabel
          && !isGenericGlossaryLabel
          && nonSelfLabelTargets.length === 0
          && alternateTargets.length === 0
          && slashSecondTargets.length === 0
          && glossaryAcronymPluralTargets.length === 0
          && glossaryGerundTargets.length === 0
          && glossaryPluralTargets.length === 0
          && glossaryTokensTargets.length === 0
          && fallbackCanonicalTargets.length > 0,
      };
    });
    const nonPlainCanonicalTargets = new Set(
      resolvedLinks.flatMap(({ resolvedTargets, isPlainGlossaryCanonicalFallback }) =>
        isPlainGlossaryCanonicalFallback ? [] : resolvedTargets
      ),
    );

    linkGraph[fromSlug] = dedupeOutgoingLinks(
      resolvedLinks.flatMap(({ link, resolvedTargets, isPlainGlossaryCanonicalFallback }) => {
        const effectiveTargets = isPlainGlossaryCanonicalFallback
          ? resolvedTargets.filter((target) => !nonPlainCanonicalTargets.has(target))
          : resolvedTargets;

        return effectiveTargets
          .map((target) => ({
            target,
            text: link.preferResolvedTitle && shouldUseResolvedTitleText(link.text, slugMap[target]?.title)
              ? (slugMap[target]?.title || link.text)
              : link.text,
          }));
      }),
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
