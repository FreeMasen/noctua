// Normalize raw OPDS 2.0 JSON into shapes the views can render directly.
// Hrefs are resolved to absolute against the document URL (the spec permits
// relative links; templated links are left verbatim for later expansion).

import { findLink, findLinks, pickAcquisition, pickImage, relTokens } from "./rels.js";

/** Resolve a possibly-relative href against a base document URL. */
export function resolveHref(href, base) {
  if (!href) return href;
  // Leave URI Templates (RFC 6570) untouched — {…} must survive for expansion.
  if (href.includes("{")) return href;
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function resolveLinks(links, base) {
  if (!Array.isArray(links)) return [];
  return links.map((l) => ({ ...l, href: resolveHref(l.href, base) }));
}

/** Flatten an OPDS author value (object | array | string) into a display string. */
export function authorText(meta) {
  const a = meta && meta.author;
  if (!a) return "";
  const names = (Array.isArray(a) ? a : [a]).map((x) => (typeof x === "string" ? x : x && x.name)).filter(Boolean);
  return names.join(", ");
}

/** Number-of-items hint from a link's `properties`, if any. */
function linkCount(link) {
  return link && link.properties && link.properties.numberOfItems;
}

/** Normalize a single publication. */
export function parsePublication(pub, base) {
  const meta = pub.metadata || {};
  const links = resolveLinks(pub.links, base);
  const images = resolveLinks(pub.images, base);
  const self = findLink(links, "self");
  return {
    raw: pub,
    id: meta.identifier || (self && self.href) || null,
    title: meta.title || "Untitled",
    author: authorText(meta),
    description: meta.description || null,
    language: meta.language || null,
    published: meta.published || null,
    modified: meta.modified || null,
    publisher: meta.publisher && (meta.publisher.name || meta.publisher) || null,
    selfHref: self ? self.href : null,
    coverHref: pickImage(images, { preferThumb: true }),
    fullCoverHref: pickImage(images, { preferThumb: false }),
    acquisition: pickAcquisition(links),
    links,
    images,
  };
}

function parseNavItem(link) {
  return {
    title: link.title || link.href,
    href: link.href,
    count: linkCount(link),
    rel: relTokens(link),
  };
}

function parseGroup(group, base) {
  const meta = group.metadata || {};
  const links = resolveLinks(group.links, base);
  const self = findLink(links, "self");
  return {
    title: meta.title || "",
    count: meta.numberOfItems,
    more: self ? self.href : null,
    navigation: Array.isArray(group.navigation)
      ? resolveLinks(group.navigation, base).map(parseNavItem)
      : null,
    publications: Array.isArray(group.publications)
      ? group.publications.map((p) => parsePublication(p, base))
      : null,
  };
}

function parseFacet(facet, base) {
  const meta = facet.metadata || {};
  const links = resolveLinks(facet.links, base);
  return {
    title: meta.title || "",
    links: links.map((l) => ({
      title: l.title || l.href,
      href: l.href,
      count: linkCount(l),
      active: findLinks([l], "self").length > 0,
    })),
  };
}

/**
 * Normalize a feed (catalog) collection.
 * `url` is the URL the document was fetched from (for href resolution).
 */
export function parseFeed(json, url) {
  const meta = json.metadata || {};
  const links = resolveLinks(json.links, url);
  const paging = {};
  for (const rel of ["self", "first", "prev", "next", "last", "start"]) {
    const l = findLink(links, rel);
    paging[rel] = l ? l.href : null;
  }
  return {
    raw: json,
    url,
    title: meta.title || "Catalog",
    subtitle: meta.description || null,
    numberOfItems: meta.numberOfItems,
    itemsPerPage: meta.itemsPerPage,
    currentPage: meta.currentPage,
    links,
    searchLink: findLink(links, "search"),
    navigation: Array.isArray(json.navigation)
      ? resolveLinks(json.navigation, url).map(parseNavItem)
      : [],
    groups: Array.isArray(json.groups) ? json.groups.map((g) => parseGroup(g, url)) : [],
    publications: Array.isArray(json.publications)
      ? json.publications.map((p) => parsePublication(p, url))
      : [],
    facets: Array.isArray(json.facets) ? json.facets.map((f) => parseFacet(f, url)) : [],
    paging,
  };
}
