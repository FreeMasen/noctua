// The generic feed view. Because categories, authors, "all", search results and
// pagination are all just links discovered in feeds, this one renderer handles
// the home page and every drill-down.

import { fetchJson } from "../http.js";
import { parseFeed } from "../opds/model.js";
import { cloneTemplate, setText, show, slot } from "../ui/templates.js";
import { mountView, renderLoading, renderError } from "../ui/dom.js";
import { setCover } from "../ui/covers.js";
import { feedHash, pubHash, navigate } from "../router.js";
import { getCatalogUrl } from "../db/idb.js";

// -------------------------------------------------------------- builders

function buildNavList(title, items) {
  const node = cloneTemplate("tmpl-nav-list");
  if (title) show(setText(node, "title", title), true);
  const list = node.querySelector('[data-slot="items"]');
  for (const item of items) {
    const li = cloneTemplate("tmpl-nav-item");
    const link = li.querySelector('[data-slot="link"]');
    link.href = feedHash(item.href);
    setText(li, "title", item.title);
    if (item.count != null) show(setText(li, "count", item.count), true);
    list.appendChild(li);
  }
  return node;
}

function buildPubGrid(pubs) {
  const node = cloneTemplate("tmpl-pub-grid");
  const grid = slot(node, "items"); // the grid node itself carries data-slot="items"
  for (const pub of pubs) {
    const card = cloneTemplate("tmpl-pub-card");
    const link = slot(card, "link"); // the card <a> itself carries data-slot="link"
    link.href = pub.selfHref ? pubHash(pub.selfHref) : "#/";
    setText(card, "title", pub.title);
    setText(card, "author", pub.author);
    setCover(slot(card, "cover"), pub.coverHref);
    grid.appendChild(card);
  }
  return node;
}

function buildGroup(group) {
  const node = cloneTemplate("tmpl-group");
  setText(node, "title", group.title);
  const more = node.querySelector('[data-slot="more"]');
  if (group.more) {
    more.href = feedHash(group.more);
    more.hidden = false;
  }
  const body = node.querySelector('[data-slot="body"]');
  if (group.publications && group.publications.length) {
    body.appendChild(buildPubGrid(group.publications));
  } else if (group.navigation && group.navigation.length) {
    body.appendChild(buildNavList(null, group.navigation));
  }
  return node;
}

function buildFacetGroup(facet) {
  const node = cloneTemplate("tmpl-facet-group");
  setText(node, "title", facet.title);
  const list = node.querySelector('[data-slot="items"]');
  for (const link of facet.links) {
    const li = cloneTemplate("tmpl-facet-link");
    const a = li.querySelector('[data-slot="link"]');
    a.href = feedHash(link.href);
    if (link.active) a.classList.add("active");
    setText(li, "title", link.title);
    if (link.count != null) show(setText(li, "count", link.count), true);
    list.appendChild(li);
  }
  return node;
}

function pagerStatus(feed) {
  const { currentPage, numberOfItems, itemsPerPage } = feed;
  if (currentPage && numberOfItems && itemsPerPage) {
    const total = Math.max(1, Math.ceil(numberOfItems / itemsPerPage));
    return `Page ${currentPage} of ${total}`;
  }
  if (currentPage) return `Page ${currentPage}`;
  return "";
}

function buildPager(feed) {
  const { paging } = feed;
  const hasControls = paging.first || paging.prev || paging.next || paging.last;
  if (!hasControls) return null;

  const node = cloneTemplate("tmpl-pager");
  setText(node, "status", pagerStatus(feed));

  const wire = (name, href, isBack) => {
    const btn = node.querySelector(`[data-slot="${name}"]`);
    if (!href) return;
    btn.hidden = false;
    // Disable back-links that just point at the current page.
    if (isBack && href === paging.self) btn.disabled = true;
    else btn.addEventListener("click", () => navigate(feedHash(href)));
  };
  wire("first", paging.first, true);
  wire("prev", paging.prev, true);
  wire("next", paging.next, false);
  wire("last", paging.last, false);
  return node;
}

function renderFeed(feed) {
  const root = cloneTemplate("tmpl-feed");
  setText(root, "title", feed.title);
  if (feed.subtitle) show(setText(root, "subtitle", feed.subtitle), true);
  const sections = root.querySelector('[data-slot="sections"]');

  if (feed.navigation.length) sections.appendChild(buildNavList(null, feed.navigation));
  for (const group of feed.groups) sections.appendChild(buildGroup(group));
  if (feed.publications.length) sections.appendChild(buildPubGrid(feed.publications));
  for (const facet of feed.facets) sections.appendChild(buildFacetGroup(facet));

  const pager = buildPager(feed);
  if (pager) sections.appendChild(pager);
  return root;
}

// ---------------------------------------------------------------- routes

async function loadAndRender(url) {
  renderLoading();
  try {
    const json = await fetchJson(url);
    mountView(renderFeed(parseFeed(json, url)));
  } catch (err) {
    renderError(err && err.message ? err.message : String(err), () => loadAndRender(url));
  }
}

/** Route handler for #/feed?u=<encoded href>. */
export async function feedView(params) {
  const url = params.u ? decodeURIComponent(params.u) : await getCatalogUrl();
  await loadAndRender(url);
}

/** Route handler for #/ (the configured catalog root). */
export async function homeView() {
  await loadAndRender(await getCatalogUrl());
}
