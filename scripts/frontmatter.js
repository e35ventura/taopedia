import YAML from 'yaml';

// The YAML body between the fences is optional so a zero-line block (`---\n---`)
// is recognized too: without the optional group an empty block fails to match and
// its fences leak into `content`, unlike every other block shape this parser
// strips (missing, non-object, CRLF, BOM, blank-line body). The body group still
// requires its trailing newline, so a mid-line `---` (e.g. `foo---`) is NOT a
// valid close and stays in the body as before.
const frontmatterPattern = /^---\r?\n(?:([\s\S]*?)\r?\n)?---(?:\r?\n(?:\r?\n)?|$)/;

function quoteColonPlainScalars(source) {
  return source
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^(\s*(?:-\s+)?[A-Za-z_][\w-]*:\s+)(.+)$/);
      if (match) {
        const remainder = match[2];
        const commentMatch = remainder.match(/^(.*?)(\s+#.*)$/);
        const value = (commentMatch?.[1] ?? remainder).trimEnd();
        const comment = commentMatch?.[2] ?? '';

        if (!/^[^"'[{|>&*!%@`#].*:\s+.+$/.test(value)) return line;
        return `${match[1]}${JSON.stringify(value)}${comment}`;
      }

      // Bare list scalars (`  - Subnet 4: Targon`) have no `key:` token, so the
      // mapping pattern above never matches and YAML silently parses the item as
      // a one-key map. Only quote when the remainder is NOT a mapping-style list
      // entry (`  - label: Netuid` is handled by the pattern above and must not
      // be wrapped as a single quoted scalar — the rejection on #1486).
      const listMatch = line.match(/^(\s*-\s+)(.+)$/);
      if (listMatch) {
        const remainder = listMatch[2];
        if (/^[A-Za-z_][\w-]*:\s+/.test(remainder)) return line;

        const commentMatch = remainder.match(/^(.*?)(\s+#.*)$/);
        const value = (commentMatch?.[1] ?? remainder).trimEnd();
        const comment = commentMatch?.[2] ?? '';

        if (!/^[^"'[{|>&*!%@`#].*:\s+.+$/.test(value)) return line;
        return `${listMatch[1]}${JSON.stringify(value)}${comment}`;
      }

      return line;
    })
    .join('\n');
}

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
