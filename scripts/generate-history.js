import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const contentDir = path.join(projectRoot, 'src', 'content', 'pages');
const outputDir = path.join(projectRoot, 'public', 'history');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function getGitHistory(filePath) {
  try {
    const logOutput = execFileSync(
      'git',
      [
        'log',
        '--follow',
        '--pretty=format:%H%x00%an%x00%ae%x00%at%x00%s%x00',
        '--',
        filePath,
      ],
      { encoding: 'utf-8', cwd: projectRoot }
    );

    if (!logOutput) return [];

    const tokens = logOutput.split('\x00').filter(Boolean);
    const history = [];
    for (let i = 0; i < tokens.length; i += 5) {
      const sha = tokens[i];
      const authorName = tokens[i + 1];
      const authorEmail = tokens[i + 2];
      const timestamp = tokens[i + 3];
      const message = tokens[i + 4];
      if (!sha || !timestamp) continue;
      const parsedTimestamp = parseInt(timestamp, 10);
      if (!Number.isFinite(parsedTimestamp)) continue;

      history.push({
        sha,
        authorName: authorName || '',
        authorEmail: authorEmail || '',
        timestamp: parsedTimestamp,
        date: new Date(parsedTimestamp * 1000).toISOString(),
        message: message || '',
      });
    }

    return history;
  } catch (error) {
    console.warn(`No git history for ${filePath}:`, error.message);
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

markdownFiles.forEach(filePath => {
  const relativePath = path.relative(contentDir, filePath);
  const slug = path.dirname(relativePath).replace(/\\/g, '/');
  
  const history = getGitHistory(filePath);
  
  const historyFile = path.join(outputDir, `${slug}.json`);
  const historyFileDir = path.dirname(historyFile);
  
  if (!fs.existsSync(historyFileDir)) {
    fs.mkdirSync(historyFileDir, { recursive: true });
  }
  
  fs.writeFileSync(historyFile, JSON.stringify({ slug, history }, null, 2));
  console.log(`  ✓ ${slug} (${history.length} revisions)`);
});

console.log(`✓ Generated history for ${markdownFiles.length} articles`);
