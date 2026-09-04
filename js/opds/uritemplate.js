// Focused RFC 6570 URI Template support — enough for OPDS search links, which
// use the form-style query expansion, e.g. `search{?query,author,title}`.
// Handles {?a,b}, {&a,b}, and simple {a}. Empty/missing values are omitted.

const EXPR = /\{([?&]?)([^}]+)\}/g;

/** Extract the ordered, de-duplicated list of variable names in a template. */
export function templateVars(template) {
  const vars = [];
  for (const m of String(template).matchAll(EXPR)) {
    for (const v of m[2].split(",")) vars.push(v.trim());
  }
  return [...new Set(vars)];
}

/** True if the string contains a template expression. */
export function isTemplated(str) {
  return typeof str === "string" && /\{[?&]?[^}]+\}/.test(str);
}

/** Expand a template with the given values object. */
export function expandTemplate(template, values = {}) {
  return String(template).replace(EXPR, (_, op, varlist) => {
    const names = varlist.split(",").map((s) => s.trim());
    if (op === "?" || op === "&") {
      const parts = [];
      for (const name of names) {
        const val = values[name];
        if (val == null || val === "") continue;
        parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(val)}`);
      }
      if (parts.length === 0) return "";
      return (op === "?" ? "?" : "&") + parts.join("&");
    }
    // Simple expansion {var}
    const val = values[names[0]];
    return val == null ? "" : encodeURIComponent(val);
  });
}
