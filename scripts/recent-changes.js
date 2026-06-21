// Build the machine-readable recent-changes feed served at
// /wiki/special/recentchanges.json. Kept as a thin wrapper around
// src/lib/recent-changes.js's `collectRecentChanges` (the pure builder the
// HTML Special:RecentChanges page and the build-time article-history helper
// also use), so the Astro endpoint and the regression check share one source
// of truth without rendering the site.
//
// The HTML Special:RecentChanges page (src/pages/wiki/special/recentchanges.astro)
// and this builder both call `collectRecentChanges` from src/lib/recent-changes.js
// with the same per-slug history map, the same title map, and the same limit
// (RECENT_LIMIT = 100 in recentchanges.astro), so the JSON and HTML surfaces
// never disagree on which changes are listed, what their order is, or what
// the per-row slug/title/date/author fields are. The script-side wrapper just
// reads the public/history/*.json files (the same source
// src/lib/article-history.ts imports via import.meta.glob at Astro build time)
// and the public/data/slugmap.json (the same source the rest of the build
// consumes), so no new data pipeline is added.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRecentChanges } from '../src/lib/recent-changes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const HISTORY_DIR = path.join(projectRoot, 'public', 'history');
const SLUGMAP_FILE = path.join(projectRoot, 'public', 'data', 'slugmap.json');

export { collectRecentChanges };
export const RECENT_LIMIT = 100;

// Load every per-slug history file and the slug map from disk, then call the
// shared `collectRecentChanges` builder. Pure: no I/O side effects, no
// environment reads, no clock — the same input always produces the same
// output, so the regression check can pin a specific expected feed.
export function buildRecentChanges({ historyBySlug, titleBySlug, limit }) {
  return collectRecentChanges(historyBySlug, titleBySlug, limit);
}

// Convenience: load the published history + slug map from disk and return the
// builder input + the call result. Used by the Astro endpoint (which has
// `import.meta.glob` for history) and by the regression check (which can
// only import a `.js` builder — see the comment at the top of this file).
//
// The slug map on disk is `{ slug: { title, categories, summary } }`; this
// helper extracts the bare title string into `titleBySlug` (matching the
// `Record<string, string>` shape `collectRecentChanges` expects) and keeps
// the full slug map under `slugMap` for callers that want the category /
// summary fields.
export function buildRecentChangesFromDisk({ limit = RECENT_LIMIT, historyDir = HISTORY_DIR, slugMapFile = SLUGMAP_FILE } = {}) {
  if (!fs.existsSync(historyDir) || !fs.existsSync(slugMapFile)) {
    return { historyBySlug: {}, titleBySlug: {}, slugMap: {}, changes: [] };
  }
  const slugMap = JSON.parse(fs.readFileSync(slugMapFile, 'utf8'));
  const titleBySlug = {};
  for (const [slug, entry] of Object.entries(slugMap)) {
    if (entry && typeof entry.title === 'string') titleBySlug[slug] = entry.title;
  }
  const historyBySlug = {};
  for (const file of fs.readdirSync(historyDir)) {
    if (!file.endsWith('.json')) continue;
    const slug = file.replace(/\.json$/, '');
    const history = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8')).history || [];
    if (Array.isArray(history) && history.length > 0) historyBySlug[slug] = history;
  }
  return { historyBySlug, titleBySlug, slugMap, changes: collectRecentChanges(historyBySlug, titleBySlug, limit) };
}
