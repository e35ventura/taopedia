import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import slugMap from '../public/data/slugmap.json' with { type: 'json' };
import categoriesIndex from '../public/data/categories.json' with { type: 'json' };
import { buildSubnetsFromSlugMap } from './subnets.js';
import { formatRevisionDate } from '../src/lib/format-date.js';

const distHome = path.join(process.cwd(), 'dist', 'index.html');
assert.ok(fs.existsSync(distHome), 'dist/index.html not found; run the build first');

const html = fs.readFileSync(distHome, 'utf8');
assert.ok(html.includes('data-home-snapshot'), 'homepage must render the At a glance snapshot');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expectSnapshotRow(label, value) {
  const pattern = new RegExp(
    `<div class="home-snapshot-item"[^>]*>[\\s\\S]*?<dt[^>]*>${escapeRegExp(label)}</dt>[\\s\\S]*?<dd[^>]*>${escapeRegExp(value)}</dd>`,
  );
  assert.match(html, pattern, `homepage snapshot must render ${label} = ${value}`);
}

const articleCount = Object.keys(slugMap).length.toLocaleString('en-US');
const topicCount = Object.keys(categoriesIndex).length.toLocaleString('en-US');
const subnetCount = buildSubnetsFromSlugMap(slugMap).length.toLocaleString('en-US');

let latestUpdate = '';
const historyDir = path.join(process.cwd(), 'public', 'history');
for (const file of fs.readdirSync(historyDir)) {
  if (!file.endsWith('.json')) continue;
  const history = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8')).history ?? [];
  const date = history[0]?.date ?? '';
  if (date > latestUpdate) latestUpdate = date;
}
assert.ok(latestUpdate, 'expected at least one article history date');
const latestUpdateLabel = formatRevisionDate(latestUpdate);

expectSnapshotRow('Articles', articleCount);
expectSnapshotRow('Topics', topicCount);
expectSnapshotRow('Subnets', subnetCount);
expectSnapshotRow('Latest update', latestUpdateLabel);

console.log(
  `Home snapshot check passed (${articleCount} articles, ${topicCount} topics, ${subnetCount} subnets, latest ${latestUpdateLabel})`,
);
