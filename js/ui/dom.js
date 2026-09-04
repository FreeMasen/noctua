// View-mounting and shared status/error/empty rendering.

import { cloneTemplate, setText } from "./templates.js";

/** Replace the main view with a node (or nodes). */
export function mountView(...nodes) {
  const view = document.getElementById("view");
  view.replaceChildren(...nodes);
  view.scrollTop = 0;
  window.scrollTo(0, 0);
}

/** Render the loading placeholder into the main view. */
export function renderLoading() {
  mountView(cloneTemplate("tmpl-loading"));
}

/** Render an error state with an optional retry handler. */
export function renderError(message, onRetry) {
  const node = cloneTemplate("tmpl-error");
  setText(node, "message", message || "Something went wrong.");
  const retry = node.querySelector('[data-action="retry"]');
  if (onRetry) retry.addEventListener("click", onRetry);
  else retry.hidden = true;
  mountView(node);
}

/** Build an empty-state node (caller decides where to place it). */
export function emptyState(message) {
  const node = cloneTemplate("tmpl-empty");
  setText(node, "message", message || "Nothing here.");
  return node;
}

let toastTimer = null;

/** Show a transient toast message. */
export function toast(message, { error = false, ms = 3200 } = {}) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.toggle("error", error);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, ms);
}
