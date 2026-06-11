#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const BUILD_RELEVANT_PATTERNS = [
  /^astro\.config\.mjs$/,
  /^netlify\.toml$/,
  /^package(?:-lock)?\.json$/,
  /^tsconfig\.json$/,
  /^public\//,
  /^src\//,
  /^scripts\//,
  /^netlify\//,
];

function changedFiles() {
  const commit = process.env.COMMIT_REF || 'HEAD';
  const cached = process.env.CACHED_COMMIT_REF;

  if (!cached || /^0+$/.test(cached)) {
    return execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', commit], {
      encoding: 'utf8',
    });
  }

  return execFileSync('git', ['diff', '--name-only', cached, commit], { encoding: 'utf8' });
}

let files;
try {
  files = changedFiles()
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
} catch (error) {
  console.log('Could not inspect changed files; running Netlify build.');
  process.exit(1);
}

if (files.length === 0) {
  console.log('No changed files detected; skipping Netlify build.');
  process.exit(0);
}

const relevantFiles = files.filter((file) =>
  BUILD_RELEVANT_PATTERNS.some((pattern) => pattern.test(file)),
);

if (relevantFiles.length === 0) {
  console.log('Only non-site files changed; skipping Netlify build.');
  console.log(files.join('\n'));
  process.exit(0);
}

console.log('Site-affecting files changed; running Netlify build.');
console.log(relevantFiles.join('\n'));
process.exit(1);
