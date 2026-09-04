// Bootstrap: initialise storage, register routes, start the router.

import { route, startRouter, navigate } from "./router.js";
import { getCatalogUrl, setCatalogUrl } from "./db/idb.js";
import { mountView, toast } from "./ui/dom.js";
import { homeView, feedView } from "./views/feed.js";
import { publicationView } from "./views/publication.js";
import { searchView } from "./views/search.js";

// --- Placeholder views (replaced by real modules in later milestones) -------

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

// A working Settings view: view/change the catalog URL.
async function settingsView() {
  const url = await getCatalogUrl();

  const section = document.createElement("section");
  section.className = "feed";
  section.innerHTML = `
    <h1 class="feed-title">Settings</h1>
    <form class="settings-form">
      <label class="field">
        <span>Catalog URL</span>
        <input type="url" name="catalogUrl" required />
      </label>
      <div class="modal-actions" style="justify-content:flex-start">
        <button type="submit" class="btn btn-primary">Save</button>
        <a class="btn btn-quiet" href="#/">Back to catalog</a>
      </div>
    </form>`;
  section.querySelector('input[name="catalogUrl"]').value = url;

  section.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const next = new FormData(e.target).get("catalogUrl").trim();
    await setCatalogUrl(next);
    toast("Catalog URL saved.");
    navigate("#/");
  });

  mountView(section);
}

function registerRoutes() {
  route("home", homeView);
  route("feed", feedView);
  route("pub", publicationView);
  route("search", searchView);
  route("bookmarks", placeholder("Bookmarks", "Bookmarks arrive in a later milestone."));
  route("history", placeholder("History", "History arrives in a later milestone."));
  route("reader", placeholder("Reader", "The reader arrives in the final milestone."));
  route("settings", settingsView);
  route("notfound", placeholder("Not found", "That page doesn't exist."));
}

async function main() {
  registerRoutes();
  await getCatalogUrl(); // seed default on first run
  startRouter();
}

main();
