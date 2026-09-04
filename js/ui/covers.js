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
export async function setCover(container, href) {
  if (!href || !container) return;
  try {
    let objectUrl = cache.get(href);
    if (!objectUrl) {
      const headers = new Headers({ Accept: "image/*" });
      const auth = authHeader();
      if (auth) headers.set("Authorization", auth);
      const res = await fetch(href, { headers, credentials: "omit", mode: "cors" });
      if (!res.ok) return;
      objectUrl = URL.createObjectURL(await res.blob());
      cache.set(href, objectUrl);
    }
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    const fallback = container.querySelector(".pub-cover-fallback");
    img.addEventListener("load", () => {
      if (fallback) fallback.hidden = true;
    });
    img.src = objectUrl;
    container.appendChild(img);
  } catch {
    /* keep the fallback */
  }
}
