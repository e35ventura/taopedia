/*
  Fetches article content from a separate repo into this project's src/content/pages/.

  Configuration via environment variables:
    - ARTICLES_REPO (required): Git URL of the articles repo.
        Examples:
          Public:  https://github.com/OWNER/REPO.git
          Private: https://oauth2:${GITHUB_TOKEN}@github.com/OWNER/REPO.git
    - ARTICLES_REF (optional): Git ref to checkout (branch/tag/sha). Default: main
    - CONTENT_SUBDIR (optional): Path inside the articles repo to copy from. Default: src/content/pages
    - DEST_DIR (optional): Destination path in this repo. Default: src/content/pages

  Notes:
    - Uses a shallow clone for speed.
    - Replaces DEST_DIR with content from the external repo.
*/

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const REPO = process.env.ARTICLES_REPO;
const REF = process.env.ARTICLES_REF || 'main';
const SUBDIR = process.env.CONTENT_SUBDIR || 'src/content/pages';
const DEST = process.env.DEST_DIR || 'src/content/pages';

if (!REPO) {
  console.warn('[fetch-content] ARTICLES_REPO is not set. Skipping external content fetch.');
  process.exit(0);
}

const CWD = process.cwd();
const CACHE_ROOT = path.join(CWD, '.cache');
const CLONE_DIR = path.join(CACHE_ROOT, 'articles');

function run(cmd, opts = {}) {
  console.log(`[fetch-content] $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function rimraf(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`[fetch-content] Source directory does not exist: ${src}`);
  }
  ensureDir(path.dirname(dest));
  rimraf(dest);
  fs.cpSync(src, dest, { recursive: true });
}

try {
  ensureDir(CACHE_ROOT);
  rimraf(CLONE_DIR);

  // Build clone URL (supports tokens embedded in ARTICLES_REPO)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'articles-'));
  const cloneCmd = `git clone --depth=1 --no-tags --branch ${REF} ${REPO} ${JSON.stringify(tmp)}`;
  run(cloneCmd);

  // Copy from SUBDIR to DEST
  const srcDir = path.join(tmp, SUBDIR);
  const destDir = path.join(CWD, DEST);
  copyDir(srcDir, destDir);

  console.log(`[fetch-content] Copied ${srcDir} -> ${destDir}`);
} catch (err) {
  console.error('[fetch-content] Failed to fetch external content:', err?.message || err);
  process.exitCode = 1;
}
