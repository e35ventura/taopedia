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
        {
          label: 'Related',
          value: 'See [[dynamic_tao|Dynamic TAO]] and [Emission](https://docs.learnbittensor.org/learn/emissions)',
        },
        { label: 'Plain', value: 'No wiki link here' },
      ],
    }),
  );

  const jsonRows = getVisibleInfoboxRows(articleDir, undefined);
  assert.ok(Array.isArray(jsonRows), 'infobox.json rows should be used when frontmatter rows are absent');
  assert.deepEqual(
    extractInfoboxWikiLinks(jsonRows),
    [
      { target: 'dynamic_tao', text: 'Dynamic TAO' },
      {
        target: 'https://docs.learnbittensor.org/learn/emissions',
        text: 'Emission',
      },
    ],
    'linkgraph should extract wiki links and canonical Learn Bittensor markdown links from visible infobox.json rows',
  );

  const frontmatterRows = [
    {
      label: 'Frontmatter',
      value: 'See [[staking|Staking]] and [Staking and Delegation](https://docs.learnbittensor.org/staking-and-delegation/delegation)',
    },
  ];
  const visibleRows = getVisibleInfoboxRows(articleDir, frontmatterRows);
  assert.equal(visibleRows, frontmatterRows, 'frontmatter infobox rows should keep renderer precedence');
  assert.deepEqual(
    extractInfoboxWikiLinks(visibleRows),
    [
      { target: 'staking', text: 'Staking' },
      {
        target: 'https://docs.learnbittensor.org/staking-and-delegation/delegation',
        text: 'Staking and Delegation',
      },
    ],
    'linkgraph should match the frontmatter rows that the article page renders, including canonical Learn Bittensor markdown links',
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('Linkgraph infobox JSON check passed');
