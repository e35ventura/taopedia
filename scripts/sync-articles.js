import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const defaultArticlesRoot = path.resolve(projectRoot, '..', 'taopedia-articles');
const articlesRoot = process.env.TAOPEDIA_ARTICLES_DIR
  ? path.resolve(process.env.TAOPEDIA_ARTICLES_DIR)
  : defaultArticlesRoot;
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
  { pattern: /<\s*(iframe|object|embed|link|meta|style)\b/i, reason: 'active HTML elements are not allowed in article content' },
  { pattern: /\son[a-z]+\s*=/i, reason: 'inline event handlers are not allowed in article content' },
  { pattern: /\bjavascript\s*:/i, reason: 'javascript: URLs are not allowed in article content' },
  { pattern: /\bdata\s*:\s*text\/html/i, reason: 'HTML data URLs are not allowed in article content' },
  { pattern: /\bset:html\b/i, reason: 'raw HTML injection directives are not allowed in article content' },
  { pattern: /\bclient:[a-z-]+\b/i, reason: 'client directives are not allowed in article content' },
];

const alwaysInclude = new Set(['taopedia']);

function isBittensorArticle(slug, data) {
  if (data.draft === true) return false;
  if (alwaysInclude.has(slug)) return true;
  const tags = Array.isArray(data.tags) ? data.tags : [];
  return tags.includes('Bittensor');
}

function toCategories(data) {
  const categories = [];
  if (typeof data.category === 'string' && data.category.trim()) {
    categories.push(data.category.trim());
  }
  if (Array.isArray(data.tags)) {
    categories.push(...data.tags.filter((tag) => typeof tag === 'string' && tag.trim()));
  }
  return Array.from(new Set(categories));
}

function validateSlug(slug) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
    throw new Error(`Unsafe article slug "${slug}". Use lowercase letters, numbers, underscores, and hyphens.`);
  }
}

function validateArticleContent(slug, content) {
  for (const { pattern, reason } of unsafeContentPatterns) {
    if (pattern.test(content)) {
      throw new Error(`Unsafe article content in "${slug}": ${reason}`);
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
    } else if (entry.isFile() && entry.name !== 'index.mdx') {
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

if (!fs.existsSync(sourceRoot)) {
  fs.mkdirSync(path.dirname(cacheArticlesRoot), { recursive: true });
  if (!fs.existsSync(cacheArticlesRoot)) {
    execFileSync('git', [
      'clone',
      '--depth=1',
      'https://github.com/e35ventura/taopedia-articles.git',
      cacheArticlesRoot,
    ], { stdio: 'inherit' });
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
  if (!isBittensorArticle(slug, parsed.data)) continue;

  const data = { ...parsed.data, categories: toCategories(parsed.data) };
  delete data.category;
  delete data.tags;

  const targetDir = path.join(targetRoot, slug);
  fs.mkdirSync(targetDir, { recursive: true });
  copyDir(sourceDir, targetDir);
  fs.writeFileSync(path.join(targetDir, 'index.mdx'), matter.stringify(parsed.content, data));
  synced += 1;
}

console.log(`Synced ${synced} Bittensor-focused articles from taopedia-articles`);
