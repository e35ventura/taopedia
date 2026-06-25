import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const wikiDir = path.join(distDir, 'wiki');

assert.ok(fs.existsSync(wikiDir), 'dist/wiki not found; run the build first');

function walkHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtmlFiles(filePath, files);
    } else if (entry.isFile() && entry.name === 'index.html') {
      files.push(filePath);
    }
  }
  return files;
}

function isArticlePage(filePath) {
  const segs = path.relative(wikiDir, filePath).split(path.sep);
  if (segs.length < 2) return false;
  if (segs[0] === 'special' || segs[0] === 'category') return false;
  return !['history', 'backlinks', 'cite', 'info'].includes(segs[segs.length - 2]);
}

const articleFiles = walkHtmlFiles(wikiDir).filter(isArticlePage);
assert.ok(articleFiles.length > 0, 'no built article pages found to verify');

let pagesWithControls = 0;
for (const filePath of articleFiles) {
  const html = fs.readFileSync(filePath, 'utf8');
  const hasControls = html.includes('class="toc-actions"');
  const tocToggleButtons = html.match(/<button[^>]*class="toc-toggle"[^>]*>/g) ?? [];
  const expandButton = html.match(/<button[^>]*class="toc-action toc-expand-all"[\s\S]*?<\/button>/)?.[0] ?? '';
  const collapseButton = html.match(/<button[^>]*class="toc-action toc-collapse-all"[\s\S]*?<\/button>/)?.[0] ?? '';

  if (!hasControls) continue;
  pagesWithControls += 1;

  assert.ok(tocToggleButtons.length > 0, `${path.relative(projectRoot, filePath)} renders bulk TOC controls without expandable TOC buttons`);
  assert.ok(
    /<button[^>]*class="toc-action toc-expand-all"[^>]*data-toc-action="expand"[^>]*aria-label="Expand all table of contents sections"/.test(html),
    `${path.relative(projectRoot, filePath)} must render the Expand all TOC control`,
  );
  assert.ok(
    /<svg[^>]*class="toc-action-icon"[\s\S]*?<\/svg>/.test(expandButton),
    `${path.relative(projectRoot, filePath)} Expand all TOC control must render as a compact icon button`,
  );
  assert.ok(
    /<button[^>]*class="toc-action toc-collapse-all"[^>]*data-toc-action="collapse"[^>]*aria-label="Collapse all table of contents sections"/.test(html),
    `${path.relative(projectRoot, filePath)} must render the Collapse all TOC control`,
  );
  assert.ok(
    /<svg[^>]*class="toc-action-icon"[\s\S]*?<\/svg>/.test(collapseButton),
    `${path.relative(projectRoot, filePath)} Collapse all TOC control must render as a compact icon button`,
  );
  assert.ok(
    !/>\s*(Expand|Collapse)\s*</.test(`${expandButton}${collapseButton}`),
    `${path.relative(projectRoot, filePath)} TOC bulk controls must not add crowded visible text labels`,
  );
  assert.ok(
    tocToggleButtons.every((button) => button.includes('aria-expanded="true"')),
    `${path.relative(projectRoot, filePath)} TOC subsection toggles must expose their initial expanded state`,
  );
}

assert.ok(pagesWithControls > 0, 'expected at least one article page with expandable TOC controls');

const layout = fs.readFileSync(path.join(projectRoot, 'src', 'layouts', 'WikiLayout.astro'), 'utf8');
assert.ok(layout.includes('function setAllTocBranches(collapsed)'), 'WikiLayout must keep a shared TOC bulk-toggle helper');
assert.ok(layout.includes('function syncTocVisibility()'), 'WikiLayout must sync TOC item visibility from collapsed state');
assert.ok(layout.includes("toggle.setAttribute('aria-expanded'"), 'TOC runtime must keep aria-expanded in sync');
assert.ok(layout.includes("tocExpandAll?.addEventListener('click'"), 'TOC runtime must wire the expand-all control');
assert.ok(layout.includes("tocCollapseAll?.addEventListener('click'"), 'TOC runtime must wire the collapse-all control');

const css = fs.readFileSync(path.join(projectRoot, 'src', 'styles', 'wikipedia.css'), 'utf8');
assert.ok(/\.toc-actions\s*\{/.test(css), 'wikipedia.css must style the TOC action group');
assert.ok(/\.toc-action\s*\{/.test(css), 'wikipedia.css must style the TOC action buttons');
assert.ok(/\.toc-action-icon\s*\{/.test(css), 'wikipedia.css must style the TOC action icons');
assert.ok(/width:\s*20px/.test(css) && /height:\s*20px/.test(css), 'TOC action buttons must have stable compact dimensions');

const astroDir = path.join(distDir, '_astro');
const shipped = fs.existsSync(astroDir)
  && fs.readdirSync(astroDir).filter((fileName) => fileName.endsWith('.css'))
    .some((fileName) => fs.readFileSync(path.join(astroDir, fileName), 'utf8').includes('.toc-actions'));
assert.ok(shipped, 'the TOC action styles must be bundled into a shipped stylesheet');

console.log(`TOC controls check passed (${pagesWithControls} article pages with expand/collapse-all controls)`);
