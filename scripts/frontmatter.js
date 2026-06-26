import YAML from 'yaml';
import { quoteColonPlainScalars } from './frontmatter-colon-repair.js';

// The YAML body between the fences is optional so a zero-line block (`---\n---`)
// is recognized too: without the optional group an empty block fails to match and
// its fences leak into `content`, unlike every other block shape this parser
// strips (missing, non-object, CRLF, BOM, blank-line body). The body group still
// requires its trailing newline, so a mid-line `---` (e.g. `foo---`) is NOT a
// valid close and stays in the body as before.
const frontmatterPattern = /^---\r?\n(?:([\s\S]*?)\r?\n)?---(?:\r?\n(?:\r?\n)?|$)/;

function parseYamlFrontmatter(source) {
  const prepared = quoteColonPlainScalars(source);
  try {
    return YAML.parse(prepared) ?? {};
  } catch (error) {
    throw error;
  }
}

export function parseFrontmatter(input) {
  const source = String(input ?? '').replace(/^\uFEFF/, '');
  const match = source.match(frontmatterPattern);
  if (!match) return { data: {}, content: source };

  const data = parseYamlFrontmatter(match[1] ?? '');
  const content = source.slice(match[0].length);
  return {
    data: typeof data === 'object' && data !== null && !Array.isArray(data) ? data : {},
    content,
  };
}

parseFrontmatter.stringify = function stringifyFrontmatter(content, data = {}) {
  const yaml = YAML.stringify(data).trimEnd();
  return `---\n${yaml}\n---\n\n${String(content ?? '').replace(/^\r?\n/, '')}`;
};

export default parseFrontmatter;
