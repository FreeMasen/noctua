// OPDS Catalog 1.2 (Atom) parser. Produces the SAME normalized shape as the
// OPDS 2.0 parser in model.js, so the views don't care which format a catalog
// speaks. Built to the spec (https://specs.opds.io/opds-1.2); real catalogs
// like Project Gutenberg are only conformance tests.

import { resolveHref } from "./model.js";
import { findLink, findLinks, pickAcquisition, pickImage } from "./rels.js";

const NS = {
  atom: "http://www.w3.org/2005/Atom",
  dcterms: "http://purl.org/dc/terms/",
  dc: "http://purl.org/dc/elements/1.1/",
  opds: "http://opds-spec.org/2010/catalog",
  os: "http://a9.com/-/spec/opensearch/1.1/",
  thr: "http://purl.org/syndication/thread/1.0",
};

const ACQUISITION_PREFIX = "http://opds-spec.org/acquisition";
const FACET_REL = "http://opds-spec.org/facet";
const IMAGE_RELS = new Set(["http://opds-spec.org/image", "http://opds-spec.org/image/thumbnail"]);
const OPENSEARCH_TYPE = "application/opensearchdescription+xml";
const ENTRY_TYPE_HINT = "type=entry"; // a "complete entry" doc, not a browsable feed

// -------------------------------------------------------------- DOM helpers

/** Direct child elements with the given namespace + local name. */
function children(parent, ns, local) {
  const out = [];
  for (const node of parent.childNodes) {
    if (node.nodeType === 1 && node.localName === local && node.namespaceURI === ns) out.push(node);
  }
  return out;
}

function child(parent, ns, local) {
  return children(parent, ns, local)[0] || null;
}

function childText(parent, ns, local) {
  const el = child(parent, ns, local);
  const t = el && el.textContent;
  return t == null ? null : t.trim() || null;
}

/** Serialize an atom:content / atom:summary element to an HTML/text string. */
function textConstruct(el) {
  if (!el) return null;
  const type = (el.getAttribute("type") || "text").toLowerCase();
  if (type === "xhtml") {
    // Inline XHTML: serialize the children (usually a single wrapping <div>).
    const serializer = new XMLSerializer();
    let html = "";
    for (const node of el.childNodes) html += serializer.serializeToString(node);
    // Unwrap a single top-level <div> wrapper if present.
    return html.replace(/^\s*<div[^>]*>/i, "").replace(/<\/div>\s*$/i, "").trim() || null;
  }
  // "text" and "html" are both carried as character data.
  const t = el.textContent;
  return t == null ? null : t.trim() || null;
}

// -------------------------------------------------------------- link parsing

function isAcquisitionRel(rel) {
  return typeof rel === "string" && rel.startsWith(ACQUISITION_PREFIX);
}

/** Turn an atom:link element into the same link object shape model.js uses. */
function parseLink(el, base) {
  const properties = {};
  const count = el.getAttributeNS(NS.thr, "count") || el.getAttribute("count");
  if (count != null && count !== "") properties.numberOfItems = Number(count);

  const priceEl = child(el, NS.opds, "price");
  if (priceEl) {
    const value = parseFloat(priceEl.textContent);
    if (!Number.isNaN(value)) {
      properties.price = { value, currency: priceEl.getAttribute("currencycode") || undefined };
    }
  }

  const facetGroup = el.getAttributeNS(NS.opds, "facetGroup") || el.getAttribute("facetGroup");
  if (facetGroup) properties.facetGroup = facetGroup;
  const active = el.getAttributeNS(NS.opds, "activeFacet") || el.getAttribute("activeFacet");
  if (active === "true") properties.active = true;

  return {
    rel: el.getAttribute("rel") || undefined,
    href: resolveHref(el.getAttribute("href"), base),
    type: el.getAttribute("type") || undefined,
    title: el.getAttribute("title") || undefined,
    properties: Object.keys(properties).length ? properties : undefined,
  };
}

const linkCount = (l) => l && l.properties && l.properties.numberOfItems;

// ------------------------------------------------------------- entry parsing

function authorNames(entry) {
  return children(entry, NS.atom, "author")
    .map((a) => childText(a, NS.atom, "name"))
    .filter(Boolean)
    .join(", ");
}

function description(entry) {
  return textConstruct(child(entry, NS.atom, "content")) || textConstruct(child(entry, NS.atom, "summary"));
}

/** An acquisition entry -> a normalized publication. */
function parsePublicationEntry(entry, links) {
  const images = links.filter((l) => IMAGE_RELS.has(l.rel));
  return {
    raw: entry,
    // Atom entries are inline; there is no fetchable OPDS-publication document.
    id: childText(entry, NS.atom, "id"),
    title: childText(entry, NS.atom, "title") || "Untitled",
    author: authorNames(entry),
    description: description(entry),
    language: childText(entry, NS.dcterms, "language") || childText(entry, NS.dc, "language"),
    published: childText(entry, NS.dcterms, "issued") || childText(entry, NS.atom, "updated"),
    publisher: childText(entry, NS.dcterms, "publisher") || childText(entry, NS.dc, "publisher"),
    selfHref: null, // rendered inline; not a JSON publication document
    coverHref: pickImage(images, { preferThumb: true }),
    fullCoverHref: pickImage(images, { preferThumb: false }),
    acquisition: pickAcquisition(links),
    links,
    images,
  };
}

/** A navigation entry -> a browse item pointing at another feed. */
function parseNavigationEntry(entry, links) {
  // Prefer a link that targets an OPDS catalog feed (not a complete-entry doc).
  const feedLink =
    links.find((l) => l.type && l.type.includes("profile=opds-catalog") && !l.type.includes(ENTRY_TYPE_HINT)) ||
    links.find((l) => !IMAGE_RELS.has(l.rel) && l.rel !== "self");
  const images = links.filter((l) => IMAGE_RELS.has(l.rel));
  return {
    title: childText(entry, NS.atom, "title") || (feedLink && feedLink.href) || "",
    href: feedLink ? feedLink.href : null,
    count: feedLink ? linkCount(feedLink) : undefined,
    image: pickImage(images, { preferThumb: true }),
  };
}

// ---------------------------------------------------------------- facets

function parseFacets(feedLinks) {
  const facetLinks = feedLinks.filter((l) => l.rel === FACET_REL);
  if (facetLinks.length === 0) return [];
  const groups = new Map();
  for (const l of facetLinks) {
    const name = (l.properties && l.properties.facetGroup) || "Filter";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push({
      title: l.title || l.href,
      href: l.href,
      count: linkCount(l),
      active: Boolean(l.properties && l.properties.active),
    });
  }
  return [...groups.entries()].map(([title, links]) => ({ title, links }));
}

// ------------------------------------------------------------------ feed

/**
 * Parse an OPDS 1.2 Atom document into the normalized feed shape.
 * `url` is the document URL (for relative href resolution).
 */
export function parseAtomFeed(xmlText, url) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const feed = doc.documentElement;
  if (!feed || feed.localName !== "feed" || doc.getElementsByTagName("parsererror").length) {
    throw new Error("Not a valid OPDS 1.x (Atom) feed.");
  }

  const links = children(feed, NS.atom, "link").map((l) => parseLink(l, url));

  const navigation = [];
  const publications = [];
  for (const entry of children(feed, NS.atom, "entry")) {
    const entryLinks = children(entry, NS.atom, "link").map((l) => parseLink(l, url));
    if (entryLinks.some((l) => isAcquisitionRel(l.rel))) {
      publications.push(parsePublicationEntry(entry, entryLinks));
    } else {
      navigation.push(parseNavigationEntry(entry, entryLinks));
    }
  }

  const paging = {};
  for (const rel of ["self", "first", "prev", "next", "last", "start"]) {
    const l = findLink(links, rel);
    paging[rel] = l ? l.href : null;
  }

  const searchEl = links.find((l) => l.rel === "search");
  const searchLink = searchEl
    ? { href: searchEl.href, opensearch: (searchEl.type || "").includes("opensearchdescription") }
    : null;

  const total = childText(feed, NS.os, "totalResults");

  return {
    raw: feed,
    url,
    format: "opds1",
    title: childText(feed, NS.atom, "title") || "Catalog",
    subtitle: childText(feed, NS.atom, "subtitle"),
    numberOfItems: total != null ? Number(total) : undefined,
    itemsPerPage: undefined,
    currentPage: undefined,
    links,
    searchLink,
    navigation,
    groups: [], // OPDS 1.x has no groups
    publications,
    facets: parseFacets(links),
    paging,
  };
}
