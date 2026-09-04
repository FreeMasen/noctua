// Fetch layer for talking to an OPDS catalog. Attaches the session credential,
// handles the 401 -> Authentication-for-OPDS -> login -> retry flow, and
// dispatches by media type.

import { authHeader, parseAuthDocument, promptLogin } from "./opds/auth.js";
import { parseFeed } from "./opds/model.js";
import { parseAtomFeed } from "./opds/atom.js";

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
 * Fetch a catalog feed and return the normalized model, auto-detecting OPDS 2.0
 * (JSON) vs OPDS 1.x (Atom) by content type, with a body-sniff fallback.
 */
export async function fetchFeed(url, { signal } = {}) {
  const res = await authedRequest(url, { accept: FEED_ACCEPT, signal });
  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  const body = await res.text();
  const head = body.trimStart()[0];

  const looksJson = ctype.includes("json") || (!ctype.includes("xml") && head === "{");
  if (looksJson) {
    try {
      return parseFeed(JSON.parse(body), url);
    } catch {
      /* fall through to Atom */
    }
  }
  return parseAtomFeed(body, url);
}

/** Fetch and parse a JSON document (an OPDS 2.0 publication), honouring 401. */
export async function fetchJson(url, { accept = MEDIA.feed, signal } = {}) {
  const res = await authedRequest(url, { accept, signal });
  return res.json();
}

/** Fetch a binary resource (cover, epub) as a Blob, honouring auth + 401. */
export async function fetchBlob(url, { accept, signal } = {}) {
  const res = await authedRequest(url, { accept, signal });
  return res.blob();
}
