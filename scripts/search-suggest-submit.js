// Shared contract for search form submit in the typeahead combobox. Whitespace-only
// input must not navigate to /search/; real queries are trimmed before submit.

export function resolveSearchSubmit(rawValue) {
  const trimmed = String(rawValue ?? '').trim();
  if (!trimmed) return { submit: false, value: '' };
  return { submit: true, value: trimmed };
}

/** Apply the submit guard (used by SearchSuggest.astro and regression tests). */
export function applySearchSubmit(rawValue, { preventDefault, setValue, closeList }) {
  const { submit, value } = resolveSearchSubmit(rawValue);
  if (!submit) {
    preventDefault();
    setValue('');
    closeList();
    return;
  }
  if (value !== rawValue) setValue(value);
}
