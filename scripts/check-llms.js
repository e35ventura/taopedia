import assert from 'node:assert/strict';
import { buildLlmsTxt } from './llms.js';

const origin = 'https://taopedia.org';

const pages = [
  { id: 'tao/index.mdx', data: { title: 'TAO', summary: 'The native token.', categories: ['Tokenomics'] } },
  { id: 'axon/index.mdx', data: { title: 'Axon', summary: 'A server endpoint.', categories: ['Networking', 'Glossary'] } },
  { id: 'draft_page/index.mdx', data: { title: 'Draft', summary: 'Hidden.', categories: ['Glossary'], draft: true } },
  { id: 'odd_[title]/index.mdx', data: { title: 'A [bracketed] title', summary: 'Edge case.', categories: ['Glossary'] } },
  { id: 'orphan/index.mdx', data: { title: 'Orphan', summary: 'No category.', categories: [] } },
];

const body = buildLlmsTxt({ origin, pages });

// Header + summary blockquote.
assert.ok(body.startsWith('# Taopedia\n'), 'must start with the H1 site title');
assert.match(body, /\n> .+\n/, 'must include a blockquote summary');

// Canonical trailing-slash article URLs (never a 301 target).
assert.match(body, /\(https:\/\/taopedia\.org\/wiki\/tao\/\): The native token\./, 'TAO entry must use the canonical URL and summary');
const wikiUrls = [...body.matchAll(/\((https:\/\/taopedia\.org\/wiki\/[^)]+)\)/g)].map((m) => m[1]);
assert.ok(wikiUrls.length > 0, 'must emit article URLs');
const slashless = wikiUrls.filter((url) => !url.endsWith('/'));
assert.equal(slashless.length, 0, `every article URL must end with a trailing slash:\n${slashless.join('\n')}`);

// Category sections; a multi-category article appears under each of its categories.
assert.match(body, /\n## Tokenomics\n/, 'must emit a section per category');
assert.match(body, /\n## Networking\n/, 'multi-category article must appear under each category');
assert.match(body, /\n## Glossary\n/, 'multi-category article must appear under each category');
const axonOccurrences = (body.match(/\[Axon\]/g) || []).length;
assert.equal(axonOccurrences, 2, 'Axon (two categories) must be listed exactly twice');

// Drafts are excluded.
assert.equal(body.includes('Draft'), false, 'draft pages must be excluded');
assert.equal(body.includes('/wiki/draft_page/'), false, 'draft URLs must be excluded');

// Uncategorized pages fall into an "Other" section, ordered last.
assert.match(body, /\n## Other\n/, 'uncategorized pages must fall into an Other section');
assert.ok(body.indexOf('## Other') > body.indexOf('## Tokenomics'), 'Other section must be ordered last');

// Markdown link text is escaped so brackets in a title do not break the link.
assert.match(body, /\[A \\\[bracketed\\\] title\]/, 'brackets in a title must be escaped');

// No undefined leaks from missing fields.
assert.equal(body.includes('undefined'), false, 'must never serialize undefined');

// Optional section pointing at secondary resources.
assert.match(body, /\n## Optional\n/, 'must include an Optional section');
assert.match(body, /\(https:\/\/taopedia\.org\/sitemap\.xml\)/, 'Optional section must link the sitemap');
// /search is disallowed by robots.txt, so the index must not point agents at it.
assert.equal(body.includes('/search'), false, 'must not link the robots-disallowed /search route');

// Deterministic: building twice yields identical output.
assert.equal(buildLlmsTxt({ origin, pages }), body, 'output must be deterministic');

console.log('llms.txt check passed');
