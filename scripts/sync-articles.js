import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const defaultArticlesRoot = path.resolve(projectRoot, '..', 'taopedia-articles');
const articlesRoot = process.env.TAOPEDIA_ARTICLES_DIR
  ? path.resolve(process.env.TAOPEDIA_ARTICLES_DIR)
  : defaultArticlesRoot;
const articlesRepoRef = process.env.TAOPEDIA_ARTICLES_REF || 'main';
const cacheArticlesRoot = path.join(projectRoot, '.cache', 'taopedia-articles');
let sourceRoot = path.join(articlesRoot, 'content', 'pages');
const targetRoot = path.join(projectRoot, 'src', 'content', 'pages');
const allowedAssetExtensions = new Set(['.avif', '.gif', '.jpg', '.jpeg', '.json', '.png', '.webp']);
const maxAssetBytes = 5 * 1024 * 1024;
const unsafeContentPatterns = [
  { pattern: /^\s*import\s/m, reason: 'MDX imports are not allowed in article content' },
  { pattern: /^\s*export\s/m, reason: 'MDX exports are not allowed in article content' },
  { pattern: /<\s*script[\s>]/i, reason: 'script tags are not allowed in article content' },
  { pattern: /<\s*\/\s*script\s*>/i, reason: 'script tags are not allowed in article content' },
  { pattern: /<\s*(base|iframe|object|embed|link|meta|style)\b/i, reason: 'active HTML elements are not allowed in article content' },
  { pattern: /\son[a-z]+\s*=/i, reason: 'inline event handlers are not allowed in article content' },
  { pattern: /\bjavascript\s*:/i, reason: 'javascript: URLs are not allowed in article content' },
  { pattern: /\bdata\s*:\s*text\/html/i, reason: 'HTML data URLs are not allowed in article content' },
  { pattern: /\bset:html\b/i, reason: 'raw HTML injection directives are not allowed in article content' },
  { pattern: /\bclient:[a-z-]+\b/i, reason: 'client directives are not allowed in article content' },
];

// Dangerous URL schemes can be smuggled past the literal checks above using HTML
// numeric/named entities, control characters, or zero-width characters that a
// browser strips when resolving a URL (e.g. `java&#115;cript:`,
// `javascript&colon;`, `java\tscript:`). Decode those forms before re-scanning.
const obfuscatedSchemePatterns = [
  { pattern: /javascript\s*:/i, reason: 'javascript: URLs are not allowed in article content' },
  { pattern: /data\s*:\s*text\/html/i, reason: 'HTML data URLs are not allowed in article content' },
];

const hiddenTopics = new Set(['bittensor']);

function normalizeCategoryLabel(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPublishedArticle(data) {
  return data.draft !== true;
}

function toCategories(data) {
  const categories = new Map();
  const addCategory = (rawValue) => {
    const normalized = normalizeCategoryLabel(rawValue);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (hiddenTopics.has(key)) return;
    if (!categories.has(key)) categories.set(key, normalized);
  };

  if (typeof data.category === 'string') {
    addCategory(data.category);
  }
  if (Array.isArray(data.tags)) {
    for (const tag of data.tags) addCategory(tag);
  }
  return Array.from(categories.values());
}

function validateSlug(slug) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
    throw new Error(`Unsafe article slug "${slug}". Use lowercase letters, numbers, underscores, and hyphens.`);
  }
}

function fromCodePoint(codePoint, fallback) {
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : fallback;
}

// Remove characters a browser ignores inside a URL — C0/C1 control characters
// (including tab/newline/CR), DEL, zero-width characters and the BOM — while
// preserving the ordinary space (U+0020) so plain prose such as "Java Script:"
// is never collapsed into a false positive.
function stripUrlObfuscationChars(value) {
  let result = '';
  for (const char of value) {
    const code = char.codePointAt(0);
    const isControl = code <= 0x1f || code === 0x7f;
    const isZeroWidth = (code >= 0x200b && code <= 0x200d) || code === 0xfeff;
    if (!isControl && !isZeroWidth) {
      result += char;
    }
  }
  return result;
}

function decodeForSchemeScan(content) {
  const decoded = content
    .replace(/&#x([0-9a-f]+);?/gi, (match, hex) => fromCodePoint(Number.parseInt(hex, 16), match))
    .replace(/&#(\d+);?/g, (match, dec) => fromCodePoint(Number.parseInt(dec, 10), match))
    .replace(/&colon;/gi, ':')
    .replace(/&sol;/gi, '/')
    .replace(/&(?:tab|newline);/gi, '');
  return stripUrlObfuscationChars(decoded);
}

export function validateArticleContent(slug, content) {
  for (const { pattern, reason } of unsafeContentPatterns) {
    if (pattern.test(content)) {
      throw new Error(`Unsafe article content in "${slug}": ${reason}`);
    }
  }

  const decoded = decodeForSchemeScan(content);
  if (decoded !== content) {
    for (const { pattern, reason } of obfuscatedSchemePatterns) {
      if (pattern.test(decoded)) {
        throw new Error(`Unsafe article content in "${slug}": ${reason}`);
      }
    }
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile() && entry.name !== 'index.mdx' && entry.name !== 'index.md') {
      const ext = path.extname(entry.name).toLowerCase();
      if (!allowedAssetExtensions.has(ext)) {
        throw new Error(`Unsupported asset type in "${srcPath}". Allowed: ${Array.from(allowedAssetExtensions).join(', ')}`);
      }
      const stat = fs.statSync(srcPath);
      if (stat.size > maxAssetBytes) {
        throw new Error(`Asset too large in "${srcPath}". Maximum size is ${maxAssetBytes} bytes.`);
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function main() {
  if (!fs.existsSync(sourceRoot)) {
    fs.mkdirSync(path.dirname(cacheArticlesRoot), { recursive: true });
    if (!fs.existsSync(cacheArticlesRoot)) {
      execFileSync('git', [
        'clone',
        '--depth=1',
        '--branch',
        articlesRepoRef,
        'https://github.com/e35ventura/taopedia-articles.git',
        cacheArticlesRoot,
      ], { stdio: 'inherit' });
    } else {
      execFileSync('git', ['-C', cacheArticlesRoot, 'fetch', '--depth=1', 'origin', articlesRepoRef], { stdio: 'inherit' });
      execFileSync('git', ['-C', cacheArticlesRoot, 'checkout', '--detach', 'FETCH_HEAD'], { stdio: 'inherit' });
    }
    sourceRoot = path.join(cacheArticlesRoot, 'content', 'pages');
  }

  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Article source not found: ${sourceRoot}`);
  }

  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(targetRoot, { recursive: true });

  let synced = 0;
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const slug = entry.name;
    validateSlug(slug);
    const sourceDir = path.join(sourceRoot, slug);
    const sourceFile = path.join(sourceDir, 'index.mdx');
    if (!fs.existsSync(sourceFile)) continue;

    const raw = fs.readFileSync(sourceFile, 'utf8');
    validateArticleContent(slug, raw);
    const parsed = matter(raw);
    if (!isPublishedArticle(parsed.data)) continue;

    const data = { ...parsed.data, categories: toCategories(parsed.data) };
    delete data.category;
    delete data.tags;

    const targetDir = path.join(targetRoot, slug);
    fs.mkdirSync(targetDir, { recursive: true });
    copyDir(sourceDir, targetDir);
    fs.writeFileSync(path.join(targetDir, 'index.mdx'), matter.stringify(parsed.content, data));
    synced += 1;
  }

  console.log(`Synced ${synced} published articles from taopedia-articles`);
}

// Only run the sync when executed directly, so tests can import the validators.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
