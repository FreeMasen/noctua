// Cover images. Cross-origin <img> can't carry an Authorization header, so we
// fetch the image with the session credential and hand the element an object
// URL instead. Object URLs are cached per-session and reused.

import { authHeader } from "../opds/auth.js";

const cache = new Map(); // href -> objectURL

/**
 * Load a cover into a container that holds a `.pub-cover-fallback` child.
 * On success the fetched image is appended and the fallback hidden. On any
 * failure the fallback stays — this is intentionally non-interactive (it never
 * triggers a login prompt; feeds authenticate before covers are requested).
 */
function attach(container, src) {
  const img = document.createElement("img");
  img.alt = "";
  img.decoding = "async";
  img.loading = "lazy";
  const fallback = container.querySelector(".pub-cover-fallback");
  img.addEventListener("load", () => {
    // Some catalogs put tiny generic placeholder icons in listings (e.g. a
    // 22x22 png). Don't upscale those into a cover slot — keep our fallback.
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

export async function setCover(container, href) {
  if (!href || !container) return;

  // Data URIs and public (no-credential) catalogs: a plain <img> is simplest
  // and dodges CORS entirely (images render cross-origin without it). The
  // authed blob path is only needed to attach an Authorization header.
  if (href.startsWith("data:") || !authHeader()) {
    attach(container, href);
    return;
  }

  try {
    let objectUrl = cache.get(href);
    if (!objectUrl) {
      const res = await fetch(href, {
        headers: new Headers({ Accept: "image/*", Authorization: authHeader() }),
        credentials: "omit",
        mode: "cors",
      });
      if (!res.ok) return;
      objectUrl = URL.createObjectURL(await res.blob());
      cache.set(href, objectUrl);
    }
    attach(container, objectUrl);
  } catch {
    /* keep the fallback */
  }
}
