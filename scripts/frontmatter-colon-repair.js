// Repair YAML frontmatter so plain scalars containing colon-space are quoted
// before YAML.parse. Without repair, YAML silently parses many shapes as nested
// mappings instead of the intended plain strings — a data-corruption bug at
// article ingest that poisons categories, aliases, seeAlso, and infobox values.
//
// Kept as a pure module so frontmatter.js stays a thin parse/stringify wrapper
// and this repair matrix can be regression-tested independently.

export const COLON_PLAIN_SCALAR = /^[^"'[{|>&*!%@`#].*:\s+.+$/;

export function splitFlowList(value) {
  const parts = [];
  let current = '';
  let inQuote = false;
  let quote = '';
  let depth = 0;
  for (const ch of value) {
    if ((ch === '"' || ch === "'") && (!inQuote || ch === quote)) {
      inQuote = !inQuote;
      quote = inQuote ? ch : '';
      current += ch;
    } else if (!inQuote) {
      if (ch === '{' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ']') depth -= 1;
      else if (ch === ',' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
      current += ch;
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function quoteColonFlowToken(token) {
  const trimmed = token.trim();
  if (!trimmed || /^["']/.test(trimmed)) return token;

  // Flow mapping entry inside a flow sequence: { label: Subnet 4: Targon, value: "42" }
  const flowMapMatch = trimmed.match(/^\{([\s\S]*)\}$/);
  if (flowMapMatch) {
    const lead = token.match(/^\s*/)[0];
    const trail = token.match(/\s*$/)[0];
    return `${lead}{${quoteColonFlowMappingValues(flowMapMatch[1])}}${trail}`;
  }

  if (/^[\[{]/.test(trimmed)) return token;
  if (/^[A-Za-z_][\w-]*:\s+/.test(trimmed)) return token;
  if (!COLON_PLAIN_SCALAR.test(trimmed)) return token;
  const lead = token.match(/^\s*/)[0];
  const trail = token.match(/\s*$/)[0];
  return `${lead}${JSON.stringify(trimmed)}${trail}`;
}

function quoteColonFlowMappingValues(inner) {
  return inner.replace(/([A-Za-z_][\w-]*:\s+)([^,}{]+)/g, (part, keyPart, valPart) => {
    const value = valPart.trim();
    if (!COLON_PLAIN_SCALAR.test(value)) return part;
    return `${keyPart}${JSON.stringify(value)}`;
  });
}

export function quoteColonFlowCollections(line) {
  return line
    .replace(
      /^(\s*[A-Za-z_][\w-]*:\s*)\[([^\]]*)\](.*)$/,
      (match, prefix, inner, suffix) =>
        `${prefix}[${splitFlowList(inner).map(quoteColonFlowToken).join(',')}]${suffix}`,
    )
    .replace(
      /^(\s*[A-Za-z_][\w-]*:\s*)\{([^}]*)\}(.*)$/,
      (match, prefix, inner, suffix) => `${prefix}{${quoteColonFlowMappingValues(inner)}}${suffix}`,
    );
}

export function quoteColonPlainScalars(source) {
  return source
    .split(/\r?\n/)
    .map((line) => {
      line = quoteColonFlowCollections(line);

      const match = line.match(/^(\s*(?:-\s+)?[A-Za-z_][\w-]*:\s+)(.+)$/);
      if (match) {
        const remainder = match[2];
        const commentMatch = remainder.match(/^(.*?)(\s+#.*)$/);
        const value = (commentMatch?.[1] ?? remainder).trimEnd();
        const comment = commentMatch?.[2] ?? '';

        if (!COLON_PLAIN_SCALAR.test(value)) return line;
        return `${match[1]}${JSON.stringify(value)}${comment}`;
      }

      // Bare block-list scalars (`  - Subnet 4: Targon`) — #1503 / #1486 guard.
      const listMatch = line.match(/^(\s*-\s+)(.+)$/);
      if (listMatch) {
        const remainder = listMatch[2];
        if (/^[A-Za-z_][\w-]*:\s+/.test(remainder)) return line;

        const commentMatch = remainder.match(/^(.*?)(\s+#.*)$/);
        const value = (commentMatch?.[1] ?? remainder).trimEnd();
        const comment = commentMatch?.[2] ?? '';

        if (!COLON_PLAIN_SCALAR.test(value)) return line;
        return `${listMatch[1]}${JSON.stringify(value)}${comment}`;
      }

      return line;
    })
    .join('\n');
}
