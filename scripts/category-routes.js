export function categoryToRouteSegment(category) {
  return encodeURIComponent(String(category ?? '').trim().replace(/ /g, '_'));
}

export function categoryHref(category) {
  return `/wiki/category/${categoryToRouteSegment(category)}`;
}
