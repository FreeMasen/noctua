// Search view. Discovers the catalog's templated search link, builds a form
// from its variables, expands the template on submit, and renders the results
// through the generic feed view (search results are just an OPDS feed).

import { fetchFeed } from "../http.js";
import { templateVars, expandTemplate } from "../opds/uritemplate.js";
import { mountView, renderLoading, renderError, toast } from "../ui/dom.js";
import { getCatalogUrl } from "../db/idb.js";
import { feedHash, navigate } from "../router.js";

const LABELS = { query: "Search", title: "Title", author: "Author", publisher: "Publisher" };

function label(name) {
  return LABELS[name] || name.charAt(0).toUpperCase() + name.slice(1);
}

function buildForm(template, vars, prefill) {
  const section = document.createElement("section");
  section.className = "feed";

  const h = document.createElement("h1");
  h.className = "feed-title";
  h.textContent = "Search";
  section.appendChild(h);

  const form = document.createElement("form");
  form.className = "search-form";

  // Put `query` first if present; keep the rest in template order.
  const ordered = [...vars].sort((a, b) => (a === "query" ? -1 : b === "query" ? 1 : 0));
  for (const name of ordered) {
    const field = document.createElement("label");
    field.className = "field";
    const span = document.createElement("span");
    span.textContent = label(name);
    const input = document.createElement("input");
    input.type = "search";
    input.name = name;
    input.value = prefill[name] || "";
    if (name === "query") input.required = true;
    field.append(span, input);
    form.appendChild(field);
  }

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  actions.style.justifyContent = "flex-start";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "btn btn-primary";
  submit.textContent = "Search";
  actions.appendChild(submit);
  form.appendChild(actions);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const values = {};
    for (const [k, v] of new FormData(form)) values[k] = String(v).trim();
    if (!Object.values(values).some((v) => v)) {
      toast("Enter a search term.", { error: true });
      return;
    }
    const url = expandTemplate(template, values);
    navigate(feedHash(url));
  });

  section.appendChild(form);
  return section;
}

const OPENSEARCH_NS = "http://a9.com/-/spec/opensearch/1.1/";

/**
 * Resolve an OpenSearch Description Document (OPDS 1.x search) into a Noctua
 * URI template: pick an OPDS/Atom result URL and map OpenSearch placeholders
 * ({searchTerms}, {atom:author}, {atom:title}) to our {query}/{author}/{title}.
 */
async function resolveOpenSearch(osdUrl) {
  let res;
  try {
    res = await fetch(osdUrl, {
      headers: { Accept: "application/opensearchdescription+xml" },
      mode: "cors",
      credentials: "omit",
    });
  } catch {
    // The OpenSearch document often lives on an endpoint that doesn't send CORS
    // headers (e.g. Project Gutenberg), so the browser blocks reading it.
    return null;
  }
  if (!res.ok) return null;
  const doc = new DOMParser().parseFromString(await res.text(), "application/xml");
  const urls = [...doc.getElementsByTagNameNS(OPENSEARCH_NS, "Url")].filter(
    (u) => (u.getAttribute("rel") || "results") !== "suggestions",
  );
  const byType = (frag) => urls.find((u) => (u.getAttribute("type") || "").includes(frag));
  const pick = byType("opds-catalog") || byType("atom+xml") || byType("opds+json") || urls[0];
  let template = pick && pick.getAttribute("template");
  if (!template) return null;
  if (!/^https?:/i.test(template)) {
    template = new URL(template, osdUrl).href.replace(/%7B/gi, "{").replace(/%7D/gi, "}");
  }
  return template
    .replace(/^http:/i, "https:") // avoid mixed content when we're on https
    .replace(/\{searchTerms\}/g, "{query}")
    .replace(/\{atom:author\}/g, "{author}")
    .replace(/\{atom:title\}/g, "{title}")
    .replace(/\{[A-Za-z:]+\?\}/g, ""); // drop unsupported optional parameters
}

/** Route handler for #/search (optionally pre-filled via query params). */
export async function searchView(params) {
  renderLoading();
  try {
    const root = await fetchFeed(await getCatalogUrl());
    if (!root.searchLink || !root.searchLink.href) {
      renderError("This catalog doesn't advertise a search endpoint.");
      return;
    }
    const template = root.searchLink.opensearch
      ? await resolveOpenSearch(root.searchLink.href)
      : root.searchLink.href;
    if (!template) {
      renderError(
        root.searchLink.opensearch
          ? "This catalog's search can't be used from the browser — its OpenSearch description doesn't allow cross-origin access (CORS)."
          : "Couldn't read this catalog's search description.",
      );
      return;
    }
    const vars = templateVars(template);
    mountView(buildForm(template, vars.length ? vars : ["query"], params || {}));
  } catch (err) {
    renderError(err && err.message ? err.message : String(err), () => searchView(params));
  }
}
