export interface RevisionStats {
  revisionCount: number;
  firstEdited: string | null;
  lastEdited: string | null;
}

// Derive an article's revision summary from its commit history (newest-first, the
// order historyForSlug returns): the total revision count, the original publication
// date (oldest entry, last in the list), and the last-edited date (newest entry,
// first in the list). Shared by the article-envelope and listing JSON endpoints that
// each inlined this identical three-field derivation.
export function revisionStats(history: ReadonlyArray<{ date?: string }>): RevisionStats {
  return {
    revisionCount: history.length,
    firstEdited: history[history.length - 1]?.date ?? null,
    lastEdited: history[0]?.date ?? null,
  };
}
