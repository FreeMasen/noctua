// Fetch layer for talking to an OPDS catalog. Attaches the session credential,
// handles the 401 -> Authentication-for-OPDS -> login -> retry flow, and
// dispatches by media type.

import { authHeader, parseAuthDocument, promptLogin } from "./opds/auth.js";
import { parseFeed } from "./opds/model.js";
import { parseAtomFeed } from "./opds/atom.js";
import { getCachedDoc, putCachedDoc } from "./db/idb.js";

export const MEDIA = {
  feed: "application/opds+json",
  publication: "application/opds-publication+json",
  auth: "application/opds-authentication+json",
  atom: "application/atom+xml",
};

// Accept both OPDS 2.0 (JSON) and OPDS 1.x (Atom). All bytes here are
// CORS-safelisted, so no-auth requests to public catalogs avoid a preflight.
const FEED_ACCEPT = "application/opds+json, application/atom+xml, application/json";

export class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Low-level fetch with the credential + Accept header attached. */
function request(url, { accept, headers = {}, signal } = {}) {
  const h = new Headers(headers);
  if (accept) h.set("Accept", accept);
  const auth = authHeader();
  if (auth) h.set("Authorization", auth);
  // We attach Authorization manually, so cookies aren't needed: omit credentials.
  return fetch(url, { method: "GET", headers: h, credentials: "omit", mode: "cors", signal });
}

/** Parse the auth document from a 401 response body, or follow its Link header. */
async function readAuthDocument(res, url) {
  try {
    const json = await res.clone().json();
    if (json && json.authentication) return parseAuthDocument(json);
  } catch {
    /* not a JSON auth doc; fall through */
  }
  const linkHeader = res.headers.get("link");
  const href = linkHeader && parseLinkHeader(linkHeader)["http://opds-spec.org/auth/document"];
  if (href) {
    try {
      const doc = await request(new URL(href, url).href, { accept: MEDIA.auth }).then((r) => r.json());
      return parseAuthDocument(doc);
    } catch {
      /* fall through to generic */
    }
  }
  return { title: "Sign in", description: null, logoHref: null, basic: { loginLabel: "Username", passwordLabel: "Password" } };
}

/** Minimal RFC 5988 Link header parser -> { rel: href }. */
export function parseLinkHeader(value) {
  const out = {};
  for (const part of value.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel\s*=\s*"?([^";]+)"?/i);
    if (m) out[m[2].trim()] = m[1].trim();
  }
  return out;
}

/**
 * Perform a GET, transparently handling a 401 by reading the Authentication
 * for OPDS document, prompting for login once, and retrying. Returns the ok
 * Response or throws an HttpError.
 */
async function authedRequest(url, { accept, signal } = {}) {
  let res;
  try {
    res = await request(url, { accept, signal });
  } catch {
    // A CORS or network failure surfaces as a TypeError with no status.
    throw new HttpError(
      "Couldn't reach the catalog. Check the URL, your connection, and that the server allows this origin (CORS).",
      0,
    );
  }

  if (res.status === 401) {
    const authDoc = await readAuthDocument(res, url);
    const ok = await promptLogin(authDoc);
    if (!ok) throw new HttpError("Sign-in cancelled.", 401);
    res = await request(url, { accept, signal });
    if (res.status === 401) throw new HttpError("Those credentials were rejected.", 401);
  }

  if (!res.ok) throw new HttpError(`Request failed (${res.status} ${res.statusText}).`, res.status);
  return res;
}

/**
 * Cache-first fetch of a catalog document (feed or publication), returning its
 * raw `{ contentType, body }`. Reads from the IndexedDB catalog cache when
 * present, so browsing costs no network — and no login. The network (and thus
 * the password prompt) is only touched on a cache miss or an explicit refresh.
 */
export async function fetchDoc(url, { refresh = false, accept = FEED_ACCEPT, signal } = {}) {
  if (!refresh) {
    const cached = await getCachedDoc(url);
    if (cached) return { contentType: cached.contentType, body: cached.body };
  }
  const res = await authedRequest(url, { accept, signal });
  const contentType = res.headers.get("content-type") || "";
  const body = await res.text();
  putCachedDoc(url, contentType, body).catch(() => {}); // persist for offline / no-auth browsing
  return { contentType, body };
}

/** Detect OPDS 2.0 (JSON) vs OPDS 1.x (Atom) and parse into the normalized model. */
function parseFeedBody(contentType, body, url) {
  const ct = (contentType || "").toLowerCase();
  const head = body.trimStart()[0];
  const looksJson = ct.includes("json") || (!ct.includes("xml") && head === "{");
  if (looksJson) {
    try {
      return parseFeed(JSON.parse(body), url);
    } catch {
      /* fall through to Atom */
    }
  }
  return parseAtomFeed(body, url);
}

/** Fetch a feed (cache-first) and return the normalized model. */
export async function fetchFeed(url, { refresh = false, signal } = {}) {
  const { contentType, body } = await fetchDoc(url, { refresh, accept: FEED_ACCEPT, signal });
  return parseFeedBody(contentType, body, url);
}

/** Fetch a JSON document (an OPDS 2.0 publication), cache-first. */
export async function fetchJson(url, { accept = MEDIA.feed, refresh = false, signal } = {}) {
  const { body } = await fetchDoc(url, { refresh, accept, signal });
  return JSON.parse(body);
}

/** Fetch a binary resource (cover, epub) as a Blob, honouring auth + 401. */
export async function fetchBlob(url, { accept, signal } = {}) {
  const res = await authedRequest(url, { accept, signal });
  return res.blob();
}
