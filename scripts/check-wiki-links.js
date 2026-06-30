import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { slugFromWikiHref } from '../src/lib/wiki-article-path.js';

const distWikiDir = path.join(process.cwd(), 'dist', 'wiki');
const slugMapPath = path.join(process.cwd(), 'public', 'data', 'slugmap.json');
const linkGraphPath = path.join(process.cwd(), 'public', 'data', 'linkgraph.json');

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

assert.ok(fs.existsSync(distWikiDir), 'dist/wiki must exist; run npm run build first');
assert.ok(fs.existsSync(slugMapPath), 'public/data/slugmap.json must exist; run npm run build first');
assert.ok(fs.existsSync(linkGraphPath), 'public/data/linkgraph.json must exist; run npm run build first');

const slugMap = JSON.parse(fs.readFileSync(slugMapPath, 'utf8'));
const linkGraph = JSON.parse(fs.readFileSync(linkGraphPath, 'utf8'));
const htmlFiles = walkHtmlFiles(distWikiDir);
const pipeHrefMatches = [];
const doubleSlashWikiHrefs = [];
const knownSlugMarkedNew = [];
const rawInfoboxWikiLinks = [];

for (const filePath of htmlFiles) {
  const relativePath = path.relative(process.cwd(), filePath);
  const html = fs.readFileSync(filePath, 'utf8');

  for (const match of html.matchAll(/href="\/wiki\/[^"]*\|[^"]*"/g)) {
    pipeHrefMatches.push(`${relativePath}: ${match[0]}`);
  }

  for (const match of html.matchAll(/href="\/wiki\/\/[^"]*"/g)) {
    doubleSlashWikiHrefs.push(`${relativePath}: ${match[0]}`);
  }

  for (const match of html.matchAll(/<aside class="infobox"[^>]*>[\s\S]*?<\/aside>/g)) {
    const infobox = match[0];
    for (const wikiLink of infobox.matchAll(/\[\[[^\]]+\]\]/g)) {
      rawInfoboxWikiLinks.push(`${relativePath}: ${wikiLink[0]}`);
    }
  }

  for (const match of html.matchAll(/<a\b[^>]*>/g)) {
    const anchor = match[0];
    const classMatch = anchor.match(/\bclass="([^"]*)"/);
    const hrefMatch = anchor.match(/\bhref="(\/wiki\/[^"]+)"/);
    if (!classMatch || !hrefMatch) continue;

    const classes = classMatch[1].split(/\s+/);
    if (!classes.includes('internal') || !classes.includes('new')) continue;

    const slug = slugFromWikiHref(hrefMatch[1]);
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
  doubleSlashWikiHrefs.length,
  0,
  `rendered wiki hrefs must not contain a double slash after /wiki/:\n${doubleSlashWikiHrefs.slice(0, 10).join('\n')}`
);

assert.equal(
  knownSlugMarkedNew.length,
  0,
  `known wiki slugs must not be rendered as missing links:\n${knownSlugMarkedNew.slice(0, 10).join('\n')}`
);

assert.equal(
  rawInfoboxWikiLinks.length,
  0,
  `infobox wiki links must render as links, not raw markup:\n${rawInfoboxWikiLinks.slice(0, 10).join('\n')}`
);

const alphaTokensHtml = path.join(distWikiDir, 'alpha_tokens', 'index.html');
if (fs.existsSync(alphaTokensHtml) && Object.prototype.hasOwnProperty.call(slugMap, 'dynamic_tao')) {
  const html = fs.readFileSync(alphaTokensHtml, 'utf8');
  const infoboxMatch = html.match(/<aside class="infobox"[^>]*>[\s\S]*?<\/aside>/);
  const infobox = infoboxMatch ? infoboxMatch[0] : '';

  assert.match(html, /href="\/wiki\/dynamic_tao\/"/, 'alpha_tokens must link to the canonical dynamic_tao slug');
  assert.match(
    infobox,
    /href="\/wiki\/dynamic_tao\/"/,
    'alpha_tokens infobox must link to the canonical dynamic_tao slug'
  );
  assert.doesNotMatch(html, /href="\/wiki\/dynamic_tao\|/, 'alpha_tokens must not render the pipe alias in hrefs');
  assert.doesNotMatch(
    html,
    /<a\b(?=[^>]*class="[^"]*\binternal\b[^"]*\bnew\b[^"]*")(?=[^>]*href="\/wiki\/dynamic_tao\/")[^>]*>/,
    'alpha_tokens must not mark dynamic_tao as a missing link'
  );
}

const dendriteHtml = path.join(distWikiDir, 'dendrite', 'index.html');
if (fs.existsSync(dendriteHtml) && Object.prototype.hasOwnProperty.call(slugMap, 'synapse')) {
  const html = fs.readFileSync(dendriteHtml, 'utf8');
  const infoboxMatch = html.match(/<aside class="infobox"[^>]*>[\s\S]*?<\/aside>/);
  const infobox = infoboxMatch ? infoboxMatch[0] : '';

  assert.match(
    infobox,
    /<th scope="row">Message object<\/th>\s*<td>\s*<a class="internal" href="\/wiki\/synapse\/">Synapse<\/a>\s*<\/td>/,
    'dendrite infobox must render its exact local Message object value as an internal synapse link'
  );
}

const delegateHtml = path.join(distWikiDir, 'delegate', 'index.html');
if (fs.existsSync(delegateHtml) && Object.prototype.hasOwnProperty.call(slugMap, 'subnet_validator')) {
  const html = fs.readFileSync(delegateHtml, 'utf8');
  const infoboxMatch = html.match(/<aside class="infobox"[^>]*>[\s\S]*?<\/aside>/);
  const infobox = infoboxMatch ? infoboxMatch[0] : '';

  assert.match(
    infobox,
    /<th scope="row">Role<\/th>\s*<td>\s*<a class="internal" href="\/wiki\/subnet_validator\/">Subnet validator<\/a>\s*<\/td>/,
    'delegate infobox must render its exact local Role value as an internal subnet_validator link'
  );
}

assert.ok(
  (linkGraph.axon || []).some((link) => link.target === 'subnet_protocol' && link.text === 'Subnet Protocol'),
  'axon linkgraph must include its infobox relationship to subnet_protocol'
);

console.log('Wiki link rendering check passed');
