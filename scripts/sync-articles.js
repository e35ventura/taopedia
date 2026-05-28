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

const alwaysInclude = new Set(['taopedia']);
const bittensorCategories = new Set([
  'Bittensor',
  'Consensus',
  'Staking',
  'Subnets',
  'Tokenomics',
  'Wallets',
]);

function isBittensorArticle(slug, data) {
  if (alwaysInclude.has(slug)) return true;
  const tags = Array.isArray(data.tags) ? data.tags : [];
  return tags.includes('Bittensor') || bittensorCategories.has(data.category);
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

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile() && entry.name !== 'index.mdx') {
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
  const sourceDir = path.join(sourceRoot, slug);
  const sourceFile = path.join(sourceDir, 'index.mdx');
  if (!fs.existsSync(sourceFile)) continue;

  const parsed = matter(fs.readFileSync(sourceFile, 'utf8'));
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
