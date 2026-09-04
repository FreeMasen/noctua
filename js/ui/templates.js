// Helpers for working with the <template> elements declared in index.html.
// Data is filled via textContent / attributes — never innerHTML — so nothing
// from a catalog is ever parsed as markup here.

/** Clone a <template> by id and return its first element child. */
export function cloneTemplate(id) {
  const tpl = document.getElementById(id);
  if (!tpl || tpl.tagName !== "TEMPLATE") throw new Error(`missing template #${id}`);
  const node = tpl.content.firstElementChild.cloneNode(true);
  return node;
}

/** Find a [data-slot="name"] descendant (or the root itself). */
export function slot(root, name) {
  if (root.matches && root.matches(`[data-slot="${name}"]`)) return root;
  return root.querySelector(`[data-slot="${name}"]`);
}

/** Set textContent on a slot. Returns the element (or null). */
export function setText(root, name, text) {
  const el = slot(root, name);
  if (el) el.textContent = text == null ? "" : String(text);
  return el;
}

/** Set an attribute on a slot. */
export function setAttr(root, name, attr, value) {
  const el = slot(root, name);
  if (el) el.setAttribute(attr, value);
  return el;
}

/** Toggle the `hidden` attribute on a slot (or any element). */
export function show(elOrRoot, nameOrVisible, maybeVisible) {
  let el = elOrRoot;
  let visible = nameOrVisible;
  if (typeof nameOrVisible === "string") {
    el = slot(elOrRoot, nameOrVisible);
    visible = maybeVisible;
  }
  if (el) el.hidden = !visible;
  return el;
}
