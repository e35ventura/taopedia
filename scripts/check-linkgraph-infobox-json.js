import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSlugAliases } from './wiki-link-resolver.js';
import { extractInfoboxWikiLinks, getVisibleInfoboxRows, resolveBuildLinkTargets } from './build-linkgraph.js';

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
          value: 'Dynamic TAO',
        },
        { label: 'Plain', value: 'See [[staking|Staking]]' },
      ],
    }),
  );

  const jsonRows = getVisibleInfoboxRows(articleDir, undefined);
  assert.ok(Array.isArray(jsonRows), 'infobox.json rows should be used when frontmatter rows are absent');
  assert.deepEqual(
    extractInfoboxWikiLinks(jsonRows),
    [
      {
        target: 'Dynamic TAO',
        text: 'Dynamic TAO',
        requireExisting: true,
      },
      { target: 'staking', text: 'Staking' },
    ],
    'linkgraph should extract visible plain-text Related rows and explicit wiki links from infobox JSON',
  );

  const frontmatterRows = [
    {
      label: 'Related role',
      value: 'Delegate',
    },
    {
      label: 'Frontmatter',
      value: 'See [[staking|Staking]]',
    },
  ];
  const visibleRows = getVisibleInfoboxRows(articleDir, frontmatterRows);
  assert.equal(visibleRows, frontmatterRows, 'frontmatter infobox rows should keep renderer precedence');
  assert.deepEqual(
    extractInfoboxWikiLinks(visibleRows),
    [
      { target: 'Delegate', text: 'Delegate', requireExisting: true },
      { target: 'staking', text: 'Staking' },
    ],
    'linkgraph should match the frontmatter rows that the article page renders, including plain-text Related rows',
  );

  const slugMap = {
    subnet: { title: 'Subnet' },
    network_min_lock_cost: { title: 'Network Min Lock Cost' },
    weight_vector: { title: 'Weight Vector' },
    slippage: { title: 'Slippage' },
    staking: { title: 'Staking' },
    delegation: { title: 'Delegation' },
    research_and_development: { title: 'Research and Development' },
  };
  const slugAliases = buildSlugAliases(slugMap);
  assert.deepEqual(
    resolveBuildLinkTargets({
      target: 'Staking and Delegation',
      slugAliases,
      slugMap,
      requireExisting: true,
    }),
    ['staking', 'delegation'],
    'linkgraph should split unresolved plain-text Related rows into multiple existing article targets',
  );
  assert.deepEqual(
    resolveBuildLinkTargets({
      target: 'Research and Development',
      slugAliases,
      slugMap,
      requireExisting: true,
    }),
    ['research_and_development'],
    'linkgraph should keep a directly resolvable Related title intact instead of splitting it',
  );
  assert.deepEqual(
    resolveBuildLinkTargets({
      target: 'Subnets',
      slugAliases,
      slugMap,
      requireExisting: true,
    }),
    ['subnet'],
    'linkgraph should recover singular article aliases from unresolved plain-text Related rows',
  );
  assert.deepEqual(
    resolveBuildLinkTargets({
      target: 'NetworkMinLockCost',
      slugAliases,
      slugMap,
      requireExisting: true,
    }),
    ['network_min_lock_cost'],
    'linkgraph should recover camel-cased article aliases from unresolved plain-text Related rows',
  );
  assert.deepEqual(
    resolveBuildLinkTargets({
      target: 'Weight vectors',
      slugAliases,
      slugMap,
      requireExisting: true,
    }),
    ['weight_vector'],
    'linkgraph should recover singularized title aliases from unresolved plain-text Related rows',
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('Linkgraph infobox JSON check passed');
