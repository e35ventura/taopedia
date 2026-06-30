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
        preferResolvedTitle: true,
        requireExisting: true,
      },
      { target: 'staking', text: 'Staking' },
    ],
    'linkgraph should extract visible plain-text Related rows and explicit wiki links from infobox JSON',
  );
  assert.deepEqual(
    extractInfoboxWikiLinks([
      {
        label: 'Related',
        value: 'Mining and Validating',
      },
    ]),
    [
      {
        target: 'Mining and Validating',
        text: 'Mining and Validating',
        preferResolvedTitle: true,
        requireExisting: true,
      },
    ],
    'linkgraph should keep a plain-text Related row intact so resolution can prefer an existing compound article before falling back to split parts',
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
      { target: 'Delegate', text: 'Delegate', preferResolvedTitle: true, requireExisting: true },
      { target: 'staking', text: 'Staking' },
    ],
    'linkgraph should match the frontmatter rows that the article page renders, including plain-text Related rows',
  );

  const slugMap = {
    coldkeys: { title: 'Coldkeys', infoboxTitle: 'Coldkey' },
    subnet: { title: 'Subnet' },
    network_min_lock_cost: { title: 'Network Min Lock Cost' },
    hotkeys: { title: 'Hotkeys', infoboxTitle: 'Hotkey' },
    mev_maximal_extractable_value: {
      title: 'MEV (Maximal Extractable Value)',
      infoboxTitle: 'MEV',
    },
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
      target: 'Mining and Validating',
      slugAliases: buildSlugAliases({
        ...slugMap,
        mining_and_validating: { title: 'Mining and Validating' },
      }),
      slugMap: {
        ...slugMap,
        mining_and_validating: { title: 'Mining and Validating' },
      },
      requireExisting: true,
    }),
    ['mining_and_validating'],
    'linkgraph should prefer an existing compound Related title before considering split fallback targets',
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
      target: 'Coldkey and hotkey',
      slugAliases,
      slugMap,
      requireExisting: true,
    }),
    ['coldkeys', 'hotkeys'],
    'linkgraph should recover split plain-text Related parts through infoboxTitle aliases like Coldkey and hotkey',
  );
  assert.deepEqual(
    resolveBuildLinkTargets({
      target: 'MEV',
      slugAliases,
      slugMap,
      requireExisting: true,
    }),
    ['mev_maximal_extractable_value'],
    'linkgraph should recover short infoboxTitle aliases like MEV from plain-text Related rows',
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
