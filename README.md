# Noctua

A standalone [OPDS 2.0](https://specs.opds.io/opds-2.0.html) catalog client — a browser
app for browsing and reading from any conforming OPDS catalog.

Noctua is a **pure static site**: vanilla JavaScript (native ES modules), HTML
`<template>` elements, plain DOM, and a hand-written PWA manifest + service worker. There
is **no build step** and **no framework**. It is meant to be hosted on GitHub Pages, but
the same files run from any static file server.

## Design

Noctua is **spec-driven, not server-specific**. The only hardcoded URL is a default
catalog entry point (editable in settings). Everything else — categories, authors, "all",
search, pagination, acquisition, images — is discovered by following link `rel`s and media
types in the feeds themselves, so Noctua works against any OPDS 2.0 catalog.

- **Auth:** [Authentication for OPDS 1.0](https://drafts.opds.io/authentication-for-opds-1.0.html)
  Basic flow. Credentials are held **in memory only** (session-only) and never persisted.
- **Storage:** IndexedDB holds settings, reading history, and bookmarks — never credentials.
- **Offline:** the app shell is precached; visited feeds and cover images are cached at
  runtime (stale-while-revalidate) so previously-seen browsing works offline.

## Development

Serve the directory with the local `serve` command and open it in a browser:

```sh
serve .        # from the repo root
```

Because dev runs over plain HTTP, it can talk to a plain-HTTP catalog (e.g. a LAN
`http://…` server) without mixed-content restrictions.

## Deployment notes (operator's responsibility, not baked into this repo)

Noctua runs on a **different origin** than the catalog, so the catalog server must:

1. **Send CORS headers** permitting Noctua's origin and the `Authorization` request header.
2. Be reachable over a compatible scheme. **GitHub Pages is HTTPS-only**, and browsers
   block an HTTPS page from fetching an **HTTP** resource (mixed content). So the live
   Pages build can only reach an **HTTPS** catalog. To browse a plain-HTTP LAN catalog,
   run Noctua locally over http via `serve`.

## Status

Built in milestones; see the project plan. EPUB reading is the final milestone.
