import { execSync } from 'child_process';
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
    const logOutput = execSync(
      `git log --follow --pretty=format:"%H|%an|%ae|%at|%s" -- "${filePath}"`,
      { encoding: 'utf-8', cwd: projectRoot }
    );

    if (!logOutput) return [];

    return logOutput.split('\n').map(line => {
      const [sha, authorName, authorEmail, timestamp, message] = line.split('|');
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
