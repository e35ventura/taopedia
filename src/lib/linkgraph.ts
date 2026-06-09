export interface BacklinkEntry {
  from: string;
  fromTitle: string;
}

export interface WantedPage {
  slug: string;
  count: number;
}

export interface OrphanPage {
  slug: string;
  title: string;
}

export type BacklinksMap = Record<string, BacklinkEntry[]>;

export function getBacklinksFor(backlinks: BacklinksMap, slug: string): BacklinkEntry[] {
  return backlinks[slug] ?? [];
}
