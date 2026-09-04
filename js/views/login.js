// Login modal, driven by a parsed Authentication for OPDS document.

import { cloneTemplate, setText, show } from "../ui/templates.js";
import { setCredential } from "../opds/auth.js";

/**
 * Show the login modal. Resolves true once a credential is captured, false if
 * the user cancels. Only one modal is shown at a time.
 */
export function showLoginModal(authDoc) {
  const root = document.getElementById("modal-root");
  return new Promise((resolve) => {
    const form = cloneTemplate("tmpl-login");
    const basic = authDoc.basic || { loginLabel: "Username", passwordLabel: "Password" };

    setText(form, "title", authDoc.title || "Sign in");
    if (authDoc.description) show(setText(form, "description", authDoc.description), true);
    setText(form, "login-label", basic.loginLabel);
    setText(form, "password-label", basic.passwordLabel);

    const close = (result) => {
      root.hidden = true;
      root.replaceChildren();
      resolve(result);
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const username = String(data.get("username") || "");
      const password = String(data.get("password") || "");
      if (!username) return;
      setCredential(username, password);
      close(true);
    });

    form.querySelector('[data-action="cancel"]').addEventListener("click", () => close(false));

    root.replaceChildren(form);
    root.hidden = false;
    const first = form.querySelector('input[name="username"]');
    if (first) first.focus();
  });
}
