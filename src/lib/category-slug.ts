export function categorySlug(name: string): string {
  return name.toLowerCase().replace(/ /g, '_');
}
