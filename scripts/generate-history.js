import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const contentDir = path.join(projectRoot, 'src', 'content', 'pages');
const outputDir = path.join(projectRoot, 'public', 'history');

// Articles are synced from an external repo (see scripts/sync-articles.js), so
// their real edit history lives there, not in this repo. Resolve the same
// source sync-articles uses and read git history from it; fall back to this
// repo only if no source checkout is present.
const articlesRoot = process.env.TAOPEDIA_ARTICLES_DIR
  ? path.resolve(process.env.TAOPEDIA_ARTICLES_DIR)
  : path.resolve(projectRoot, '..', 'taopedia-articles');
const cacheArticlesRoot = path.join(projectRoot, '.cache', 'taopedia-articles');

function resolveArticlesRepoRoot() {
  for (const root of [articlesRoot, cacheArticlesRoot]) {
    if (fs.existsSync(path.join(root, 'content', 'pages'))) return root;
  }
  return null;
}

const articlesRepoRoot = resolveArticlesRepoRoot();
console.log(
  articlesRepoRoot
    ? `Reading history from article repo: ${articlesRepoRoot}`
    : 'No article source checkout found; falling back to this repo for history.'
);

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function getGitHistory(repoCwd, gitPath) {
  try {
    const logOutput = execFileSync(
      'git',
      ['log', '--follow', '--pretty=format:%H|%an|%ae|%at|%s', '--', gitPath],
      { encoding: 'utf-8', cwd: repoCwd }
    );

    if (!logOutput) return [];

    return logOutput.split('\n').map(line => {
      // Split into at most 5 fields so a '|' inside the commit subject (the
      // last field) does not corrupt parsing.
      const parts = line.split('|');
      const [sha, authorName, authorEmail, timestamp] = parts;
      const message = parts.slice(4).join('|');
      return {
        sha,
        authorName,
        authorEmail,
        timestamp: parseInt(timestamp, 10),
        date: new Date(parseInt(timestamp, 10) * 1000).toISOString(),
        message,
      };
    });
  } catch (error) {
    console.warn(`No git history for ${gitPath}:`, error.message);
    return [];
  }
}

function walkDirectory(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDirectory(filePath, fileList);
    } else if (
      file === 'index.md' ||
      file === 'index.mdx' ||
      file.endsWith('.md') ||
      file.endsWith('.mdx')
    ) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

console.log('Generating article history from Git...');

const markdownFiles = walkDirectory(contentDir);

// Collected across all articles to build a merged, time-sorted recent-changes feed.
const allChanges = [];

// Cap on the merged feed so the JSON (and the RSS endpoint that reads it) stay small.
const RECENT_CHANGES_LIMIT = 100;

function getTitle(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return matter(raw).data.title || fallback;
  } catch (error) {
    return fallback;
  }
}

markdownFiles.forEach(filePath => {
  const relativePath = path.relative(contentDir, filePath);
  const slug = path.dirname(relativePath).replace(/\\/g, '/');

  // Prefer the article source repo (where edits actually happen); the synced
  // copy in this repo carries no meaningful history.
  const history = articlesRepoRoot
    ? getGitHistory(articlesRepoRoot, `content/pages/${slug}/index.mdx`)
    : getGitHistory(projectRoot, filePath);
  const title = getTitle(filePath, slug);

  const historyFile = path.join(outputDir, `${slug}.json`);
  const historyFileDir = path.dirname(historyFile);

  if (!fs.existsSync(historyFileDir)) {
    fs.mkdirSync(historyFileDir, { recursive: true });
  }

  fs.writeFileSync(historyFile, JSON.stringify({ slug, title, history }, null, 2));

  // Fold each revision into the global feed, tagged with its article.
  // Only the fields the feed/RSS render — deliberately excluding authorEmail so
  // this public, aggregated file does not expose every contributor's address.
  history.forEach(revision => {
    allChanges.push({
      slug,
      title,
      sha: revision.sha,
      authorName: revision.authorName,
      timestamp: revision.timestamp,
      date: revision.date,
      message: revision.message,
    });
  });

  console.log(`  ✓ ${slug} (${history.length} revisions)`);
});

// Most recent first, then trim to the cap.
allChanges.sort((a, b) => b.timestamp - a.timestamp);
const recentChanges = allChanges.slice(0, RECENT_CHANGES_LIMIT);

fs.writeFileSync(
  path.join(outputDir, 'recent-changes.json'),
  JSON.stringify({ generated: new Date().toISOString(), changes: recentChanges }, null, 2)
);

console.log(`✓ Generated history for ${markdownFiles.length} articles`);
console.log(`✓ Generated recent-changes feed (${recentChanges.length} of ${allChanges.length} revisions)`);
