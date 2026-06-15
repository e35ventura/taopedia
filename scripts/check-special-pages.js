import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wikiDir = path.join(path.resolve(__dirname, '..'), 'dist', 'wiki');
const hubFile = path.join(wikiDir, 'special', 'index.html');

assert.ok(fs.existsSync(hubFile), 'dist/wiki/special/index.html not found; run the build first');
const html = fs.readFileSync(hubFile, 'utf8');

// Every special page the hub advertises must (a) be linked and (b) resolve to a
// page that actually built, so the directory can never list a dead link.
const linkedSpecials = ['allpages', 'categories', 'mostlinkedpages', 'recentchanges', 'statistics', 'random'];
for (const name of linkedSpecials) {
  assert.ok(
    html.includes(`href="/wiki/special/${name}/"`),
    `Special pages hub must link to /wiki/special/${name}/`,
  );
  assert.ok(
    fs.existsSync(path.join(wikiDir, 'special', name, 'index.html')),
    `linked special page /wiki/special/${name}/ did not build`,
  );
}

// The four per-article tools must be listed so readers can discover them.
for (const tool of ['History', 'What links here', 'Cite this page', 'Page information']) {
  assert.ok(html.includes(tool), `Special pages hub must list the "${tool}" article tool`);
}

// Count the real built article pages — same method as check-statistics.js:
// catch-all article routes, excluding the category/special hubs and each
// article's history/backlinks/cite/info subpages.
const countArticles = (dir) => {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) n += countArticles(full);
    else if (entry.name === 'index.html') {
      const segs = path.relative(wikiDir, full).split(path.sep);
      if (segs.length < 2) continue;
      if (segs[0] === 'category' || segs[0] === 'special') continue;
      const parent = segs[segs.length - 2];
      if (parent === 'history' || parent === 'backlinks' || parent === 'cite' || parent === 'info') continue;
      n += 1;
    }
  }
  return n;
};
const actualArticles = countArticles(wikiDir);
assert.ok(actualArticles > 0, 'no built article pages found to count');

// Count the real built topic hubs (one /wiki/category/<Topic>/ per topic).
const categoryDir = path.join(wikiDir, 'category');
const actualTopics = fs.existsSync(categoryDir)
  ? fs.readdirSync(categoryDir, { withFileTypes: true }).filter(
      (e) => e.isDirectory() && fs.existsSync(path.join(categoryDir, e.name, 'index.html')),
    ).length
  : 0;
assert.ok(actualTopics > 0, 'no built topic hubs found to count');

// The advertised counts must match reality (comma-formatted, e.g. "266 articles").
const shownCount = (unit) => {
  const m = html.match(new RegExp(`>([\\d,]+) ${unit}<`));
  return m ? Number(m[1].replace(/,/g, '')) : null;
};
assert.equal(
  shownCount('articles'),
  actualArticles,
  `hub "articles" count (${shownCount('articles')}) must equal the built article count (${actualArticles})`,
);
assert.equal(
  shownCount('topics'),
  actualTopics,
  `hub "topics" count (${shownCount('topics')}) must equal the built topic-hub count (${actualTopics})`,
);

// The hub must be reachable: the shared footer links to it on every page.
const footerSample = fs.readFileSync(
  path.join(wikiDir, 'special', 'statistics', 'index.html'),
  'utf8',
);
assert.ok(
  footerSample.includes('href="/wiki/special/"'),
  'footer must link to the Special pages hub (/wiki/special/)',
);

console.log(
  `Special pages check passed (${linkedSpecials.length} special pages linked and built; ` +
    `${actualArticles} articles, ${actualTopics} topics; footer discovery present)`,
);
