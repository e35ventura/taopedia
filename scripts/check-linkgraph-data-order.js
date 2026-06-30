import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractCanonicalGlossaryLinks, orderGeneratedData, dedupeOutgoingLinks, normalizeArticleCategories, resolveBuildLinkTargets, expandGlossaryGerundConceptTarget, expandGlossaryPluralConceptTarget, expandGlossaryTokensConceptTarget, expandGlossaryCompoundSuffixTargets } from './build-linkgraph.js';
import { buildSlugAliases } from './wiki-link-resolver.js';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const dataDir = path.join(projectRoot, 'public', 'data');
const compareKeys = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });

assert.deepEqual(
  normalizeArticleCategories(['Mining', 'Consensus', 'Mining']),
  ['Mining', 'Consensus'],
  'normalizeArticleCategories must dedupe while preserving first-seen order',
);
assert.deepEqual(normalizeArticleCategories(undefined), [], 'normalizeArticleCategories must normalize missing input to []');
assert.deepEqual(
  extractCanonicalGlossaryLinks(
    'See [tempo](https://docs.learnbittensor.org/resources/glossary#tempo), [validator](https://docs.learnbittensor.org/resources/glossary#subnet-validator), [Glossary: Validator Take %](https://docs.learnbittensor.org/resources/glossary#validator-take-), [Glossary: Drand/time-lock encryption](https://docs.learnbittensor.org/resources/glossary#drandtime-lock-encryption), [Glossary: Root Subnet/Subnet Zero](https://docs.learnbittensor.org/resources/glossary#root-subnetsubnet-zero), [Glossary: Exponential Moving Average (EMA)](https://docs.learnbittensor.org/resources/glossary#exponential-moving-average-ema), [Glossary: ADR](https://docs.learnbittensor.org/resources/glossary#adr-alpha-distribution-ratio), and [Subnet Hyperparameters](https://docs.learnbittensor.org/subnets/subnet-hyperparameters).',
  ),
  [
    { target: 'tempo', alternateTarget: '', slashSecondTarget: '', canonicalTarget: 'tempo', text: 'tempo', requireExisting: true, skipSelf: true, allowSplitTargets: true },
    {
      target: 'validator',
      alternateTarget: '',
      slashSecondTarget: '',
      canonicalTarget: 'subnet validator',
      text: 'validator',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: true,
    },
    {
      target: 'Validator Take %',
      alternateTarget: '',
      slashSecondTarget: '',
      canonicalTarget: 'validator take',
      text: 'Glossary: Validator Take %',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
    {
      target: 'Drand time-lock encryption',
      alternateTarget: 'Drand',
      slashSecondTarget: 'time-lock encryption',
      canonicalTarget: 'drandtime lock encryption',
      text: 'Glossary: Drand/time-lock encryption',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
    {
      target: 'Root Subnet Subnet Zero',
      alternateTarget: 'Root Subnet',
      slashSecondTarget: 'Subnet Zero',
      canonicalTarget: 'root subnetsubnet zero',
      text: 'Glossary: Root Subnet/Subnet Zero',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
    {
      target: 'Exponential Moving Average (EMA)',
      alternateTarget: '',
      slashSecondTarget: '',
      canonicalTarget: 'exponential moving average ema',
      text: 'Glossary: Exponential Moving Average (EMA)',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
    {
      target: 'ADR',
      alternateTarget: '',
      slashSecondTarget: '',
      canonicalTarget: 'alpha distribution ratio',
      text: 'Glossary: ADR',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
  ],
  'canonical Learn Bittensor glossary markdown links should preserve plain labels, keep canonical anchor fallbacks for plain and prefixed labels, normalize slash-separated labels, preserve slash alternatives, and keep acronym-bearing prefixed labels available for later exact-only fallback refinement',
);

const resolverSlugMap = {
  dynamic_tao: { title: 'Dynamic TAO' },
  delegate: { title: 'Delegate' },
  drand_time_lock_encryption: { title: 'Drand Time-Lock Encryption' },
  epoch: { title: 'Epoch' },
  mev_maximal_extractable_value: {
    title: 'MEV (Maximal Extractable Value)',
    infoboxTitle: 'MEV',
  },
  tempo: { title: 'Tempo' },
  validator_take: { title: 'Validator Take' },
  subnet_validator: { title: 'Subnet Validator' },
  validator_weights: { title: 'Validator Weights' },
  root_subnet: { title: 'Root Subnet' },
  alpha_distribution_ratio: { title: 'Alpha Distribution Ratio' },
  exponential_moving_averages: { title: 'Exponential Moving Averages', infoboxTitle: 'Exponential Moving Averages' },
  hotkey_coldkey_pair: { title: 'Hotkey-Coldkey Pair' },
  recycling: { title: 'Recycling' },
  time_lock_encryption: { title: 'Time-Lock Encryption' },
  extrinsics: { title: 'Extrinsics' },
  alpha_tokens: { title: 'Alpha Tokens' },
  wallets: { title: 'Bittensor Wallets', infoboxTitle: 'Wallet (Concept)' },
  bittensor_wallet: { title: 'Bittensor Wallet' },
  tao: { title: 'TAO' },
  tao_reserve: { title: 'TAO Reserve' },
  tao_weight: { title: 'TAO Weight' },
  halving_mechanisms: { title: 'Halving Mechanisms' },
  mempool_visibility: { title: 'Mempool Visibility' },
  emission_split: { title: 'Emission Split' },
  delegation_rewards: { title: 'Delegation Rewards' },
  subnet: { title: 'Subnet' },
  subnet_protocol: { title: 'Subnet Protocol' },
  subnet_miner: { title: 'Subnet Miner' },
  subnet_weights: { title: 'Subnet Weights' },
  subnet_task: { title: 'Subnet Task' },
  subnet_hyperparameters: { title: 'Subnet Hyperparameters' },
  subnet_registration: { title: 'Subnet Registration' },
  subnet_symbol: { title: 'Subnet Symbol' },
  subnet_markets: { title: 'Subnet Markets' },
  subnet_lease: { title: 'Subnet Lease' },
  subtensor: { title: 'Subtensor' },
  subtensor_constants: { title: 'Subtensor Constants' },
  subtensor_events: { title: 'Subtensor Events' },
  subtensor_storage: { title: 'Subtensor Storage' },
  subtensor_error_codes: { title: 'Subtensor Error Codes' },
};
const resolverAliases = buildSlugAliases(resolverSlugMap);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Delegate',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
  }),
  ['delegate'],
  'plain-text Related infobox rows must resolve to an existing local Taopedia article slug',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'MEV',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
  }),
  ['mev_maximal_extractable_value'],
  'plain-text Related infobox rows must resolve short infoboxTitle aliases like MEV to an existing local slug',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Introduction to Bittensor',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
  }),
  [],
  'plain-text Related infobox rows without a local article match must stay out of the link graph',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'validator take',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['validator_take'],
  'canonical glossary anchor fallbacks should resolve exact local aliases without the plain-text Related splitter',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'subnet validator',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['subnet_validator'],
  'canonical glossary anchor fallbacks should recover existing local aliases like subnet validator when the visible label is shorter',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Introduction to Bittensor',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  [],
  'exact-existing glossary recovery must not fall back to the plain-text Related splitter when no local alias exists',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Drand time-lock encryption',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['drand_time_lock_encryption'],
  'exact-existing glossary recovery should match a slash-normalized visible glossary label to the local article',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Root Subnet',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['root_subnet'],
  'exact-existing glossary recovery should match the first visible slash alternative when the combined prefixed label misses',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'alpha distribution ratio',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['alpha_distribution_ratio'],
  'exact-existing glossary recovery should resolve a canonical glossary anchor after a redundant leading acronym has been stripped',
);
assert.deepEqual(
  extractCanonicalGlossaryLinks(
    'See [Glossary: Coldkey-hotkey pair](https://docs.learnbittensor.org/resources/glossary#coldkey-hotkey-pair).',
  ),
  [
    {
      target: 'Coldkey-hotkey pair',
      alternateTarget: 'hotkey-Coldkey pair',
      slashSecondTarget: '',
      canonicalTarget: 'coldkey hotkey pair',
      text: 'Glossary: Coldkey-hotkey pair',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
  ],
  'canonical Learn Bittensor glossary markdown links should preserve a hyphen-reversed first compound as an alternate fallback',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'hotkey-Coldkey pair',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['hotkey_coldkey_pair'],
  'exact-existing glossary recovery should match a hyphen-reversed first compound when the visible prefixed label misses',
);
assert.deepEqual(
  extractCanonicalGlossaryLinks(
    'See [Glossary: Recycle](https://docs.learnbittensor.org/resources/glossary#recycle).',
  ),
  [
    {
      target: 'Recycle',
      alternateTarget: '',
      slashSecondTarget: '',
      canonicalTarget: 'recycle',
      text: 'Glossary: Recycle',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
  ],
  'canonical Learn Bittensor glossary markdown links should preserve gerund-recoverable verb labels for later exact-only fallback refinement',
);
assert.equal(
  expandGlossaryGerundConceptTarget('Recycle', 'recycle'),
  'Recycling',
  'expandGlossaryGerundConceptTarget must derive the local gerund concept from a glossary verb label',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Recycling',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['recycling'],
  'exact-existing glossary recovery should match a gerund concept article when the visible prefixed verb label misses',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'time-lock encryption',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['time_lock_encryption'],
  'exact-existing glossary recovery should match a slash-separated second segment when earlier slash fallbacks miss',
);
assert.deepEqual(
  extractCanonicalGlossaryLinks(
    'See [Glossary: Extrinsic](https://docs.learnbittensor.org/resources/glossary#extrinsic).',
  ),
  [
    {
      target: 'Extrinsic',
      alternateTarget: '',
      slashSecondTarget: '',
      canonicalTarget: 'extrinsic',
      text: 'Glossary: Extrinsic',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
  ],
  'canonical Learn Bittensor glossary markdown links should preserve plural-recoverable singular labels for later exact-only fallback refinement',
);
assert.equal(
  expandGlossaryPluralConceptTarget('Extrinsic', 'extrinsic'),
  'Extrinsics',
  'expandGlossaryPluralConceptTarget must derive the local plural concept from a glossary singular label',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Extrinsics',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['extrinsics'],
  'exact-existing glossary recovery should match a plural concept article when the visible prefixed singular label misses',
);
assert.deepEqual(
  extractCanonicalGlossaryLinks(
    'See [Glossary: Alpha](https://docs.learnbittensor.org/resources/glossary#alpha).',
  ),
  [
    {
      target: 'Alpha',
      alternateTarget: '',
      slashSecondTarget: '',
      canonicalTarget: 'alpha',
      text: 'Glossary: Alpha',
      requireExisting: true,
      skipSelf: true,
      allowSplitTargets: false,
    },
  ],
  'canonical Learn Bittensor glossary markdown links should preserve tokens-suffixed concept labels for later exact-only fallback refinement',
);
assert.equal(
  expandGlossaryTokensConceptTarget('Alpha', 'alpha'),
  'Alpha Tokens',
  'expandGlossaryTokensConceptTarget must derive the local tokens concept from a glossary short label',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Alpha Tokens',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['alpha_tokens'],
  'exact-existing glossary recovery should match a tokens concept article when the visible prefixed short label misses',
);
assert.equal(
  expandGlossaryPluralConceptTarget('Bittensor Wallet', 'bittensor wallet'),
  'Bittensor Wallets',
  'expandGlossaryPluralConceptTarget must derive a plural sibling concept from a glossary singular wallet label',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Bittensor Wallets',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['wallets'],
  'exact-existing glossary recovery should match a plural wallet concept article when the visible prefixed singular wallet label self-resolves',
);
assert.deepEqual(
  expandGlossaryCompoundSuffixTargets('TAO', 'tao'),
  [
    'Tao Reserve',
    'Tao Weight',
    'Tao Mechanisms',
    'Tao Visibility',
    'Tao Split',
    'Tao Rewards',
    'Tao Protocol',
    'Tao Validator',
    'Tao Miner',
    'Tao Weights',
    'Tao Task',
    'Tao Hyperparameters',
    'Tao Registration',
    'Tao Symbol',
    'Tao Markets',
    'Tao Lease',
    'Tao Constants',
    'Tao Events',
    'Tao Storage',
    'Tao Error Codes',
  ],
  'expandGlossaryCompoundSuffixTargets must derive local compound sibling concepts from a glossary short label',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Tao Reserve',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['tao_reserve'],
  'exact-existing glossary recovery should match a reserve compound concept article when the visible prefixed short label self-resolves',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Tao Weight',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['tao_weight'],
  'exact-existing glossary recovery should match a weight compound concept article when the visible prefixed short label self-resolves',
);
assert.equal(
  expandGlossaryCompoundSuffixTargets('Halving', 'halving').includes('Halving Mechanisms'),
  true,
  'expandGlossaryCompoundSuffixTargets must include a mechanisms compound sibling from a halving glossary label',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Halving Mechanisms',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['halving_mechanisms'],
  'exact-existing glossary recovery should match a mechanisms compound concept article when the visible prefixed short label self-resolves',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Delegation Rewards',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['delegation_rewards'],
  'exact-existing glossary recovery should match a rewards compound concept article when the visible prefixed short label self-resolves',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Emission Split',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['emission_split'],
  'exact-existing glossary recovery should match a split compound concept article when the visible prefixed short label self-resolves',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Mempool Visibility',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['mempool_visibility'],
  'exact-existing glossary recovery should match a visibility compound concept article when the visible prefixed short label self-resolves',
);
assert.equal(
  expandGlossaryCompoundSuffixTargets('Subnet', 'subnet').includes('Subnet Validator'),
  true,
  'expandGlossaryCompoundSuffixTargets must include subnet validator compound siblings from a subnet glossary label',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Subnet Validator',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['subnet_validator'],
  'exact-existing glossary recovery should match a subnet validator compound concept article when the visible prefixed short label self-resolves',
);
assert.equal(
  expandGlossaryCompoundSuffixTargets('Subtensor', 'subtensor').includes('Subtensor Constants'),
  true,
  'expandGlossaryCompoundSuffixTargets must include subtensor constants compound siblings from a subtensor glossary label',
);
assert.deepEqual(
  resolveBuildLinkTargets({
    target: 'Subtensor Constants',
    slugAliases: resolverAliases,
    slugMap: resolverSlugMap,
    requireExisting: true,
    allowSplitTargets: false,
  }),
  ['subtensor_constants'],
  'exact-existing glossary recovery should match a subtensor constants compound concept article when the visible prefixed short label self-resolves',
);

function assertSortedKeys(object, label) {
  const keys = Object.keys(object);
  assert.deepEqual(keys, [...keys].sort(compareKeys), `${label} keys must be sorted with numeric collation`);
}

function assertSortedValues(values, label) {
  assert.deepEqual(values, [...values].sort(compareKeys), `${label} must be sorted with numeric collation`);
}

const input = {
  linkGraph: {
    subnet_10: [{ target: 'wallets', text: 'Wallets' }],
    alpha: [],
    subnet_2: [{ target: 'coldkeys', text: 'Coldkeys' }],
  },
  backlinks: {
    wallets: [
      { from: 'subnet_10', fromTitle: 'Subnet 10' },
      { from: 'alpha', fromTitle: 'Alpha' },
      { from: 'subnet_2', fromTitle: 'Subnet 2' },
    ],
    coldkeys: [{ from: 'subnet_10', fromTitle: 'Subnet 10' }],
  },
  slugMap: {
    subnet_10: { title: 'Subnet 10' },
    alpha: { title: 'Alpha' },
    subnet_2: { title: 'Subnet 2' },
  },
  categoryIndex: {
    // 'subnet_10' is repeated to exercise per-category member de-duping (an article
    // whose frontmatter lists the same category twice would otherwise appear twice).
    Subnets: ['subnet_10', 'subnet_2', 'subnet_10'],
    Consensus: ['yuma_consensus', 'alpha'],
  },
};

const ordered = orderGeneratedData(input);

assertSortedKeys(ordered.linkGraph, 'linkgraph');
assert.deepEqual(Object.keys(ordered.linkGraph), ['alpha', 'subnet_2', 'subnet_10']);
assertSortedKeys(ordered.slugMap, 'slugmap');
assert.deepEqual(Object.keys(ordered.slugMap), ['alpha', 'subnet_2', 'subnet_10']);
assertSortedKeys(ordered.backlinks, 'backlink target');
assert.deepEqual(Object.keys(ordered.backlinks), ['coldkeys', 'wallets']);
assert.deepEqual(
  ordered.backlinks.wallets.map((entry) => entry.from),
  ['alpha', 'subnet_2', 'subnet_10'],
  'backlink rows must be sorted by source slug with numeric collation',
);
assertSortedKeys(ordered.categoryIndex, 'category index');
assert.deepEqual(Object.keys(ordered.categoryIndex), ['Consensus', 'Subnets']);
assert.deepEqual(
  ordered.categoryIndex.Subnets,
  ['subnet_2', 'subnet_10'],
  'category member slugs must be sorted with numeric collation and de-duped',
);

assert.deepEqual(
  input.backlinks.wallets.map((entry) => entry.from),
  ['subnet_10', 'alpha', 'subnet_2'],
  'ordering helper must not mutate caller-owned backlink arrays',
);
assert.deepEqual(
  input.categoryIndex.Subnets,
  ['subnet_10', 'subnet_2', 'subnet_10'],
  'ordering helper must not mutate caller-owned category arrays',
);

assert.deepEqual(
  dedupeOutgoingLinks([
    { target: 'alpha', text: 'Glossary: A' },
    { target: 'alpha', text: 'B' },
    { target: 'beta', text: 'B' },
    { target: '', text: 'Empty' },
  ]),
  [
    { target: 'alpha', text: 'B' },
    { target: 'beta', text: 'B' },
  ],
  'outgoing link targets must be deduped after alias resolution while preferring a later non-Glossary label for the same target',
);

const generatedFiles = ['linkgraph.json', 'backlinks.json', 'slugmap.json', 'categories.json']
  .map((file) => path.join(dataDir, file));

if (generatedFiles.every((file) => fs.existsSync(file))) {
  const linkGraph = JSON.parse(fs.readFileSync(path.join(dataDir, 'linkgraph.json'), 'utf8'));
  const backlinks = JSON.parse(fs.readFileSync(path.join(dataDir, 'backlinks.json'), 'utf8'));
  const slugMap = JSON.parse(fs.readFileSync(path.join(dataDir, 'slugmap.json'), 'utf8'));
  const categoryIndex = JSON.parse(fs.readFileSync(path.join(dataDir, 'categories.json'), 'utf8'));

  assertSortedKeys(linkGraph, 'generated linkgraph');
  assertSortedKeys(backlinks, 'generated backlinks');
  assertSortedKeys(slugMap, 'generated slugmap');
  assertSortedKeys(categoryIndex, 'generated category index');

  for (const [target, entries] of Object.entries(backlinks)) {
    assertSortedValues(entries.map((entry) => entry.from), `generated backlinks for ${target}`);
  }
  for (const [category, slugs] of Object.entries(categoryIndex)) {
    assertSortedValues(slugs, `generated category members for ${category}`);
    assert.equal(
      new Set(slugs).size,
      slugs.length,
      `generated category members for ${category} must not repeat a slug`,
    );
  }
  for (const [slug, entry] of Object.entries(slugMap)) {
    const categories = Array.isArray(entry?.categories) ? entry.categories : [];
    assert.equal(
      new Set(categories).size,
      categories.length,
      `generated slugmap entry for ${slug} must not repeat a category tag`,
    );
  }
  assert.ok(
    (linkGraph.sandwich_attack || []).some((entry) => entry.target === 'mev_maximal_extractable_value' && entry.text === 'MEV'),
    'generated linkgraph must keep the current sandwich_attack Related: MEV infobox edge when the local MEV article exists',
  );
  assert.ok(
    (linkGraph.activity_cutoff || []).some((entry) => entry.target === 'tempo' && entry.text === 'Glossary: Tempo'),
    'generated linkgraph must recover the current activity_cutoff body link to the local tempo article from a canonical glossary markdown link',
  );
  assert.ok(
    (linkGraph.bittensor_evm_smart_contracts || []).some((entry) => entry.target === 'subtensor' && entry.text === 'Subtensor'),
    'generated linkgraph must keep an existing bittensor_evm_smart_contracts edge text when a different plain glossary label would otherwise resolve to the same target via the canonical anchor fallback',
  );
  assert.ok(
    (linkGraph.min_allowed_weights || []).some((entry) => entry.target === 'subnet_validator' && entry.text === 'validator'),
    'generated linkgraph must recover the current min_allowed_weights body link to subnet_validator when a plain glossary label misses but its canonical anchor matches the local article',
  );
  assert.ok(
    (linkGraph.address_poisoning_scams || []).some((entry) => entry.target === 'public_key' && entry.text === 'Glossary: Public Key'),
    'generated linkgraph must recover the current address_poisoning_scams body link to the local public_key article from a canonical glossary label with a visible Glossary: prefix',
  );
  assert.ok(
    (backlinks.mev_maximal_extractable_value || []).some((entry) => entry.from === 'sandwich_attack'),
    'generated backlinks must list sandwich_attack under the current local MEV article when its Related infobox row points there',
  );
  assert.ok(
    (backlinks.tempo || []).some((entry) => entry.from === 'activity_cutoff'),
    'generated backlinks must list activity_cutoff under tempo when the body uses a canonical glossary markdown link to the local tempo concept',
  );
  assert.ok(
    (backlinks.subnet_validator || []).some((entry) => entry.from === 'min_allowed_weights'),
    'generated backlinks must list min_allowed_weights under subnet_validator when a plain glossary label falls back to the canonical glossary anchor',
  );
  assert.ok(
    (backlinks.public_key || []).some((entry) => entry.from === 'address_poisoning_scams'),
    'generated backlinks must list address_poisoning_scams under public_key when the body uses a canonical glossary label with a visible Glossary: prefix',
  );
  assert.ok(
    (linkGraph.delegation || []).some((entry) => entry.target === 'validator_take' && entry.text === 'Glossary: Validator Take %'),
    'generated linkgraph must recover the current delegation body link to validator_take from a prefixed glossary alias whose visible label includes punctuation',
  );
  assert.ok(
    (linkGraph.delegation || []).some((entry) => entry.target === 'subnet_validator' && entry.text === 'Glossary: Validator'),
    'generated linkgraph must recover the current delegation body link to subnet_validator when the prefixed glossary label is shorter than the local title',
  );
  assert.ok(
    (linkGraph.hotkeys || []).some((entry) => entry.target === 'weight_vector' && entry.text === 'Glossary: Weights'),
    'generated linkgraph must recover the current hotkeys body link to weight_vector when the prefixed glossary label is a shorter alias of the canonical concept',
  );
  assert.ok(
    (linkGraph.commit_reveal || []).some((entry) => entry.target === 'drand_time_lock_encryption' && entry.text === 'Glossary: Drand/time-lock encryption'),
    'generated linkgraph must recover the current commit_reveal body link to drand_time_lock_encryption when the visible glossary label uses slash-separated punctuation',
  );
  assert.ok(
    (linkGraph.weight_copying || []).some((entry) => entry.target === 'drand_time_lock_encryption' && entry.text === 'Glossary: Drand/time-lock encryption'),
    'generated linkgraph must recover the current weight_copying body link to drand_time_lock_encryption when the visible glossary label uses slash-separated punctuation',
  );
  assert.ok(
    (linkGraph.netuid || []).some((entry) => entry.target === 'root_subnet' && entry.text === 'Glossary: Root Subnet/Subnet Zero'),
    'generated linkgraph must recover the current netuid body link to root_subnet when the slash-normalized prefixed glossary label misses but its first visible alternative matches the local article',
  );
  assert.ok(
    (linkGraph.alpha_staker || []).some((entry) => entry.target === 'root_subnet' && entry.text === 'Glossary: Root Subnet/Subnet Zero'),
    'generated linkgraph must recover the current alpha_staker body link to root_subnet when the slash-normalized prefixed glossary label misses but its first visible alternative matches the local article',
  );
  assert.ok(
    (linkGraph.validator_miner_bonds || []).some((entry) => entry.target === 'exponential_moving_averages' && entry.text === 'Glossary: Exponential Moving Average (EMA)'),
    'generated linkgraph must recover the current validator_miner_bonds body link to exponential_moving_averages when the prefixed glossary label ends with a parenthetical acronym but the local article title is pluralized',
  );
  assert.ok(
    (linkGraph.subnet_weights || []).some((entry) => entry.target === 'register' && entry.text === 'registration'),
    'generated linkgraph must recover the current subnet_weights body link to register when a plain glossary label misses but the canonical anchor names the local concept article',
  );
  assert.ok(
    (linkGraph.metagraph || []).some((entry) => entry.target === 'uid_slot' && entry.text === 'Glossary: UID Slot'),
    'generated linkgraph must resolve the current metagraph UID Slot glossary link to uid_slot when the prefixed label names the local concept article',
  );
  assert.ok(
    (linkGraph.yuma_consensus_3 || []).some((entry) => entry.target === 'exponential_moving_averages' && entry.text === 'Glossary: Exponential Moving Average (EMA)'),
    'generated linkgraph must recover the current yuma_consensus_3 body link to exponential_moving_averages when the prefixed glossary label ends with a parenthetical acronym but the local article title is pluralized',
  );
  assert.ok(
    (linkGraph.alpha_outstanding || []).some((entry) => entry.target === 'alpha_distribution_ratio' && entry.text === 'Glossary: ADR'),
    'generated linkgraph must recover the current alpha_outstanding body link to alpha_distribution_ratio when the visible glossary label is an acronym that is redundantly repeated at the start of the canonical anchor',
  );
  assert.ok(
    (linkGraph.halving_mechanisms || []).some((entry) => entry.target === 'alpha_distribution_ratio' && entry.text === 'Glossary: ADR'),
    'generated linkgraph must recover the current halving_mechanisms body link to alpha_distribution_ratio when the visible glossary label is an acronym that is redundantly repeated at the start of the canonical anchor',
  );
  assert.ok(
    (linkGraph.hotkey_swap || []).some((entry) => entry.target === 'hotkey_coldkey_pair' && entry.text === 'Glossary: Coldkey-hotkey pair'),
    'generated linkgraph must recover the current hotkey_swap body link to hotkey_coldkey_pair when the prefixed glossary label hyphen compound is word-order-reversed from the local title',
  );
  assert.ok(
    (linkGraph.wallets_coldkey_hotkey || []).some((entry) => entry.target === 'hotkey_coldkey_pair' && entry.text === 'Glossary: Coldkey-hotkey pair'),
    'generated linkgraph must recover the current wallets_coldkey_hotkey body link to hotkey_coldkey_pair when the prefixed glossary label hyphen compound is word-order-reversed from the local title',
  );
  assert.ok(
    (linkGraph.coldkey_hotkey_workstation_security || []).some((entry) => entry.target === 'hotkey_coldkey_pair' && entry.text === 'Glossary: Coldkey-hotkey Pair'),
    'generated linkgraph must recover the current coldkey_hotkey_workstation_security body link to hotkey_coldkey_pair when the prefixed glossary label hyphen compound is word-order-reversed from the local title',
  );
  assert.ok(
    (linkGraph.batch_transactions || []).some((entry) => entry.target === 'extrinsics' && entry.text === 'Glossary: Extrinsic'),
    'generated linkgraph must recover the current batch_transactions body link to extrinsics when the prefixed glossary singular label misses but its plural concept article exists',
  );
  assert.ok(
    (linkGraph.bittensor_wallet || []).some((entry) => entry.target === 'wallets' && entry.text === 'Glossary: Bittensor Wallet'),
    'generated linkgraph must recover the current bittensor_wallet body link to wallets when the prefixed glossary singular wallet label self-resolves but its plural sibling concept article exists',
  );
  assert.ok(
    (linkGraph.tao || []).some((entry) => entry.target === 'tao_reserve' && entry.text === 'Glossary: TAO'),
    'generated linkgraph must recover the current tao body link to tao_reserve when the prefixed glossary short label self-resolves but its reserve compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.tao || []).some((entry) => entry.target === 'tao_weight' && entry.text === 'Glossary: TAO'),
    'generated linkgraph must recover the current tao body link to tao_weight when the prefixed glossary short label self-resolves but its weight compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.delegation || []).some((entry) => entry.target === 'delegation_rewards' && entry.text === 'Glossary: Delegation'),
    'generated linkgraph must recover the current delegation body link to delegation_rewards when the prefixed glossary short label self-resolves but its rewards compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.emission || []).some((entry) => entry.target === 'emission_split' && entry.text === 'Glossary: Emission'),
    'generated linkgraph must recover the current emission body link to emission_split when the prefixed glossary short label self-resolves but its split compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.halving || []).some((entry) => entry.target === 'halving_mechanisms' && entry.text === 'Glossary: Halving'),
    'generated linkgraph must recover the current halving body link to halving_mechanisms when the prefixed glossary short label self-resolves but its mechanisms compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.mempool || []).some((entry) => entry.target === 'mempool_visibility' && entry.text === 'Glossary: Mempool'),
    'generated linkgraph must recover the current mempool body link to mempool_visibility when the prefixed glossary short label self-resolves but its visibility compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.subnet || []).some((entry) => entry.target === 'subnet_protocol' && entry.text === 'Glossary: Subnet'),
    'generated linkgraph must recover the current subnet body link to subnet_protocol when the prefixed glossary short label self-resolves but its protocol compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.subnet || []).some((entry) => entry.target === 'subnet_validator' && entry.text === 'Glossary: Subnet'),
    'generated linkgraph must recover the current subnet body link to subnet_validator when the prefixed glossary short label self-resolves but its validator compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.subnet || []).some((entry) => entry.target === 'subnet_miner' && entry.text === 'Glossary: Subnet'),
    'generated linkgraph must recover the current subnet body link to subnet_miner when the prefixed glossary short label self-resolves but its miner compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.subnet || []).some((entry) => entry.target === 'subnet_weights' && entry.text === 'Glossary: Subnet'),
    'generated linkgraph must recover the current subnet body link to subnet_weights when the prefixed glossary short label self-resolves but its weights compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.subnet || []).some((entry) => entry.target === 'subnet_task' && entry.text === 'Glossary: Subnet'),
    'generated linkgraph must recover the current subnet body link to subnet_task when the prefixed glossary short label self-resolves but its task compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.subnet || []).some((entry) => entry.target === 'subnet_hyperparameters' && entry.text === 'Glossary: Subnet'),
    'generated linkgraph must recover the current subnet body link to subnet_hyperparameters when the prefixed glossary short label self-resolves but its hyperparameters compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.subnet || []).some((entry) => entry.target === 'subnet_registration' && entry.text === 'Glossary: Subnet'),
    'generated linkgraph must recover the current subnet body link to subnet_registration when the prefixed glossary short label self-resolves but its registration compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.subnet || []).some((entry) => entry.target === 'subnet_symbol' && entry.text === 'Glossary: Subnet'),
    'generated linkgraph must recover the current subnet body link to subnet_symbol when the prefixed glossary short label self-resolves but its symbol compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.subnet || []).some((entry) => entry.target === 'subnet_markets' && entry.text === 'Glossary: Subnet'),
    'generated linkgraph must recover the current subnet body link to subnet_markets when the prefixed glossary short label self-resolves but its markets compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.subnet || []).some((entry) => entry.target === 'subnet_lease' && entry.text === 'Glossary: Subnet'),
    'generated linkgraph must recover the current subnet body link to subnet_lease when the prefixed glossary short label self-resolves but its lease compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.subtensor || []).some((entry) => entry.target === 'subtensor_constants' && entry.text === 'Glossary: Subtensor'),
    'generated linkgraph must recover the current subtensor body link to subtensor_constants when the prefixed glossary short label self-resolves but its constants compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.subtensor || []).some((entry) => entry.target === 'subtensor_events' && entry.text === 'Glossary: Subtensor'),
    'generated linkgraph must recover the current subtensor body link to subtensor_events when the prefixed glossary short label self-resolves but its events compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.subtensor || []).some((entry) => entry.target === 'subtensor_storage' && entry.text === 'Glossary: Subtensor'),
    'generated linkgraph must recover the current subtensor body link to subtensor_storage when the prefixed glossary short label self-resolves but its storage compound sibling concept article exists',
  );
  assert.ok(
    (linkGraph.subtensor || []).some((entry) => entry.target === 'subtensor_error_codes' && entry.text === 'Glossary: Subtensor'),
    'generated linkgraph must recover the current subtensor body link to subtensor_error_codes when the prefixed glossary short label self-resolves but its error codes compound sibling concept article exists',
  );
  assert.ok(
    (backlinks.validator_take || []).some((entry) => entry.from === 'delegation'),
    'generated backlinks must list delegation under validator_take when a prefixed glossary alias falls back to the canonical glossary anchor',
  );
  assert.ok(
    (backlinks.drand_time_lock_encryption || []).some((entry) => entry.from === 'commit_reveal'),
    'generated backlinks must list commit_reveal under drand_time_lock_encryption when the visible glossary label uses slash-separated punctuation',
  );
  assert.ok(
    (backlinks.root_subnet || []).some((entry) => entry.from === 'netuid'),
    'generated backlinks must list netuid under root_subnet when a prefixed glossary slash label falls back to its first visible local alternative',
  );
  assert.ok(
    (backlinks.root_subnet || []).some((entry) => entry.from === 'alpha_staker'),
    'generated backlinks must list alpha_staker under root_subnet when a prefixed glossary slash label falls back to its first visible local alternative',
  );
  assert.ok(
    (backlinks.exponential_moving_averages || []).some((entry) => entry.from === 'validator_miner_bonds'),
    'generated backlinks must list validator_miner_bonds under exponential_moving_averages when a prefixed glossary acronym-parenthetical label falls back to the local plural concept article',
  );
  assert.ok(
    (backlinks.register || []).some((entry) => entry.from === 'subnet_weights'),
    'generated backlinks must list subnet_weights under register when a plain glossary label falls back to the canonical concept anchor',
  );
  assert.ok(
    (backlinks.uid_slot || []).some((entry) => entry.from === 'metagraph'),
    'generated backlinks must list metagraph under uid_slot when the body glossary link names the UID Slot concept article',
  );
  assert.ok(
    (backlinks.exponential_moving_averages || []).some((entry) => entry.from === 'yuma_consensus_3'),
    'generated backlinks must list yuma_consensus_3 under exponential_moving_averages when a prefixed glossary acronym-parenthetical label falls back to the local plural concept article',
  );
  assert.ok(
    (backlinks.alpha_distribution_ratio || []).some((entry) => entry.from === 'alpha_outstanding'),
    'generated backlinks must list alpha_outstanding under alpha_distribution_ratio when a prefixed glossary acronym falls back to the stripped canonical anchor',
  );
  assert.ok(
    (backlinks.hotkey_coldkey_pair || []).some((entry) => entry.from === 'hotkey_swap'),
    'generated backlinks must list hotkey_swap under hotkey_coldkey_pair when a prefixed glossary hyphen label falls back to its word-order-reversed local alternative',
  );
  assert.ok(
    (backlinks.hotkey_coldkey_pair || []).some((entry) => entry.from === 'wallets_coldkey_hotkey'),
    'generated backlinks must list wallets_coldkey_hotkey under hotkey_coldkey_pair when a prefixed glossary hyphen label falls back to its word-order-reversed local alternative',
  );
  assert.ok(
    (backlinks.hotkey_coldkey_pair || []).some((entry) => entry.from === 'coldkey_hotkey_workstation_security'),
    'generated backlinks must list coldkey_hotkey_workstation_security under hotkey_coldkey_pair when a prefixed glossary hyphen label falls back to its word-order-reversed local alternative',
  );
  assert.ok(
    (backlinks.extrinsics || []).some((entry) => entry.from === 'batch_transactions'),
    'generated backlinks must list batch_transactions under extrinsics when a prefixed glossary singular label falls back to its plural concept article',
  );
  assert.ok(
    (backlinks.wallets || []).some((entry) => entry.from === 'bittensor_wallet'),
    'generated backlinks must list bittensor_wallet under wallets when a prefixed glossary singular wallet label falls back to its plural sibling concept article',
  );
  assert.ok(
    (backlinks.tao_reserve || []).some((entry) => entry.from === 'tao'),
    'generated backlinks must list tao under tao_reserve when a prefixed glossary short label falls back to its reserve compound sibling concept article',
  );
  assert.ok(
    (backlinks.tao_weight || []).some((entry) => entry.from === 'tao'),
    'generated backlinks must list tao under tao_weight when a prefixed glossary short label falls back to its weight compound sibling concept article',
  );
  assert.ok(
    (backlinks.delegation_rewards || []).some((entry) => entry.from === 'delegation'),
    'generated backlinks must list delegation under delegation_rewards when a prefixed glossary short label falls back to its rewards compound sibling concept article',
  );
  assert.ok(
    (backlinks.emission_split || []).some((entry) => entry.from === 'emission'),
    'generated backlinks must list emission under emission_split when a prefixed glossary short label falls back to its split compound sibling concept article',
  );
  assert.ok(
    (backlinks.halving_mechanisms || []).some((entry) => entry.from === 'halving'),
    'generated backlinks must list halving under halving_mechanisms when a prefixed glossary short label falls back to its mechanisms compound sibling concept article',
  );
  assert.ok(
    (backlinks.mempool_visibility || []).some((entry) => entry.from === 'mempool'),
    'generated backlinks must list mempool under mempool_visibility when a prefixed glossary short label falls back to its visibility compound sibling concept article',
  );
  assert.ok(
    (backlinks.subnet_protocol || []).some((entry) => entry.from === 'subnet'),
    'generated backlinks must list subnet under subnet_protocol when a prefixed glossary short label falls back to its protocol compound sibling concept article',
  );
  assert.ok(
    (backlinks.subnet_validator || []).some((entry) => entry.from === 'subnet'),
    'generated backlinks must list subnet under subnet_validator when a prefixed glossary short label falls back to its validator compound sibling concept article',
  );
  assert.ok(
    (backlinks.subnet_miner || []).some((entry) => entry.from === 'subnet'),
    'generated backlinks must list subnet under subnet_miner when a prefixed glossary short label falls back to its miner compound sibling concept article',
  );
  assert.ok(
    (backlinks.subnet_weights || []).some((entry) => entry.from === 'subnet'),
    'generated backlinks must list subnet under subnet_weights when a prefixed glossary short label falls back to its weights compound sibling concept article',
  );
  assert.ok(
    (backlinks.subnet_task || []).some((entry) => entry.from === 'subnet'),
    'generated backlinks must list subnet under subnet_task when a prefixed glossary short label falls back to its task compound sibling concept article',
  );
  assert.ok(
    (backlinks.subnet_hyperparameters || []).some((entry) => entry.from === 'subnet'),
    'generated backlinks must list subnet under subnet_hyperparameters when a prefixed glossary short label falls back to its hyperparameters compound sibling concept article',
  );
  assert.ok(
    (backlinks.subnet_registration || []).some((entry) => entry.from === 'subnet'),
    'generated backlinks must list subnet under subnet_registration when a prefixed glossary short label falls back to its registration compound sibling concept article',
  );
  assert.ok(
    (backlinks.subnet_symbol || []).some((entry) => entry.from === 'subnet'),
    'generated backlinks must list subnet under subnet_symbol when a prefixed glossary short label falls back to its symbol compound sibling concept article',
  );
  assert.ok(
    (backlinks.subnet_markets || []).some((entry) => entry.from === 'subnet'),
    'generated backlinks must list subnet under subnet_markets when a prefixed glossary short label falls back to its markets compound sibling concept article',
  );
  assert.ok(
    (backlinks.subnet_lease || []).some((entry) => entry.from === 'subnet'),
    'generated backlinks must list subnet under subnet_lease when a prefixed glossary short label falls back to its lease compound sibling concept article',
  );
  assert.ok(
    (backlinks.subtensor_constants || []).some((entry) => entry.from === 'subtensor'),
    'generated backlinks must list subtensor under subtensor_constants when a prefixed glossary short label falls back to its constants compound sibling concept article',
  );
  assert.ok(
    (backlinks.subtensor_events || []).some((entry) => entry.from === 'subtensor'),
    'generated backlinks must list subtensor under subtensor_events when a prefixed glossary short label falls back to its events compound sibling concept article',
  );
  assert.ok(
    (backlinks.subtensor_storage || []).some((entry) => entry.from === 'subtensor'),
    'generated backlinks must list subtensor under subtensor_storage when a prefixed glossary short label falls back to its storage compound sibling concept article',
  );
  assert.ok(
    (backlinks.subtensor_error_codes || []).some((entry) => entry.from === 'subtensor'),
    'generated backlinks must list subtensor under subtensor_error_codes when a prefixed glossary short label falls back to its error codes compound sibling concept article',
  );
  assert.ok(
    !(linkGraph.tempo || []).some((entry) => entry.target === 'tempo'),
    'generated linkgraph must not create a self-link when a glossary markdown link names the current article itself',
  );
  assert.ok(
    !(linkGraph.mainchain || []).some((entry) => entry.target === 'mainchain'),
    'generated linkgraph must not create a self-link when a visible Glossary: label names the current article itself',
  );
  assert.ok(
    !(linkGraph.drand_time_lock_encryption || []).some((entry) => entry.target === 'drand_time_lock_encryption'),
    'generated linkgraph must not create a self-link when a slash-separated visible glossary label names the current article itself',
  );
  assert.ok(
    !(linkGraph.root_subnet || []).some((entry) => entry.target === 'root_subnet'),
    'generated linkgraph must not create a self-link when a slash-separated prefixed glossary label names the current article itself via its first visible local alternative',
  );
  assert.ok(
    !(linkGraph.alpha_distribution_ratio || []).some((entry) => entry.target === 'alpha_distribution_ratio'),
    'generated linkgraph must not create a self-link when a prefixed glossary acronym names the current article itself',
  );
}

console.log('Linkgraph generated-data order check passed');
