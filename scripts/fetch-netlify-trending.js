import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outputPath = path.join(projectRoot, 'src', 'data', 'trending-pages.json');

const siteId = process.env.NETLIFY_SITE_ID || '2e062649-545f-4a02-9886-a816e5b58c01';
const authToken = process.env.NETLIFY_AUTH_TOKEN;
const periodDays = Number.parseInt(process.env.NETLIFY_ANALYTICS_DAYS || '30', 10);
const limit = Number.parseInt(process.env.NETLIFY_ANALYTICS_LIMIT || '50', 10);
const timezone = process.env.NETLIFY_ANALYTICS_TIMEZONE || '-0500';

function writeTrending(entries, status, reason) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const payload = {
    source: 'netlify',
    status,
    reason,
    generatedAt: new Date().toISOString(),
    periodDays,
    entries,
  };
  fs.writeFileSync(`${outputPath}.tmp`, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(`${outputPath}.tmp`, outputPath);
}

function slugFromResource(resource) {
  if (typeof resource !== 'string') return null;

  let pathname;
  try {
    pathname = new URL(resource, 'https://taopedia.org').pathname;
  } catch {
    pathname = resource.split('?')[0].split('#')[0];
  }

  const normalized = pathname
    .replace(/\/index\.html$/, '/')
    .replace(/\.html$/, '')
    .replace(/\/+$/, '');

  const match = normalized.match(/^\/wiki\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function main() {
  if (!authToken) {
    writeTrending([], 'skipped', 'NETLIFY_AUTH_TOKEN is not set');
    console.log('Skipped Netlify trending fetch: NETLIFY_AUTH_TOKEN is not set');
    return;
  }

  const to = Date.now();
  const from = to - Math.max(periodDays, 1) * 24 * 60 * 60 * 1000;
  const params = new URLSearchParams({
    from: String(from),
    to: String(to),
    timezone,
    limit: String(Math.max(limit, 1)),
  });
  const url = `https://analytics.services.netlify.com/v2/${siteId}/ranking/pages?${params}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      writeTrending([], 'error', `Netlify analytics returned HTTP ${response.status}`);
      console.warn(`Netlify trending fetch failed: HTTP ${response.status}`);
      return;
    }

    const body = await response.json();
    const rawEntries = Array.isArray(body?.data) ? body.data : [];
    const entries = rawEntries
      .map((entry) => {
        const slug = slugFromResource(entry.resource);
        if (!slug) return null;
        return {
          slug,
          path: `/wiki/${slug}`,
          views: Number(entry.count) || 0,
        };
      })
      .filter(Boolean)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    writeTrending(entries, 'ok', entries.length ? undefined : 'No wiki article pages found in Netlify top pages');
    console.log(`Fetched ${entries.length} Netlify trending article page${entries.length === 1 ? '' : 's'}`);
  } catch (error) {
    writeTrending([], 'error', error instanceof Error ? error.message : String(error));
    console.warn(`Netlify trending fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await main();
