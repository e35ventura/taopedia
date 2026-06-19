import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateArticleJsonAsset } from './sync-articles.js';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taopedia-sync-json-'));

try {
  const articleDir = path.join(tempRoot, 'articles', 'content', 'pages', 'json_asset');
  const validJson = path.join(articleDir, 'metadata.json');
  const validInfobox = path.join(articleDir, 'infobox.json');
  const malformedInfobox = path.join(articleDir, 'malformed-infobox.json');
  const emptyJson = path.join(articleDir, 'empty.json');
  const infoboxFixturePath = (name) => {
    const fixtureDir = path.join(tempRoot, 'articles', 'content', 'pages', name);
    fs.mkdirSync(fixtureDir, { recursive: true });
    return path.join(fixtureDir, 'infobox.json');
  };
  const primitiveInfobox = infoboxFixturePath('primitive_infobox');
  const stringRowsInfobox = infoboxFixturePath('string_rows_infobox');
  const nullRowInfobox = infoboxFixturePath('null_row_infobox');
  const missingValueInfobox = infoboxFixturePath('missing_value_infobox');
  const unsafeImageInfobox = infoboxFixturePath('unsafe_image_infobox');
  const traversalImageInfobox = infoboxFixturePath('traversal_image_infobox');
  const unsafeRowValueInfobox = infoboxFixturePath('unsafe_row_value_infobox');
  const obfuscatedRowValueInfobox = infoboxFixturePath('obfuscated_row_value_infobox');
  const svgRowValueInfobox = infoboxFixturePath('svg_row_value_infobox');
  const scriptDataRowValueInfobox = infoboxFixturePath('script_data_row_value_infobox');
  const bidiTitleInfobox = infoboxFixturePath('bidi_title_infobox');
  const bidiCaptionInfobox = infoboxFixturePath('bidi_caption_infobox');
  const bidiRowLabelInfobox = infoboxFixturePath('bidi_row_label_infobox');
  const bidiRowValueInfobox = infoboxFixturePath('bidi_row_value_infobox');
  // Bidirectional control characters render in infobox text (title, caption,
  // labels, values) just like article body prose, so they carry the same Trojan
  // Source/spoofing risk. RLO = U+202E.
  const RLO = String.fromCharCode(0x202e);

  fs.mkdirSync(articleDir, { recursive: true });
  fs.writeFileSync(validJson, JSON.stringify({ rows: 'generic JSON assets may use any valid JSON shape' }));
  fs.writeFileSync(
    validInfobox,
    JSON.stringify({
      title: 'Valid Infobox',
      image: 'figure.png',
      caption: 'Fixture caption',
      rows: [{ label: 'Type', value: 'Fixture' }],
    }),
  );
  fs.writeFileSync(malformedInfobox, '{ invalid json');
  fs.writeFileSync(emptyJson, '');
  fs.writeFileSync(primitiveInfobox, JSON.stringify('not an object'));
  fs.writeFileSync(stringRowsInfobox, JSON.stringify({ rows: 'not an array' }));
  fs.writeFileSync(nullRowInfobox, JSON.stringify({ rows: [null] }));
  fs.writeFileSync(missingValueInfobox, JSON.stringify({ rows: [{ label: 'Type' }] }));
  fs.writeFileSync(unsafeImageInfobox, JSON.stringify({ image: 'javascript:alert(1)' }));
  fs.writeFileSync(traversalImageInfobox, JSON.stringify({ image: '../secret.png' }));
  fs.writeFileSync(
    unsafeRowValueInfobox,
    JSON.stringify({ rows: [{ label: 'Link', value: 'See [x](javascript:alert(1))' }] }),
  );
  fs.writeFileSync(
    obfuscatedRowValueInfobox,
    JSON.stringify({ rows: [{ label: 'Link', value: 'See [x](java&#115;cript:alert(1))' }] }),
  );
  fs.writeFileSync(
    svgRowValueInfobox,
    JSON.stringify({ rows: [{ label: 'Icon', value: 'data:image/svg+xml,<svg onload=alert(1)>' }] }),
  );
  fs.writeFileSync(
    scriptDataRowValueInfobox,
    JSON.stringify({ rows: [{ label: 'Payload', value: 'data:text/javascript,alert(1)' }] }),
  );
  fs.writeFileSync(
    bidiTitleInfobox,
    JSON.stringify({ title: `Stake${RLO}drainer`, rows: [{ label: 'Type', value: 'Fixture' }] }),
  );
  fs.writeFileSync(
    bidiCaptionInfobox,
    JSON.stringify({ caption: `Figure${RLO}spoof`, rows: [{ label: 'Type', value: 'Fixture' }] }),
  );
  fs.writeFileSync(
    bidiRowLabelInfobox,
    JSON.stringify({ rows: [{ label: `Net${RLO}work`, value: 'Fixture' }] }),
  );
  fs.writeFileSync(
    bidiRowValueInfobox,
    JSON.stringify({ rows: [{ label: 'Link', value: `docs.bittensor.com${RLO}/evil/` }] }),
  );

  assert.doesNotThrow(
    () => validateArticleJsonAsset(validJson),
    'valid JSON article assets should be accepted during sync',
  );
  assert.doesNotThrow(
    () => validateArticleJsonAsset(validInfobox),
    'valid infobox JSON assets should be accepted during sync',
  );
  assert.throws(
    () => validateArticleJsonAsset(malformedInfobox),
    /Malformed JSON asset.*malformed-infobox\.json/,
    'malformed infobox JSON should be rejected before Astro imports it',
  );
  assert.throws(
    () => validateArticleJsonAsset(emptyJson),
    /Malformed JSON asset.*empty\.json/,
    'empty JSON assets should be rejected before copying',
  );
  assert.throws(
    () => validateArticleJsonAsset(primitiveInfobox),
    /Invalid infobox JSON asset.*root must be an object/,
    'infobox JSON root must match the object shape the article renderer expects',
  );
  assert.throws(
    () => validateArticleJsonAsset(stringRowsInfobox),
    /Invalid infobox JSON asset.*rows must be an array/,
    'infobox rows must be an array before article rendering maps over it',
  );
  assert.throws(
    () => validateArticleJsonAsset(nullRowInfobox),
    /Invalid infobox JSON asset.*rows\[0\] must be an object/,
    'infobox rows must contain objects before article rendering reads row fields',
  );
  assert.throws(
    () => validateArticleJsonAsset(missingValueInfobox),
    /Invalid infobox JSON asset.*rows\[0\]\.value must be a string/,
    'infobox row values must be strings before article rendering parses wiki links',
  );
  assert.throws(
    () => validateArticleJsonAsset(unsafeImageInfobox),
    /Invalid infobox JSON asset.*image URL is not allowed/,
    'unsafe infobox image URLs should be rejected during sync',
  );
  assert.throws(
    () => validateArticleJsonAsset(traversalImageInfobox),
    /Invalid infobox JSON asset.*image URL is not allowed/,
    'traversal infobox image paths should be rejected during sync',
  );
  assert.throws(
    () => validateArticleJsonAsset(unsafeRowValueInfobox),
    /Invalid infobox JSON asset.*rows\[0\]\.value contains a disallowed URL scheme/,
    'javascript: URLs in infobox row values should be rejected during sync',
  );
  assert.throws(
    () => validateArticleJsonAsset(obfuscatedRowValueInfobox),
    /Invalid infobox JSON asset.*rows\[0\]\.value contains a disallowed URL scheme/,
    'entity-obfuscated javascript: URLs in infobox row values should be rejected during sync',
  );
  assert.throws(
    () => validateArticleJsonAsset(svgRowValueInfobox),
    /Invalid infobox JSON asset.*rows\[0\]\.value contains a disallowed URL scheme/,
    'SVG data URLs in infobox row values should be rejected during sync',
  );
  assert.throws(
    () => validateArticleJsonAsset(scriptDataRowValueInfobox),
    /Invalid infobox JSON asset.*rows\[0\]\.value contains a disallowed URL scheme/,
    'script data URLs in infobox row values should be rejected during sync',
  );
  assert.throws(
    () => validateArticleJsonAsset(bidiTitleInfobox),
    /Invalid infobox JSON asset.*title contains bidirectional control characters/,
    'bidi controls in the infobox title should be rejected during sync',
  );
  assert.throws(
    () => validateArticleJsonAsset(bidiCaptionInfobox),
    /Invalid infobox JSON asset.*caption contains bidirectional control characters/,
    'bidi controls in the infobox caption should be rejected during sync',
  );
  assert.throws(
    () => validateArticleJsonAsset(bidiRowLabelInfobox),
    /Invalid infobox JSON asset.*rows\[0\]\.label contains bidirectional control characters/,
    'bidi controls in an infobox row label should be rejected during sync',
  );
  assert.throws(
    () => validateArticleJsonAsset(bidiRowValueInfobox),
    /Invalid infobox JSON asset.*rows\[0\]\.value contains bidirectional control characters/,
    'bidi controls in an infobox row value should be rejected during sync',
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('Sync JSON asset validation check passed');
