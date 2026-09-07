// The reader. Fetches a book's bytes (authenticated) and renders EPUB via the
// vendored epub.js or PDF via the vendored pdf.js. Libraries load lazily on
// first use so they don't weigh down the rest of the app. Reading progress is
// persisted per book id and restored on reopen.

import { fetchBlob } from "../http.js";
import { mountView, renderLoading, renderError, toast } from "../ui/dom.js";
import {
  setProgress, getProgress,
  getReaderPrefs, setReaderPrefs,
  getBookAppearance, setBookAppearance, clearBookAppearance,
  READER_DEFAULTS,
} from "../db/idb.js";

// Reading color schemes for the EPUB surface (foreground / background). These
// are the book's page, not the app chrome, so they're independent of the app
// theme. `light` matches the reader's original look.
const READER_SCHEMES = {
  light: { label: "Light", fg: "#1a1a1a", bg: "#ffffff" },
  "black-on-white": { label: "Black on white", fg: "#000000", bg: "#ffffff" },
  sepia: { label: "Sepia", fg: "#5b4636", bg: "#f4ecd8" },
  night: { label: "Night", fg: "#c9c9c9", bg: "#121212" },
};

// Base font choices. Each value is a CSS font-family stack ("" = keep the
// publisher's own fonts). Named fonts fall back gracefully when not installed;
// the browser's actual installed fonts can be added via the Local Font Access
// API (see loadSystemFonts).
const READER_FONTS = [
  ["", "Publisher font"],
  ["Georgia, serif", "Georgia"],
  ['"Times New Roman", Times, serif', "Times New Roman"],
  ['"Iowan Old Style", Palatino, serif', "Iowan / Palatino"],
  ["Charter, Georgia, serif", "Charter"],
  ["system-ui, -apple-system, sans-serif", "System sans"],
  ['"Helvetica Neue", Helvetica, Arial, sans-serif', "Helvetica"],
  ["Verdana, Geneva, sans-serif", "Verdana"],
  ['"Courier New", ui-monospace, monospace', "Monospace"],
];

// Run when the user navigates away from the reader (free memory, drop listeners).
let pendingCleanup = null;
function runCleanup() {
  if (pendingCleanup) {
    try { pendingCleanup(); } catch { /* ignore */ }
    pendingCleanup = null;
  }
}
let leaveHandler = null;
function onLeaveReader(cleanup) {
  pendingCleanup = cleanup;
  if (leaveHandler) window.removeEventListener("hashchange", leaveHandler);
  leaveHandler = () => {
    if (!location.hash.startsWith("#/reader")) {
      window.removeEventListener("hashchange", leaveHandler);
      leaveHandler = null;
      runCleanup();
    }
  };
  window.addEventListener("hashchange", leaveHandler);
}

// ------------------------------------------------------------- lazy loaders

let epubLibPromise = null;
function loadEpubLib() {
  if (window.ePub) return Promise.resolve(window.ePub);
  if (epubLibPromise) return epubLibPromise;
  const inject = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  // epub.js expects a global JSZip.
  epubLibPromise = inject("vendor/jszip.min.js")
    .then(() => inject("vendor/epub.min.js"))
    .then(() => window.ePub);
  return epubLibPromise;
}

let pdfLibPromise = null;
function loadPdfLib() {
  if (pdfLibPromise) return pdfLibPromise;
  pdfLibPromise = import("../../vendor/pdf.min.mjs").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("../../vendor/pdf.worker.min.mjs", import.meta.url).href;
    return pdfjs;
  });
  return pdfLibPromise;
}

// --------------------------------------------------------------- reader shell

function buildShell(title) {
  const root = document.createElement("div");
  root.className = "reader";
  root.innerHTML = `
    <header class="reader-bar">
      <a class="btn btn-quiet" data-el="back" href="#/">‹ Back</a>
      <span class="reader-title" data-el="title"></span>
      <select class="reader-toc" data-el="toc" hidden></select>
      <select class="reader-select" data-el="scheme" title="Reading colors" hidden></select>
      <select class="reader-select" data-el="font" title="Reading font" hidden></select>
      <select class="reader-select" data-el="scope" title="Apply appearance to" hidden></select>
      <span class="reader-progress" data-el="progress"></span>
      <span class="reader-nav">
        <button type="button" class="btn" data-el="prev">‹</button>
        <button type="button" class="btn" data-el="next">›</button>
      </span>
    </header>
    <div class="reader-stage" data-el="stage"></div>`;
  root.querySelector('[data-el="title"]').textContent = title || "Reading";
  return root;
}
const el = (root, name) => root.querySelector(`[data-el="${name}"]`);

// --------------------------------------------------------- touch gestures

// Turn-page gestures for a touch-only display. A horizontal drag past SWIPE is a
// page turn; a near-stationary quick tap is a zone action — left third = prev,
// right third = next, center = toggle the toolbar. Returns {onStart, onEnd} to
// wire onto touch events (the EPUB iframe forwards these through epub.js; the
// PDF stage fires them directly). `widthOf` gives the reading area's width so
// zones scale with the viewport.
function createGestures({ prev, next, toggle, widthOf }) {
  const SWIPE = 45;    // px of horizontal travel that counts as a swipe
  const TAP_SLOP = 10; // max travel still treated as a tap, not a drag
  const TAP_MS = 500;  // max duration still treated as a tap
  let sx = 0, sy = 0, st = 0, tracking = false;
  const point = (e) =>
    (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;

  function onStart(e) {
    const p = point(e);
    sx = p.clientX; sy = p.clientY; st = Date.now(); tracking = true;
  }
  function onEnd(e) {
    if (!tracking) return;
    tracking = false;
    const p = point(e);
    const dx = p.clientX - sx, dy = p.clientY - sy, dt = Date.now() - st;
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) {
      (dx < 0 ? next : prev)();
    } else if (Math.abs(dx) <= TAP_SLOP && Math.abs(dy) <= TAP_SLOP && dt <= TAP_MS) {
      if (e.target && e.target.closest && e.target.closest("a")) return; // keep links tappable
      const w = widthOf() || 1;
      if (p.clientX < w * 0.33) prev();
      else if (p.clientX > w * 0.67) next();
      else toggle();
    }
  }
  return { onStart, onEnd };
}

// --------------------------------------------------------- reader appearance

// Push the current appearance onto the rendition. epub.js reapplies these
// overrides to every chapter's iframe via a content hook, so they stick across
// navigation. `stage` gets the same background so the page margins (outside the
// text columns) match. In "original" mode we remove every override so the
// book's own CSS and embedded fonts render exactly as the publisher shipped.
function applyAppearance(rendition, stage, prefs) {
  if (prefs.styleMode === "original") {
    for (const prop of ["color", "background", "line-height", "font-family"]) {
      rendition.themes.removeOverride(prop);
    }
    stage.style.background = "#ffffff";
    return;
  }
  const scheme = READER_SCHEMES[prefs.colorScheme] || READER_SCHEMES.light;
  rendition.themes.override("color", scheme.fg, true);
  rendition.themes.override("background", scheme.bg, true);
  rendition.themes.override("line-height", "1.6", true);
  if (prefs.fontFamily) rendition.themes.override("font-family", prefs.fontFamily, true);
  else rendition.themes.removeOverride("font-family");
  stage.style.background = scheme.bg;
}

function fillSelect(select, entries) {
  for (const [value, label] of entries) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    select.appendChild(o);
  }
}

// Ensure `value` (a font-family stack, possibly from queryLocalFonts) exists as
// an option so it can be shown as the current selection.
function ensureFontOption(fontSel, value) {
  if (!value || Array.from(fontSel.options).some((o) => o.value === value)) return;
  const o = document.createElement("option");
  o.value = value;
  o.textContent = value.replace(/["']/g, "").split(",")[0];
  fontSel.appendChild(o);
}

// Pull the fonts installed on this device (Chromium's Local Font Access API,
// gated behind a user gesture + permission prompt) into the font picker.
// Returns true once the fonts have been read (so callers don't ask twice),
// false if the read failed or was denied (so it can be retried).
async function loadSystemFonts(fontSel) {
  let fonts;
  try {
    fonts = await window.queryLocalFonts();
  } catch (err) {
    toast(err && err.name === "SecurityError" ? "Font access was blocked." : "Couldn't read system fonts.");
    return false;
  }
  const have = new Set(Array.from(fontSel.options, (o) => o.value));
  const families = [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
  let added = 0;
  for (const family of families) {
    const value = /\s/.test(family) ? `"${family}"` : family;
    if (have.has(value)) continue;
    const o = document.createElement("option");
    o.value = value;
    o.textContent = family;
    fontSel.appendChild(o);
    added++;
  }
  if (added) toast(`Added ${added} system fonts — reopen the menu to see them.`);
  return true;
}

// Populate and wire the appearance controls. Applies the effective prefs
// (this book's override, falling back to the global default) and persists any
// change to whichever scope is selected. Resolves once the initial appearance
// is applied.
async function setupAppearance(shell, stage, rendition, id) {
  const schemeSel = el(shell, "scheme");
  const fontSel = el(shell, "font");
  const scopeSel = el(shell, "scope");

  fillSelect(schemeSel, [
    ["original", "Book’s style"],
    ...Object.entries(READER_SCHEMES).map(([v, s]) => [v, s.label]),
  ]);
  fillSelect(fontSel, READER_FONTS);
  fillSelect(scopeSel, [["book", "This book"], ["global", "All books"]]);

  const bookPrefs = id ? await getBookAppearance(id) : undefined;
  // Working copy of the prefs in effect (book override wins over the default).
  let prefs = { ...READER_DEFAULTS, ...(bookPrefs || await getReaderPrefs()) };
  scopeSel.value = bookPrefs ? "book" : "global";

  // Mirror `prefs` onto the controls (and disable the font picker in "original"
  // mode, where the book owns its fonts).
  function syncControls() {
    schemeSel.value = prefs.styleMode === "original" ? "original" : prefs.colorScheme;
    ensureFontOption(fontSel, prefs.fontFamily);
    fontSel.value = prefs.fontFamily || "";
    fontSel.disabled = schemeSel.value === "original";
  }

  // Read the controls back into `prefs`.
  function readControls() {
    if (schemeSel.value === "original") {
      prefs.styleMode = "original";
    } else {
      prefs.styleMode = "custom";
      prefs.colorScheme = schemeSel.value;
    }
    prefs.fontFamily = fontSel.value;
  }

  // Save to whichever scope is active.
  function persist() {
    if (scopeSel.value === "global") return setReaderPrefs(prefs);
    if (id) return setBookAppearance(id, prefs);
  }

  function onEdit() {
    readControls();
    syncControls();
    applyAppearance(rendition, stage, prefs);
    persist();
  }

  schemeSel.addEventListener("change", onEdit);
  fontSel.addEventListener("change", onEdit);

  // Switching scope: "All books" drops this book's override and follows (and
  // edits) the global default; "This book" starts an override from the current
  // look.
  scopeSel.addEventListener("change", async () => {
    if (scopeSel.value === "global") {
      if (id) await clearBookAppearance(id);
      prefs = { ...READER_DEFAULTS, ...(await getReaderPrefs()) };
    } else if (id) {
      await setBookAppearance(id, prefs);
    }
    syncControls();
    applyAppearance(rendition, stage, prefs);
  });

  // Where supported, pull the device's installed fonts into the picker the
  // first time it's opened. queryLocalFonts needs a user gesture, and opening
  // the menu is one; mousedown fires before the list paints. On failure we let
  // it retry on the next open.
  if (window.queryLocalFonts) {
    let triedSystemFonts = false;
    fontSel.addEventListener("mousedown", async () => {
      if (triedSystemFonts) return;
      triedSystemFonts = true;
      if (!(await loadSystemFonts(fontSel))) triedSystemFonts = false;
    });
  }

  syncControls();
  applyAppearance(rendition, stage, prefs);
  schemeSel.hidden = false;
  fontSel.hidden = false;
  scopeSel.hidden = false;
}

// ------------------------------------------------------------------- EPUB

async function renderEpub(blob, { id, title }, shell) {
  const ePub = await loadEpubLib();
  const stage = el(shell, "stage");
  stage.classList.add("reader-stage-epub");
  const book = ePub(await blob.arrayBuffer());
  const rendition = book.renderTo(stage, {
    width: "100%",
    height: "100%",
    flow: "paginated",
    spread: "auto",
  });

  // Reading surface (colors + font) — user-controlled and independent of the
  // app theme. Applied before display so the first paint is already themed.
  await setupAppearance(shell, stage, rendition, id);

  const saved = await getProgress(id);
  await rendition.display(saved && saved.cfi ? saved.cfi : undefined);

  const progressEl = el(shell, "progress");
  rendition.on("relocated", (loc) => {
    const cfi = loc && loc.start && loc.start.cfi;
    const pct = loc && loc.start && typeof loc.start.percentage === "number" ? loc.start.percentage : null;
    if (pct != null) progressEl.textContent = `${Math.round(pct * 100)}%`;
    if (cfi) setProgress(id, { kind: "epub", cfi, percentage: pct });
  });

  // Table of contents.
  book.loaded.navigation.then((nav) => {
    const toc = el(shell, "toc");
    if (!nav.toc || !nav.toc.length) return;
    const opt = (label, href) => {
      const o = document.createElement("option");
      o.value = href || "";
      o.textContent = label;
      return o;
    };
    toc.appendChild(opt("Contents…", ""));
    for (const item of nav.toc) toc.appendChild(opt(item.label.trim(), item.href));
    toc.hidden = false;
    toc.addEventListener("change", () => { if (toc.value) rendition.display(toc.value); });
  });

  // Percentages need a locations index; build it in the background.
  book.ready.then(() => book.locations.generate(1200)).catch(() => {});

  const prev = () => rendition.prev();
  const next = () => rendition.next();
  el(shell, "prev").addEventListener("click", prev);
  el(shell, "next").addEventListener("click", next);
  const onKey = (e) => {
    if (e.key === "ArrowLeft") prev();
    else if (e.key === "ArrowRight") next();
  };
  window.addEventListener("keydown", onKey);
  rendition.on("keyup", onKey); // arrows while focus is inside the iframe

  // Touch: epub.js forwards the iframe's touch events up to the rendition.
  const gestures = createGestures({
    prev, next,
    toggle: () => shell.classList.toggle("reader-immersive"),
    widthOf: () => stage.clientWidth,
  });
  rendition.on("touchstart", gestures.onStart);
  rendition.on("touchend", gestures.onEnd);

  onLeaveReader(() => {
    window.removeEventListener("keydown", onKey);
    try { rendition.destroy(); book.destroy(); } catch { /* ignore */ }
  });
}

// -------------------------------------------------------------------- PDF

async function renderPdf(blob, { id }, shell) {
  const pdfjs = await loadPdfLib();
  const stage = el(shell, "stage");
  stage.classList.add("reader-stage-pdf");
  const data = new Uint8Array(await blob.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;

  const canvas = document.createElement("canvas");
  stage.appendChild(canvas);
  const progressEl = el(shell, "progress");

  const saved = await getProgress(id);
  let page = saved && saved.page ? Math.min(saved.page, pdf.numPages) : 1;
  let renderTask = null;

  async function draw() {
    progressEl.textContent = `${page} / ${pdf.numPages}`;
    const p = await pdf.getPage(page);
    const unscaled = p.getViewport({ scale: 1 });
    const scale = Math.min((stage.clientWidth - 24) / unscaled.width, (stage.clientHeight - 24) / unscaled.height);
    const viewport = p.getViewport({ scale: Math.max(scale, 0.2) });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    if (renderTask) renderTask.cancel();
    renderTask = p.render({ canvasContext: canvas.getContext("2d"), viewport });
    try { await renderTask.promise; } catch { /* cancelled */ }
    setProgress(id, { kind: "pdf", page, total: pdf.numPages });
  }

  const go = (delta) => {
    const next = Math.min(Math.max(page + delta, 1), pdf.numPages);
    if (next !== page) { page = next; draw(); }
  };
  el(shell, "prev").addEventListener("click", () => go(-1));
  el(shell, "next").addEventListener("click", () => go(1));
  const onKey = (e) => {
    if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
  };
  window.addEventListener("keydown", onKey);

  // Touch: the PDF renders to a canvas in the page, so listen on the stage.
  const gestures = createGestures({
    prev: () => go(-1),
    next: () => go(1),
    toggle: () => shell.classList.toggle("reader-immersive"),
    widthOf: () => stage.clientWidth,
  });
  stage.addEventListener("touchstart", gestures.onStart, { passive: true });
  stage.addEventListener("touchend", gestures.onEnd, { passive: true });

  await draw();

  onLeaveReader(() => {
    window.removeEventListener("keydown", onKey);
    stage.removeEventListener("touchstart", gestures.onStart);
    stage.removeEventListener("touchend", gestures.onEnd);
    try { pdf.destroy(); } catch { /* ignore */ }
  });
}

// ------------------------------------------------------------------ route

/** Route handler for #/reader?u=<file href>&t=<media type>&id=&title=. */
export async function readerView(params) {
  runCleanup(); // in case of reader -> reader navigation
  const href = params.u;
  const type = (params.t || "").toLowerCase();
  const id = params.id || href;
  const title = params.title;

  if (!href) {
    renderError("No book to read.");
    return;
  }

  const shell = buildShell(title);
  mountView(shell);
  el(shell, "progress").textContent = "Loading…";

  // "Back" returns to wherever the reader was opened from (the book detail).
  el(shell, "back").addEventListener("click", (e) => {
    if (history.length > 1) {
      e.preventDefault();
      history.back();
    }
  });

  try {
    const blob = await fetchBlob(href, { accept: type || "*/*" });
    if (type.includes("epub")) await renderEpub(blob, { id, title }, shell);
    else if (type.includes("pdf")) await renderPdf(blob, { id, title }, shell);
    else {
      renderError("This format can't be read in the browser. Try downloading it instead.");
    }
  } catch (err) {
    renderError(err && err.message ? err.message : String(err), () => readerView(params));
  }
}
