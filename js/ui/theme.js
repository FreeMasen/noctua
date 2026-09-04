// Theme application. "system" follows the OS; "light"/"dark" force a choice.

import { getTheme } from "../db/idb.js";

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
}

export async function initTheme() {
  applyTheme(await getTheme());
}
