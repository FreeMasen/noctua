// Reading history and bookmarks — both are simple lists over IndexedDB.

import {
  getHistory, removeHistory, clearHistory,
  getBookmarks, removeBookmark, clearBookmarks,
} from "../db/idb.js";
import { cloneTemplate, setText } from "../ui/templates.js";
import { mountView, emptyState, toast } from "../ui/dom.js";
import { pubHash } from "../router.js";
import { formatDate } from "../ui/format.js";

function row(item, sub, onRemove) {
  const li = cloneTemplate("tmpl-list-row");
  const link = li.querySelector('[data-slot="link"]');
  link.href = item.selfHref ? pubHash(item.selfHref) : "#/";
  setText(li, "title", item.title);
  setText(li, "sub", sub);
  li.querySelector('[data-action="remove"]').addEventListener("click", (e) => {
    e.preventDefault();
    onRemove();
  });
  return li;
}

function page(title, items, { subFor, onRemove, onClear, emptyMessage }) {
  const section = document.createElement("section");
  section.className = "feed";

  const head = document.createElement("div");
  head.className = "group-head";
  const h = document.createElement("h1");
  h.className = "feed-title";
  h.textContent = title;
  head.appendChild(h);
  if (items.length && onClear) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "btn btn-quiet";
    clear.textContent = "Clear all";
    clear.addEventListener("click", onClear);
    head.appendChild(clear);
  }
  section.appendChild(head);

  if (!items.length) {
    section.appendChild(emptyState(emptyMessage));
    return section;
  }
  const ul = document.createElement("ul");
  ul.className = "list-rows";
  for (const it of items) ul.appendChild(row(it, subFor(it), () => onRemove(it)));
  section.appendChild(ul);
  return section;
}

export async function historyView() {
  const items = await getHistory();
  mountView(page("History", items, {
    subFor: (it) => [it.author, formatDate(it.lastViewedAt)].filter(Boolean).join(" · "),
    onRemove: async (it) => { await removeHistory(it.id); historyView(); },
    onClear: async () => { await clearHistory(); toast("History cleared."); historyView(); },
    emptyMessage: "No reading history yet. Open a publication and it'll appear here.",
  }));
}

export async function bookmarksView() {
  const items = await getBookmarks();
  mountView(page("Bookmarks", items, {
    subFor: (it) => [it.author, formatDate(it.createdAt)].filter(Boolean).join(" · "),
    onRemove: async (it) => { await removeBookmark(it.id); bookmarksView(); },
    onClear: async () => { await clearBookmarks(); toast("Bookmarks cleared."); bookmarksView(); },
    emptyMessage: "No bookmarks yet. Bookmark a publication from its detail page.",
  }));
}
