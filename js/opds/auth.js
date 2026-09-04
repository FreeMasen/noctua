// Authentication for OPDS 1.0 — Basic flow only.
// The credential lives in memory for the session and is NEVER persisted.

let credential = null; // base64("user:pass") or null

/** UTF-8 safe base64 (btoa alone mishandles non-Latin1). */
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function isAuthenticated() {
  return credential !== null;
}

/** The Authorization header value, or null when signed out. */
export function authHeader() {
  return credential ? `Basic ${credential}` : null;
}

export function setCredential(username, password) {
  credential = utf8ToBase64(`${username}:${password}`);
}

export function clearCredential() {
  credential = null;
}

const AUTH_BASIC = "http://opds-spec.org/auth/basic";

function relList(link) {
  const rel = link && link.rel;
  return rel ? (Array.isArray(rel) ? rel : [rel]) : [];
}

/** Parse an Authentication for OPDS document into what the login modal needs. */
export function parseAuthDocument(json) {
  const flows = Array.isArray(json && json.authentication) ? json.authentication : [];
  const basic = flows.find((f) => f && f.type === AUTH_BASIC);
  const links = Array.isArray(json && json.links) ? json.links : [];
  const logo = links.find((l) => relList(l).includes("logo"));
  return {
    title: (json && json.title) || "Sign in",
    description: (json && json.description) || null,
    logoHref: logo ? logo.href : null,
    basic: basic
      ? {
          loginLabel: (basic.labels && basic.labels.login) || "Username",
          passwordLabel: (basic.labels && basic.labels.password) || "Password",
        }
      : null,
  };
}

/**
 * Show the login modal for an auth document and resolve to true once a
 * credential is captured, or false if the user cancels. UI is loaded lazily to
 * avoid an import cycle with the view layer.
 */
export async function promptLogin(authDoc) {
  const { showLoginModal } = await import("../views/login.js");
  return showLoginModal(authDoc);
}
