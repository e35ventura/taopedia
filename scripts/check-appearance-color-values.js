import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Guards that every radio in the AppearancePanel Color group carries a `value`
// attribute. A radio with no value reports the default string "on" for
// `input.value`, so without explicit values the three color options
// (Automatic / Light / Dark) are indistinguishable: any handler that reads
// `input.value` to pick the theme — the same pattern the appearance control
// uses (applyColorTheme(input.value), setCheckedInput comparing
// input.value === value) — sees "on" for every option and can neither tell
// them apart nor re-check the right radio for a stored preference. The Text and
// Width groups in the same component already carry explicit values, so this
// keeps the Color group consistent with them.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const componentFile = path.join(
  projectRoot,
  'src',
  'features',
  'wiki',
  'components',
  'AppearancePanel.astro',
);

const source = fs.readFileSync(componentFile, 'utf8');

const colorInputs = source.match(/<input[^>]*name="ap-color"[^>]*>/g) ?? [];
assert.ok(colorInputs.length >= 2, `expected the Color radio group in AppearancePanel.astro, found ${colorInputs.length} ap-color inputs`);

const values = [];
for (const input of colorInputs) {
  const match = input.match(/\bvalue="([^"]*)"/);
  assert.ok(match, `every Color radio must carry a value attribute, but found one without it: ${input}`);
  assert.ok(match[1].trim() !== '', `Color radio value attribute must be non-empty: ${input}`);
  values.push(match[1]);
}

// The whole point of the values is that the options are distinguishable, so no
// two Color radios may share a value.
assert.equal(new Set(values).size, values.length, `Color radio values must be distinct, got: ${values.join(', ')}`);

console.log(`Appearance color-values check passed (${values.length} Color radios, distinct values: ${values.join(', ')})`);
