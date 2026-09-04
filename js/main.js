// Bootstrap: initialise storage/theme, register routes, start the router.

import { route, startRouter } from "./router.js";
import { getCatalogUrl } from "./db/idb.js";
import { mountView } from "./ui/dom.js";
import { initTheme } from "./ui/theme.js";
import { homeView, feedView } from "./views/feed.js";
import { publicationView } from "./views/publication.js";
import { searchView } from "./views/search.js";
import { historyView, bookmarksView } from "./views/library.js";
import { settingsView } from "./views/settings.js";

function placeholder(title, note) {
  return () => {
    const section = document.createElement("section");
    section.className = "feed";
    const h = document.createElement("h1");
    h.className = "feed-title";
    h.textContent = title;
    const p = document.createElement("p");
    p.className = "feed-subtitle";
    p.textContent = note;
    section.append(h, p);
    mountView(section);
  };
}

function registerRoutes() {
  route("home", homeView);
  route("feed", feedView);
  route("pub", publicationView);
  route("search", searchView);
  route("bookmarks", bookmarksView);
  route("history", historyView);
  route("settings", settingsView);
  route("reader", placeholder("Reader", "The reader arrives in the final milestone."));
  route("notfound", placeholder("Not found", "That page doesn't exist."));
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // Registration needs a secure context (https or localhost); ignore failures.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

async function main() {
  registerRoutes();
  await initTheme();
  await getCatalogUrl(); // seed default on first run
  startRouter();
  registerServiceWorker();
}

main();
