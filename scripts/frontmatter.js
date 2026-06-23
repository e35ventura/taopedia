import YAML from 'yaml';

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n(?:\r?\n)?|$)/;

function quoteColonPlainScalars(source) {
  return source
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^(\s*(?:-\s+)?[A-Za-z_][\w-]*:\s+)(.+)$/);
      if (!match) return line;

      const remainder = match[2];
      const commentMatch = remainder.match(/^(.*?)(\s+#.*)$/);
      const value = (commentMatch?.[1] ?? remainder).trimEnd();
      const comment = commentMatch?.[2] ?? '';

      if (!/^[^"'[{|>&*!%@`#].*:\s+.+$/.test(value)) return line;
      return `${match[1]}${JSON.stringify(value)}${comment}`;
    })
    .join('\n');
}

function parseYamlFrontmatter(source) {
  try {
    return YAML.parse(source) ?? {};
  } catch (error) {
    const repaired = quoteColonPlainScalars(source);
    if (repaired === source) throw error;
    try {
      return YAML.parse(repaired) ?? {};
    } catch {
      throw error;
    }
  }
}

export function parseFrontmatter(input) {
  const source = String(input ?? '').replace(/^\uFEFF/, '');
  const match = source.match(frontmatterPattern);
  if (!match) return { data: {}, content: source };

  const data = parseYamlFrontmatter(match[1]);
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
