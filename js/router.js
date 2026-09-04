// A minimal hash router. Everything keys off a URL: browsing a feed, a
// publication, or a reader location is just a hash carrying an encoded href.

const routes = new Map();

/** Register an async handler for a route name. */
export function route(name, handler) {
  routes.set(name, handler);
}

/** Parse the current location hash into { name, params }. */
export function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  const name = path.replace(/^\/+/, "").replace(/\/+$/, "") || "home";
  const params = Object.fromEntries(new URLSearchParams(query));
  return { name, params };
}

// ------------------------------------------------------- hash builders

/** Hash for viewing any feed by its href. */
export function feedHash(url) {
  return `#/feed?u=${encodeURIComponent(url)}`;
}

/** Hash for a publication detail by its self href. */
export function pubHash(url) {
  return `#/pub?u=${encodeURIComponent(url)}`;
}

/** Hash for an inline publication (no fetchable document) by cache key. */
export function pubRefHash(key) {
  return `#/pub?ref=${encodeURIComponent(key)}`;
}

/** Hash for the reader: the file href, its media type, and book id/title. */
export function readerHash({ href, type, id, title }) {
  const q = new URLSearchParams({ u: href, t: type || "", id: id || "", title: title || "" });
  return `#/reader?${q.toString()}`;
}

/** Programmatic navigation. */
export function navigate(hash) {
  if (location.hash === hash) handleRoute();
  else location.hash = hash;
}

function updateNav(name) {
  const active = { home: "home", feed: "home", pub: "home", search: "search",
    bookmarks: "bookmarks", history: "history", settings: "settings" }[name];
  for (const a of document.querySelectorAll(".app-nav a")) {
    a.classList.toggle("active", a.dataset.nav === active);
  }
}

async function handleRoute() {
  const { name, params } = parseHash();
  updateNav(name);
  const handler = routes.get(name) || routes.get("notfound");
  if (!handler) return;
  try {
    await handler(params);
  } catch (err) {
    console.error("route handler failed", err);
    const { renderError } = await import("./ui/dom.js");
    renderError(err && err.message ? err.message : String(err), () => handleRoute());
  }
}

/** Wire up the router and dispatch the initial route. */
export function startRouter() {
  window.addEventListener("hashchange", handleRoute);
  handleRoute();
}
