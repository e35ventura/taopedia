const LOCAL_IMAGE_EXTENSION_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)$/i;
const PASSTHROUGH_IMAGE_URL_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i;

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
  if (isPassthroughImageUrl(trimmed)) return trimmed;

  const localPath = normalizeArticleLocalImagePath(trimmed);
  if (!localPath) {
    return hasLocalImagePathTraversal(trimmed) ? undefined : trimmed;
  }

  return imageAssets[`../../content/pages/${articleSlug}/${localPath}`] ?? trimmed;
}
