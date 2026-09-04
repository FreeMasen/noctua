# Noctua

A standalone OPDS catalog client — a browser app for browsing and reading from any
conforming catalog. It speaks both [OPDS 2.0](https://specs.opds.io/opds-2.0.html) (JSON)
and [OPDS 1.2](https://specs.opds.io/opds-1.2) (Atom), auto-detecting the format per feed.

Noctua is a **pure static site**: vanilla JavaScript (native ES modules), HTML
`<template>` elements, plain DOM, and a hand-written PWA manifest + service worker. There
is **no build step** and **no framework**. It is meant to be hosted on GitHub Pages, but
the same files run from any static file server.

## Design

Noctua is **spec-driven, not server-specific**. The only hardcoded URL is a default
catalog entry point (editable in settings). Everything else — categories, authors, "all",
search, pagination, acquisition, images — is discovered by following link `rel`s and media
types in the feeds themselves, so Noctua works against any conforming catalog regardless of
whether it serves OPDS 2.0 (JSON) or OPDS 1.x (Atom).

- **Auth:** [Authentication for OPDS 1.0](https://drafts.opds.io/authentication-for-opds-1.0.html)
  Basic flow. Credentials are held **in memory only** (session-only) and never persisted.
- **Storage:** IndexedDB holds settings, reading history, and bookmarks — never credentials.
- **Offline:** the app shell is precached; visited feeds and cover images are cached at
  runtime (stale-while-revalidate) so previously-seen browsing works offline.

## Development

There's no build step — host the repo root with any static file server and open it
in a browser, e.g.:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Because dev runs over plain HTTP, it can talk to a plain-HTTP catalog (e.g. a LAN
`http://…` server) without mixed-content restrictions.

## Installing to a web root

`install.sh` copies the runtime assets (no dev fixtures or git metadata) into a
web root, pruning files removed from the repo and using `sudo` only if needed:

```sh
./install.sh                  # -> /usr/share/noctua (default)
./install.sh /var/www/noctua  # -> a custom destination
```

Serving it over plain HTTP on your LAN lets an `http://` page reach an `http://`
catalog with no mixed-content block — the simplest way to use Noctua against a
LAN catalog without TLS.

## Deployment notes (operator's responsibility, not baked into this repo)

Noctua runs on a **different origin** than the catalog, so the catalog server must:

1. **Send CORS headers** permitting Noctua's origin and the `Authorization` request header.
2. Be reachable over a compatible scheme. **GitHub Pages is HTTPS-only**, and browsers
   block an HTTPS page from fetching an **HTTP** resource (mixed content). So the live
   Pages build can only reach an **HTTPS** catalog. To browse a plain-HTTP LAN catalog,
   serve Noctua itself over HTTP on the LAN (see **Development** above, or `install.sh`).

## Reading

Books are read in the app: **EPUB** via [epub.js](https://github.com/futurepress/epub.js)
and **PDF** via [pdf.js](https://github.com/mozilla/pdf.js) (both vendored under `vendor/`
and loaded lazily). Reading position is saved per book and restored on reopen. Reading a
file requires the catalog to allow CORS on its file endpoints; where it doesn't, downloads
still work.
