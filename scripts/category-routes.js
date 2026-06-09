const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const safeRouteCharacterPattern = /^[A-Za-z0-9.-]$/;

export function categoryToRouteSegment(category) {
  let segment = '';

  for (const character of String(category ?? '').trim()) {
    if (character === ' ') {
      segment += '_';
    } else if (safeRouteCharacterPattern.test(character)) {
      segment += character;
    } else {
      for (const byte of textEncoder.encode(character)) {
        segment += `~${byte.toString(16).padStart(2, '0')}~`;
      }
    }
  }

  return segment;
}

export function categoryFromRouteSegment(segment) {
  const decodedSegment = decodeURIComponent(String(segment ?? ''));
  let category = '';
  let pendingBytes = [];

  const flushBytes = () => {
    if (pendingBytes.length === 0) return;
    category += textDecoder.decode(Uint8Array.from(pendingBytes));
    pendingBytes = [];
  };

  for (let index = 0; index < decodedSegment.length;) {
    const token = decodedSegment.slice(index).match(/^~([0-9a-fA-F]{2})~/);
    if (token) {
      pendingBytes.push(Number.parseInt(token[1], 16));
      index += token[0].length;
      continue;
    }

    flushBytes();
    category += decodedSegment[index] === '_' ? ' ' : decodedSegment[index];
    index += 1;
  }

  flushBytes();
  return category;
}

export function categoryHref(category) {
  return `/wiki/category/${encodeURIComponent(categoryToRouteSegment(category))}`;
}
