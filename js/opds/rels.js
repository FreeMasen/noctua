// Link-relation handling. OPDS 2.0 uses compact rels (`search`, `next`,
// `download`, `buy`…) but real servers also emit the legacy
// `http://opds-spec.org/...` forms, and `rel` may be a string OR an array.
// We match against alias sets so the rest of the app can ask by intent.

// Canonical intent -> the set of rel tokens that mean it.
const REL_ALIASES = {
  self: ["self"],
  start: ["start"],
  search: ["search"],
  next: ["next"],
  prev: ["previous", "prev"],
  first: ["first"],
  last: ["last"],
  // Acquisition intents
  download: ["download", "http://opds-spec.org/acquisition/open-access"],
  buy: ["buy", "http://opds-spec.org/acquisition/buy"],
  borrow: ["borrow", "http://opds-spec.org/acquisition/borrow"],
  preview: ["preview", "http://opds-spec.org/acquisition/sample"],
  subscribe: ["subscribe", "http://opds-spec.org/acquisition/subscribe"],
  acquire: ["acquisition", "http://opds-spec.org/acquisition"],
  // Images
  image: ["http://opds-spec.org/image", "cover"],
  thumbnail: ["http://opds-spec.org/image/thumbnail", "http://opds-spec.org/image/thumb"],
  // Auth
  authDocument: ["http://opds-spec.org/auth/document"],
};

// Any rel that indicates a link can be acquired (a downloadable/borrowable item).
export const ACQUISITION_INTENTS = ["download", "buy", "borrow", "preview", "subscribe", "acquire"];

/** Normalize a link's `rel` (string | string[] | undefined) to an array. */
export function relTokens(link) {
  const rel = link && link.rel;
  if (!rel) return [];
  return Array.isArray(rel) ? rel : [rel];
}

/** Does a link carry any rel token for the given intent? */
export function hasRel(link, intent) {
  const aliases = REL_ALIASES[intent];
  if (!aliases) return relTokens(link).includes(intent);
  const tokens = relTokens(link);
  return aliases.some((a) => tokens.includes(a));
}

/** First link in `links` matching the intent, or null. */
export function findLink(links, intent) {
  if (!Array.isArray(links)) return null;
  return links.find((l) => hasRel(l, intent)) || null;
}

/** All links matching the intent. */
export function findLinks(links, intent) {
  if (!Array.isArray(links)) return [];
  return links.filter((l) => hasRel(l, intent));
}

/**
 * Pick the best acquisition link from a publication's links, preferring an
 * open-access download, then borrow, preview, subscribe, buy, generic.
 * Returns { link, intent } or null.
 */
export function pickAcquisition(links) {
  for (const intent of ACQUISITION_INTENTS) {
    const link = findLink(links, intent);
    if (link) return { link, intent };
  }
  return null;
}

/**
 * Choose a cover image href from a publication's `images` array.
 * `preferThumb` picks the thumbnail when available (grid cards), otherwise the
 * full image (detail view). Falls back to whatever is present.
 */
export function pickImage(images, { preferThumb = false } = {}) {
  if (!Array.isArray(images) || images.length === 0) return null;
  const full = findLink(images, "image");
  const thumb = findLink(images, "thumbnail");
  const chosen = preferThumb ? thumb || full : full || thumb;
  return (chosen || images[0]).href || null;
}
