# Shelf 📚

A minimalist, Apple-inspired book journal — a bit like Letterboxd, but for books.
It's a **PWA** (Progressive Web App): add it to your iPhone Home Screen from Safari
and it runs full-screen like a native app.

## Features

- **Personal welcome** — Shelf asks your name on first launch and shows step-by-step
  instructions for adding it to your Safari Home Screen.
- **Book lookup with covers** — search any title or author (powered by the free
  [Open Library](https://openlibrary.org) API), complete with cover art.
- **Rate & review** — give each book you've read a 1–5 star rating and write your
  own review. Your shelf remembers everything locally on your device.
- **Recommendations** — every book opens with a "You might also like" list of
  similar reads, based on genre and author.
- **Version number** — the current app version is shown at the bottom of every screen.
- **Always up to date (network-first)** — when you're online, the app always loads
  the latest version from the server instead of a stale cached copy. When you're
  offline, it falls back to the cached version so it still works.
- **Auto-reload on update** — when a new version is deployed, the app reloads itself
  once automatically. No manual refresh, no reinstalling.

## How it works

It's plain HTML, CSS, and vanilla JavaScript — no build step.

| File | Purpose |
|------|---------|
| `index.html` | App shell |
| `styles.css` | Apple-minimalist styling (light + dark) |
| `app.js` | All app logic: onboarding, search, rating, recommendations |
| `sw.js` | Service worker — network-first caching + auto-update |
| `version.js` | Single source of truth for the version number |
| `manifest.webmanifest` | PWA metadata for installing to the Home Screen |
| `icons/` | App icons |

Your books, ratings, and reviews are stored in your browser's `localStorage` —
they never leave your device.

## Running locally

Serve the folder over HTTP (a service worker requires `http`/`https`, not `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying a new version

1. Bump the version in **both** `version.js` (`window.APP_VERSION`) and
   `sw.js` (`CACHE_VERSION`).
2. Deploy. Because the service worker is network-first and calls `skipWaiting()`,
   open apps pick up the new version and auto-reload on their next launch.
