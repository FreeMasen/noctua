// Search view. Discovers the catalog's templated search link, builds a form
// from its variables, expands the template on submit, and renders the results
// through the generic feed view (search results are just an OPDS feed).

import { fetchJson } from "../http.js";
import { parseFeed } from "../opds/model.js";
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

/** Route handler for #/search (optionally pre-filled via query params). */
export async function searchView(params) {
  renderLoading();
  let catalogUrl;
  try {
    catalogUrl = await getCatalogUrl();
    const root = parseFeed(await fetchJson(catalogUrl), catalogUrl);
    if (!root.searchLink || !root.searchLink.href) {
      renderError("This catalog doesn't advertise a search endpoint.");
      return;
    }
    const template = root.searchLink.href;
    const vars = templateVars(template);
    mountView(buildForm(template, vars.length ? vars : ["query"], params || {}));
  } catch (err) {
    renderError(err && err.message ? err.message : String(err), () => searchView(params));
  }
}
