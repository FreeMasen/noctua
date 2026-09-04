// Publication detail view: cover, metadata, sanitized description, and
// acquisition actions. Open-access/sample links download via authenticated
// fetch; store links (buy/borrow/subscribe) open externally.

import { fetchJson, fetchBlob, MEDIA } from "../http.js";
import { parsePublication } from "../opds/model.js";
import { findLinks, ACQUISITION_INTENTS } from "../opds/rels.js";
import { cloneTemplate, setText, show } from "../ui/templates.js";
import { mountView, renderLoading, renderError, toast } from "../ui/dom.js";
import { setCover } from "../ui/covers.js";
import { sanitizeHtml } from "../ui/sanitize.js";
import { slugify, extForType, formatDate } from "../ui/format.js";

const ACQ_LABELS = {
  download: "Download",
  preview: "Download sample",
  borrow: "Borrow",
  buy: "Buy",
  subscribe: "Subscribe",
  acquire: "Get",
};
// Intents we fetch directly as a file; the rest are treated as external flows.
const DIRECT = new Set(["download", "preview", "acquire"]);

/** Collect unique acquisition links with their intent, download-first. */
function acquisitions(pub) {
  const seen = new Set();
  const out = [];
  for (const intent of ACQUISITION_INTENTS) {
    for (const link of findLinks(pub.links, intent)) {
      if (seen.has(link.href)) continue;
      seen.add(link.href);
      out.push({ intent, link });
    }
  }
  return out;
}

function priceLabel(link) {
  const p = link.properties && link.properties.price;
  if (!p || p.value == null) return "";
  try {
    return ` (${new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency || "USD" }).format(p.value)})`;
  } catch {
    return ` (${p.value} ${p.currency || ""})`.trimEnd();
  }
}

async function downloadDirect(pub, link, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Downloading…";
  try {
    const blob = await fetchBlob(link.href, { accept: link.type || "*/*" });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${slugify(pub.title)}.${extForType(link.type)}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    toast("Download started.");
  } catch (err) {
    toast(err && err.message ? err.message : "Download failed.", { error: true });
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function buildActions(pub) {
  const frag = document.createDocumentFragment();
  const items = acquisitions(pub);
  if (items.length === 0) {
    const span = document.createElement("span");
    span.className = "pub-detail-note";
    span.textContent = "No acquisition links offered.";
    frag.appendChild(span);
    return frag;
  }
  items.forEach(({ intent, link }, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = i === 0 ? "btn btn-primary" : "btn";
    btn.textContent = (ACQ_LABELS[intent] || "Get") + priceLabel(link);
    if (DIRECT.has(intent)) {
      btn.addEventListener("click", () => downloadDirect(pub, link, btn));
    } else {
      btn.addEventListener("click", () => {
        window.open(link.href, "_blank", "noopener");
        toast("Opening the catalog's acquisition page…");
      });
    }
    frag.appendChild(btn);
  });
  return frag;
}

function addFact(dl, key, value) {
  if (!value) return;
  const fact = cloneTemplate("tmpl-fact");
  setText(fact, "key", key);
  setText(fact, "value", value);
  dl.appendChild(fact);
}

function renderDetail(pub) {
  const root = cloneTemplate("tmpl-pub-detail");
  setText(root, "title", pub.title);
  setText(root, "author", pub.author || "");
  setCover(root.querySelector('[data-slot="cover"]'), pub.fullCoverHref || pub.coverHref);

  const facts = root.querySelector('[data-slot="facts"]');
  addFact(facts, "Language", pub.language);
  addFact(facts, "Published", formatDate(pub.published || pub.modified));
  addFact(facts, "Publisher", pub.publisher);

  root.querySelector('[data-slot="actions"]').appendChild(buildActions(pub));

  const desc = root.querySelector('[data-slot="description"]');
  if (pub.description) desc.appendChild(sanitizeHtml(pub.description));
  else show(desc, false);

  return root;
}

async function load(url) {
  renderLoading();
  try {
    const json = await fetchJson(url, { accept: MEDIA.publication });
    mountView(renderDetail(parsePublication(json, url)));
  } catch (err) {
    renderError(err && err.message ? err.message : String(err), () => load(url));
  }
}

/** Route handler for #/pub?u=<encoded self href>. */
export async function publicationView(params) {
  if (!params.u) {
    renderError("No publication specified.");
    return;
  }
  await load(decodeURIComponent(params.u));
}
