// Cover images. Cross-origin <img> can't carry an Authorization header, so for
// an authed catalog we fetch the bytes with the credential and cache the blob
// in IndexedDB. That cache is read first, so covers keep showing across sessions
// without re-login (and offline). Object URLs are reused within a session.

import { authHeader } from "../opds/auth.js";
import { getCachedCover, putCachedCover } from "../db/idb.js";

const objectUrls = new Map(); // href -> object URL (session reuse)

function attach(container, src) {
  const img = document.createElement("img");
  img.alt = "";
  img.decoding = "async";
  img.loading = "lazy";
  const fallback = container.querySelector(".pub-cover-fallback");
  img.addEventListener("load", () => {
    // Skip tiny placeholder icons some catalogs use in listings.
    if (img.naturalWidth && img.naturalWidth < 48) {
      img.remove();
      return;
    }
    if (fallback) fallback.hidden = true;
  });
  img.addEventListener("error", () => img.remove());
  img.src = src;
  container.appendChild(img);
}

function attachBlob(container, href, blob) {
  const url = URL.createObjectURL(blob);
  objectUrls.set(href, url);
  attach(container, url);
}

export async function setCover(container, href) {
  if (!href || !container) return;

  // Data URIs render directly; nothing to fetch or cache.
  if (href.startsWith("data:")) {
    attach(container, href);
    return;
  }

  // Reuse a session object URL, then the persisted IndexedDB blob.
  const reused = objectUrls.get(href);
  if (reused) {
    attach(container, reused);
    return;
  }
  try {
    const cached = await getCachedCover(href);
    if (cached && cached.blob) {
      attachBlob(container, href, cached.blob);
      return;
    }
  } catch {
    /* fall through to network */
  }

  const auth = authHeader();
  if (auth) {
    // Authenticated catalog: fetch with the credential and persist the blob so
    // the cover survives logout/reload.
    try {
      const res = await fetch(href, {
        headers: new Headers({ Accept: "image/*", Authorization: auth }),
        credentials: "omit",
        mode: "cors",
      });
      if (!res.ok) return;
      const blob = await res.blob();
      putCachedCover(href, blob).catch(() => {});
      attachBlob(container, href, blob);
    } catch {
      /* keep the fallback */
    }
    return;
  }

  // No credential: a plain <img> works for public covers; for an authed catalog
  // while logged out the fallback shows until it's cached during a signed-in load.
  attach(container, href);
}
