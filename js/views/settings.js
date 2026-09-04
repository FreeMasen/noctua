// Settings: catalog URL, theme, session (sign out), and local data.

import {
  getCatalogUrl, setCatalogUrl, getTheme, setTheme,
  clearHistory, clearBookmarks, clearCatalogCache,
} from "../db/idb.js";
import { clearCredential, isAuthenticated } from "../opds/auth.js";
import { applyTheme } from "../ui/theme.js";
import { mountView, toast } from "../ui/dom.js";
import { navigate } from "../router.js";

function fieldLabel(text, control) {
  const label = document.createElement("label");
  label.className = "field";
  const span = document.createElement("span");
  span.textContent = text;
  label.append(span, control);
  return label;
}

function actionRow(...buttons) {
  const row = document.createElement("div");
  row.className = "modal-actions";
  row.style.justifyContent = "flex-start";
  row.append(...buttons);
  return row;
}

function button(text, { primary = false, quiet = false, onClick } = {}) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn" + (primary ? " btn-primary" : quiet ? " btn-quiet" : "");
  b.textContent = text;
  if (onClick) b.addEventListener("click", onClick);
  return b;
}

export async function settingsView() {
  const [url, theme] = [await getCatalogUrl(), await getTheme()];

  const section = document.createElement("section");
  section.className = "feed";
  const h = document.createElement("h1");
  h.className = "feed-title";
  h.textContent = "Settings";
  section.appendChild(h);

  // --- Catalog + theme form
  const form = document.createElement("form");
  form.className = "settings-form";

  const urlInput = document.createElement("input");
  urlInput.type = "url";
  urlInput.name = "catalogUrl";
  urlInput.required = true;
  urlInput.value = url;
  form.appendChild(fieldLabel("Catalog URL", urlInput));

  const themeSelect = document.createElement("select");
  themeSelect.name = "theme";
  for (const [value, text] of [["system", "System"], ["light", "Light"], ["dark", "Dark"]]) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    if (value === theme) opt.selected = true;
    themeSelect.appendChild(opt);
  }
  // Live preview as the user changes it.
  themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));
  form.appendChild(fieldLabel("Theme", themeSelect));

  form.appendChild(actionRow(
    (() => { const b = document.createElement("button"); b.type = "submit"; b.className = "btn btn-primary"; b.textContent = "Save"; return b; })(),
  ));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await setCatalogUrl(urlInput.value.trim());
    await setTheme(themeSelect.value);
    applyTheme(themeSelect.value);
    toast("Settings saved.");
    navigate("#/");
  });
  section.appendChild(form);

  // --- Session
  const sessionHead = document.createElement("h2");
  sessionHead.className = "section-title";
  sessionHead.style.marginTop = "28px";
  sessionHead.textContent = "Session";
  section.appendChild(sessionHead);

  if (isAuthenticated()) {
    section.appendChild(actionRow(button("Sign out", {
      quiet: true,
      onClick: () => { clearCredential(); toast("Signed out."); settingsView(); },
    })));
  } else {
    const p = document.createElement("p");
    p.className = "feed-subtitle";
    p.textContent = "Not signed in. You'll be prompted when a catalog needs credentials.";
    section.appendChild(p);
  }

  // --- Local data
  const dataHead = document.createElement("h2");
  dataHead.className = "section-title";
  dataHead.style.marginTop = "28px";
  dataHead.textContent = "Local data";
  section.appendChild(dataHead);
  section.appendChild(actionRow(
    button("Clear cached catalog", { quiet: true, onClick: async () => { await clearCatalogCache(); toast("Cached catalog cleared — next load fetches fresh."); } }),
    button("Clear history", { quiet: true, onClick: async () => { await clearHistory(); toast("History cleared."); } }),
    button("Clear bookmarks", { quiet: true, onClick: async () => { await clearBookmarks(); toast("Bookmarks cleared."); } }),
  ));

  mountView(section);
}
