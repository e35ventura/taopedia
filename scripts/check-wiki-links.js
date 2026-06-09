import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const distWikiDir = path.join(process.cwd(), 'dist', 'wiki');
const slugMapPath = path.join(process.cwd(), 'public', 'data', 'slugmap.json');

function walkHtmlFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtmlFiles(filePath, fileList);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

function normalizeHrefSlug(rawSlug) {
  try {
    return decodeURIComponent(rawSlug).replace(/^\/+|\/+$/g, '');
  } catch {
    return rawSlug.replace(/^\/+|\/+$/g, '');
  }
}

assert.ok(fs.existsSync(distWikiDir), 'dist/wiki must exist; run npm run build first');
assert.ok(fs.existsSync(slugMapPath), 'public/data/slugmap.json must exist; run npm run build first');

const slugMap = JSON.parse(fs.readFileSync(slugMapPath, 'utf8'));
const htmlFiles = walkHtmlFiles(distWikiDir);
const pipeHrefMatches = [];
const knownSlugMarkedNew = [];

for (const filePath of htmlFiles) {
  const relativePath = path.relative(process.cwd(), filePath);
  const html = fs.readFileSync(filePath, 'utf8');

  for (const match of html.matchAll(/href="\/wiki\/[^"]*\|[^"]*"/g)) {
    pipeHrefMatches.push(`${relativePath}: ${match[0]}`);
  }

  for (const match of html.matchAll(/<a\b[^>]*>/g)) {
    const anchor = match[0];
    const classMatch = anchor.match(/\bclass="([^"]*)"/);
    const hrefMatch = anchor.match(/\bhref="\/wiki\/([^"#?]+)[^"]*"/);
    if (!classMatch || !hrefMatch) continue;

    const classes = classMatch[1].split(/\s+/);
    if (!classes.includes('internal') || !classes.includes('new')) continue;

    const slug = normalizeHrefSlug(hrefMatch[1]);
    if (Object.prototype.hasOwnProperty.call(slugMap, slug)) {
      knownSlugMarkedNew.push(`${relativePath}: ${anchor}`);
    }
  }
}

assert.equal(
  pipeHrefMatches.length,
  0,
  `rendered wiki hrefs must not contain pipe aliases:\n${pipeHrefMatches.slice(0, 10).join('\n')}`
);

assert.equal(
  knownSlugMarkedNew.length,
  0,
  `known wiki slugs must not be rendered as missing links:\n${knownSlugMarkedNew.slice(0, 10).join('\n')}`
);

const alphaTokensHtml = path.join(distWikiDir, 'alpha_tokens', 'index.html');
if (fs.existsSync(alphaTokensHtml) && Object.prototype.hasOwnProperty.call(slugMap, 'dynamic_tao')) {
  const html = fs.readFileSync(alphaTokensHtml, 'utf8');
  assert.match(html, /href="\/wiki\/dynamic_tao"/, 'alpha_tokens must link to the canonical dynamic_tao slug');
  assert.doesNotMatch(html, /href="\/wiki\/dynamic_tao\|/, 'alpha_tokens must not render the pipe alias in hrefs');
  assert.doesNotMatch(
    html,
    /<a\b(?=[^>]*class="[^"]*\binternal\b[^"]*\bnew\b[^"]*")(?=[^>]*href="\/wiki\/dynamic_tao")[^>]*>/,
    'alpha_tokens must not mark dynamic_tao as a missing link'
  );
}

console.log('Wiki link rendering check passed');
