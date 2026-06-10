import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractInfoboxWikiLinks, getVisibleInfoboxRows } from './build-linkgraph.js';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taopedia-linkgraph-infobox-'));

try {
  const articleDir = path.join(tempRoot, 'json_infobox');
  fs.mkdirSync(articleDir, { recursive: true });
  fs.writeFileSync(
    path.join(articleDir, 'infobox.json'),
    JSON.stringify({
      rows: [
        { label: 'Related', value: 'See [[dynamic_tao|Dynamic TAO]]' },
        { label: 'Plain', value: 'No wiki link here' },
      ],
    }),
  );

  const jsonRows = getVisibleInfoboxRows(articleDir, undefined);
  assert.ok(Array.isArray(jsonRows), 'infobox.json rows should be used when frontmatter rows are absent');
  assert.deepEqual(
    extractInfoboxWikiLinks(jsonRows),
    [{ target: 'dynamic_tao', text: 'Dynamic TAO' }],
    'linkgraph should extract wiki links from visible infobox.json rows',
  );

  const frontmatterRows = [{ label: 'Frontmatter', value: 'See [[staking|Staking]]' }];
  const visibleRows = getVisibleInfoboxRows(articleDir, frontmatterRows);
  assert.equal(visibleRows, frontmatterRows, 'frontmatter infobox rows should keep renderer precedence');
  assert.deepEqual(
    extractInfoboxWikiLinks(visibleRows),
    [{ target: 'staking', text: 'Staking' }],
    'linkgraph should match the frontmatter rows that the article page renders',
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('Linkgraph infobox JSON check passed');
