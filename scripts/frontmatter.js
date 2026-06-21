import YAML from 'yaml';

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n(?:\r?\n)?|$)/;

export function parseFrontmatter(input) {
  const source = String(input ?? '').replace(/^\uFEFF/, '');
  const match = source.match(frontmatterPattern);
  if (!match) return { data: {}, content: source };

  const data = YAML.parse(match[1]) ?? {};
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
