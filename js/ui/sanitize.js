// Minimal allowlist HTML sanitizer for publication descriptions, which arrive
// as untrusted HTML. Disallowed elements are unwrapped (their text kept);
// attributes are dropped except safe href on links. Returns a DocumentFragment,
// so callers never touch innerHTML with catalog data.

const ALLOWED = new Set([
  "P", "BR", "HR", "B", "I", "EM", "STRONG", "U", "S", "SMALL", "SUB", "SUP",
  "UL", "OL", "LI", "BLOCKQUOTE", "A", "SPAN", "CODE", "PRE",
  "H3", "H4", "H5", "H6",
]);

const SAFE_HREF = /^(https?:|mailto:)/i;

function clean(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.nodeValue);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return document.createDocumentFragment();
  }

  const tag = node.tagName;
  const kids = Array.from(node.childNodes).map(clean);

  if (!ALLOWED.has(tag)) {
    // Unwrap: keep the cleaned children, drop the element itself.
    const frag = document.createDocumentFragment();
    for (const k of kids) frag.appendChild(k);
    return frag;
  }

  const el = document.createElement(tag.toLowerCase());
  if (tag === "A") {
    const href = node.getAttribute("href") || "";
    if (SAFE_HREF.test(href)) {
      el.setAttribute("href", href);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  }
  for (const k of kids) el.appendChild(k);
  return el;
}

/** Parse and sanitize an HTML string into a safe DocumentFragment. */
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const frag = document.createDocumentFragment();
  for (const node of Array.from(doc.body.childNodes)) frag.appendChild(clean(node));
  return frag;
}
