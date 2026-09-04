// Small formatting helpers shared across views.

/** URL/file-safe slug from a title. */
export function slugify(str) {
  const s = (str || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return s || "book";
}

const EXT_BY_TYPE = {
  "application/epub+zip": "epub",
  "application/pdf": "pdf",
  "application/x-cbz": "cbz",
  "application/x-cbr": "cbr",
  "text/html": "html",
};

/** File extension for an acquisition media type. */
export function extForType(type) {
  return EXT_BY_TYPE[type] || "bin";
}

/** Human date, or the raw value if unparseable, or null. */
export function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" }).format(d);
}
