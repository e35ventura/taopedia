import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';

// Subscribable feed of recent edits across all articles. Built from the merged
// recent-changes.json produced by scripts/generate-history.js (prebuild), so it
// stays in sync with the Special:RecentChanges page.
const FALLBACK_SITE = 'https://taopedia.org';
const TITLE = 'Taopedia — Recent changes';
const DESCRIPTION = 'Recent edits across Taopedia articles.';

// Read the generated feed with fs (not a static `import`): the file may be
// absent before the build pipeline has run (e.g. a fresh `astro dev`), and a
// bare import of a missing module is an unrecoverable build-time error.
let changes: any[] = [];
try {
  const file = path.join(process.cwd(), 'public', 'history', 'recent-changes.json');
  changes = JSON.parse(fs.readFileSync(file, 'utf-8')).changes || [];
} catch (e) {
  // No feed generated yet; emit an empty (but valid) channel.
}

const escapeXml = (value: string) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const GET: APIRoute = (context) => {
  // Prefer the site configured in astro.config.mjs so links never drift.
  const site = context.site ? context.site.href.replace(/\/$/, '') : FALLBACK_SITE;

  const items = changes
    .map((change) => {
      const link = `${site}/wiki/${change.slug}`;
      const title = `${change.title}: ${change.message || '(no message)'}`;
      return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(change.sha)}</guid>
      <pubDate>${new Date(change.date).toUTCString()}</pubDate>
      <dc:creator>${escapeXml(change.authorName)}</dc:creator>
      <description>${escapeXml(change.message || '')}</description>
    </item>`;
    })
    .join('\n');

  const lastBuild = changes.length
    ? new Date(changes[0].date).toUTCString()
    : new Date(0).toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(TITLE)}</title>
    <link>${site}</link>
    <description>${escapeXml(DESCRIPTION)}</description>
    <language>en</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${site}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
