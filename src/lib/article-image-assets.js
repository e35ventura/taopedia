const LOCAL_IMAGE_EXTENSION_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const PASSTHROUGH_IMAGE_URL_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i;
const UNSAFE_IMAGE_URL_PATTERN = /^(?:javascript|vbscript)\s*:|^data\s*:\s*(?:text\/html|image\/svg\+xml)/i;

function decodePathSegments(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isPassthroughImageUrl(value) {
  return PASSTHROUGH_IMAGE_URL_PATTERN.test(value);
}

function stripUrlObfuscationChars(value) {
  let result = '';
  for (const char of value) {
    const code = char.codePointAt(0);
    const isControl = code <= 0x1f || code === 0x7f;
    const isZeroWidth = (code >= 0x200b && code <= 0x200d) || code === 0xfeff;
    if (!isControl && !isZeroWidth) {
      result += char;
    }
  }
  return result;
}

function fromCodePoint(codePoint, fallback) {
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : fallback;
}

function decodeUrlSchemeObfuscation(value) {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (match, hex) => fromCodePoint(Number.parseInt(hex, 16), match))
    .replace(/&#(\d+);?/g, (match, dec) => fromCodePoint(Number.parseInt(dec, 10), match))
    .replace(/&colon;/gi, ':')
    .replace(/&sol;/gi, '/')
    .replace(/&(?:tab|newline);/gi, '');
}

export function isUnsafeImageUrl(value) {
  if (typeof value !== 'string') return false;

  return UNSAFE_IMAGE_URL_PATTERN.test(
    stripUrlObfuscationChars(decodeUrlSchemeObfuscation(value.trim())),
  );
}

export function normalizeArticleLocalImagePath(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || isPassthroughImageUrl(trimmed)) return null;

  const withoutDotPrefix = trimmed.replace(/^\.\/+/, '');
  const normalized = withoutDotPrefix.replace(/\\/g, '/');
  const decoded = decodePathSegments(normalized);
  const segments = decoded.split('/');

  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..')
    || !LOCAL_IMAGE_EXTENSION_PATTERN.test(decoded)
  ) {
    return null;
  }

  return normalized;
}

export function hasLocalImagePathTraversal(value) {
  if (typeof value !== 'string') return false;

  const trimmed = value.trim();
  if (!trimmed || isPassthroughImageUrl(trimmed)) return false;

  const normalized = trimmed.replace(/\\/g, '/');
  const decoded = decodePathSegments(normalized);
  return decoded.split('/').some((segment) => segment === '..');
}

export function resolveArticleImageSource(articleSlug, value, imageAssets) {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (isUnsafeImageUrl(trimmed)) return undefined;
  if (isPassthroughImageUrl(trimmed)) return trimmed;

  const localPath = normalizeArticleLocalImagePath(trimmed);
  if (!localPath) {
    return hasLocalImagePathTraversal(trimmed) ? undefined : trimmed;
  }

  return imageAssets[`../../content/pages/${articleSlug}/${localPath}`] ?? trimmed;
}
