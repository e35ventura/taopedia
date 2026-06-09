import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryFromRouteSegment, categoryHref, categoryToRouteSegment } from './category-routes.js';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
const tempRoot = path.join(projectRoot, '.tmp', 'category-route-check');
const fixtureArticlesRoot = path.join(tempRoot, 'articles');
const fixturePageRoot = path.join(fixtureArticlesRoot, 'content', 'pages', 'reserved_category');
const contentRoot = path.join(projectRoot, 'src', 'content', 'pages');
const backupContentRoot = path.join(tempRoot, 'pages-backup');
const outputRoot = path.join(tempRoot, 'dist');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const cases = [
  ['Smart Contracts', 'Smart_Contracts'],
  ['Cold/Hot Keys', 'Cold~2f~Hot_Keys'],
  ['TAO & Alpha', 'TAO_~26~_Alpha'],
  ['Consensus?Weights', 'Consensus~3f~Weights'],
  ['Root#Subnet', 'Root~23~Subnet'],
  ['EVM+Contracts', 'EVM~2b~Contracts'],
  ['Literal_Underscore', 'Literal~5f~Underscore'],
];

function restoreContent() {
  fs.rmSync(contentRoot, { recursive: true, force: true });
  if (fs.existsSync(backupContentRoot)) {
    fs.cpSync(backupContentRoot, contentRoot, { recursive: true });
  }
}

for (const [category, segment] of cases) {
  assert.equal(categoryToRouteSegment(category), segment);
  assert.equal(categoryFromRouteSegment(segment), category);
  assert.equal(categoryHref(category), `/wiki/category/${segment}`);
  assert.doesNotMatch(segment, /[%/?#&+]/, `${category} includes a reserved route character`);
}

fs.rmSync(tempRoot, { recursive: true, force: true });
fs.mkdirSync(fixturePageRoot, { recursive: true });
if (fs.existsSync(contentRoot)) {
  fs.cpSync(contentRoot, backupContentRoot, { recursive: true });
}

try {
  fs.writeFileSync(
    path.join(fixturePageRoot, 'index.mdx'),
    `---
title: Reserved Category Fixture
category: Cold/Hot Keys
summary: Demonstrates reserved category route generation.
---

Fixture content.
`
  );

  execFileSync('node', ['scripts/sync-articles.js'], {
    cwd: projectRoot,
    env: { ...process.env, TAOPEDIA_ARTICLES_DIR: fixtureArticlesRoot },
    stdio: 'inherit',
  });

  execFileSync(npmCommand, ['exec', 'astro', '--', 'build', '--outDir', outputRoot], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  const fixtureSegment = categoryToRouteSegment('Cold/Hot Keys');
  const categoryHtmlPath = path.join(outputRoot, 'wiki', 'category', fixtureSegment, 'index.html');
  const articleHtmlPath = path.join(outputRoot, 'wiki', 'reserved_category', 'index.html');

  assert.ok(fs.existsSync(categoryHtmlPath), `Expected built category page at ${categoryHtmlPath}`);
  assert.ok(fs.existsSync(articleHtmlPath), `Expected built article page at ${articleHtmlPath}`);

  const articleHtml = fs.readFileSync(articleHtmlPath, 'utf8');
  assert.match(articleHtml, new RegExp(`href="/wiki/category/${fixtureSegment}"`));
  assert.doesNotMatch(articleHtml, /Cold%252fHot_Keys|Cold%252FHot_Keys|Cold\/Hot_Keys/);
} finally {
  restoreContent();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('Category route checks passed');
