// Session cache for publications rendered inline (OPDS 1.x entries and compact
// OPDS 2.0 publications have no fetchable document). Cards for these link to
// #/pub?ref=<key>; the detail view reads the stashed object back. Memory-only,
// so a reloaded deep link falls back gracefully.

let seq = 0;
const cache = new Map();

/** Stash a normalized publication and return a lookup key. */
export function stashPublication(pub) {
  const key = String(++seq);
  cache.set(key, pub);
  return key;
}

export function getStashedPublication(key) {
  return cache.get(key) || null;
}
