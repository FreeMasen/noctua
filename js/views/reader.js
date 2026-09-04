// The reader. Fetches a book's bytes (authenticated) and renders EPUB via the
// vendored epub.js or PDF via the vendored pdf.js. Libraries load lazily on
// first use so they don't weigh down the rest of the app. Reading progress is
// persisted per book id and restored on reopen.

import { fetchBlob } from "../http.js";
import { mountView, renderLoading, renderError, toast } from "../ui/dom.js";
import { setProgress, getProgress } from "../db/idb.js";

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

  // A clean light reading surface, readable regardless of app theme.
  rendition.themes.default({
    body: { color: "#1a1a1a", background: "#ffffff", "line-height": "1.6" },
  });

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

  await draw();

  onLeaveReader(() => {
    window.removeEventListener("keydown", onKey);
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
