import YAML from 'yaml';

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n(?:\r?\n)?|$)/;

function quoteColonPlainScalars(source) {
  return source
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^([A-Za-z_][\w-]*:\s+)([^"'[{|>&*!%@`#][^#]*:\s+[^#]*)$/);
      if (!match) return line;
      return `${match[1]}${JSON.stringify(match[2].trimEnd())}`;
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
