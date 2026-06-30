type GlobbedDefaultModule<T> = { default?: T };

export function globbedDefault<T>(
  modules: Record<string, GlobbedDefaultModule<T>>,
  fallback: T,
): T {
  return Object.values(modules)[0]?.default ?? fallback;
}

export function publishedSlugsFromSlugMap(
  slugMap: Record<string, { title?: string } | undefined>,
): string[] {
  return Object.keys(slugMap).filter((slug) => slugMap[slug]?.title);
}
