import fs from 'node:fs';
import path from 'node:path';

const pagefindDir = path.join(process.cwd(), 'dist', 'pagefind');

const unusedPagefindAssets = [
  'pagefind-component-ui.js',
  'pagefind-ui.js',
  'pagefind-component-ui.css',
  'pagefind-modular-ui.js',
  'pagefind-ui.css',
  'pagefind-modular-ui.css',
  'pagefind-highlight.js',
];

function assertExists(filePath, message) {
  if (!fs.existsSync(filePath)) {
    throw new Error(message);
  }
}

function hasFileMatching(pattern) {
  return fs.readdirSync(pagefindDir).some((file) => pattern.test(file));
}

function formatBytes(bytes) {
  return `${bytes.toLocaleString('en-US')} bytes`;
}

assertExists(pagefindDir, 'dist/pagefind must exist before pruning Pagefind assets');
assertExists(path.join(pagefindDir, 'pagefind.js'), 'Pagefind runtime must be preserved');
assertExists(path.join(pagefindDir, 'pagefind-worker.js'), 'Pagefind worker must be preserved');
assertExists(path.join(pagefindDir, 'pagefind-entry.json'), 'Pagefind entry metadata must be preserved');

if (!hasFileMatching(/^wasm\..+\.pagefind$/)) {
  throw new Error('Pagefind WASM assets must be preserved');
}

if (!hasFileMatching(/^pagefind\..+\.pf_meta$/)) {
  throw new Error('Pagefind search metadata must be preserved');
}

let removedCount = 0;
let removedBytes = 0;

for (const asset of unusedPagefindAssets) {
  const filePath = path.join(pagefindDir, asset);
  if (!fs.existsSync(filePath)) continue;

  const { size } = fs.statSync(filePath);
  fs.rmSync(filePath);
  removedCount += 1;
  removedBytes += size;
}

console.log(`Pruned ${removedCount} unused Pagefind UI assets (${formatBytes(removedBytes)})`);
