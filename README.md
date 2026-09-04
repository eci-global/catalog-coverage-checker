# Catalogue Coverage Check — progressive web app

This folder is the installable version of the tool. Same app, same single HTML
file, plus the three things a browser needs before it will offer to install
something: a manifest, a service worker, and icons.

```
index.html               the tool, with the manifest link, install button and worker registration
manifest.webmanifest     name, icons, colours, start URL, screenshots
sw.js                    offline support and the update flow
icons/                   192, 512, maskable variants, Apple touch icon, favicon
screenshots/             shown in the install dialog on desktop and Android
```

## It has to be served over HTTPS

Service workers only run on `https://` or on `http://localhost`. Opening
`index.html` from a file path will still give you a working tool — it just
won't install or cache. That is why the standalone single-file version still
exists alongside this one: hand that out for a one-off check, and host this one
where people will come back to it.

Any static host works — SharePoint pages excepted, since they rewrite paths.
Netlify, Cloudflare Pages, S3 + CloudFront, IIS, nginx, or a folder on your own
web server are all fine. Every path in here is relative, so it works from a
subdirectory such as `https://tools.example.com/catalogue-coverage/` without
edits.

**Test it locally first:**

```bash
cd pwa
python3 -m http.server 8000
# then open http://localhost:8000
```

`localhost` counts as a secure origin, so the worker and the install button
behave exactly as they will in production.

**Server settings that matter:**

- Serve `.webmanifest` as `application/manifest+json`. Most servers do already;
  IIS needs the MIME type adding.
- Don't cache `sw.js` for long. `Cache-Control: no-cache` on that one file is
  the safe setting — browsers cap it at 24 hours regardless, but no-cache means
  your updates land immediately.
- Long cache lifetimes on everything else are fine; the worker handles freshness.

## Installing

Once it is served over HTTPS:

- **Chrome and Edge, desktop and Android** — an install icon appears in the
  address bar, and the in-app **Install app** button appears in the top bar.
  The button only shows when the browser has actually confirmed the app is
  installable, and disappears once it is installed.
- **Safari on macOS** — File, then Add to Dock. Safari never fires the install
  event, so the button shows a short instruction instead of a prompt.
- **iOS and iPadOS** — Share, then Add to Home Screen. Same fallback.
- **Firefox desktop** — no install support. The app still works normally and
  still caches for offline use.

Installed, it opens in its own window with no browser chrome, its own icon in
the taskbar, dock or app drawer, and the ECI mark on a `#161618` splash screen.

## Offline

The worker precaches the whole shell on first visit. After that the app opens
with no connection at all, and because every calculation runs in the browser
already, a full analysis works offline — CSVs in, results out, exports
downloaded, no network anywhere in the path.

One caveat: `index.html` pulls DM Sans from Google Fonts. It is cached after
the first online visit and falls back to a system sans before then, so nothing
breaks, but if you want a guaranteed-identical first paint offline, download
the DM Sans woff2 files, drop them in a `fonts/` folder, replace the Google
Fonts `<link>` with an `@font-face` block, and add the files to `PRECACHE` in
`sw.js`.

## Shipping an update

1. Rebuild or edit `index.html`.
2. Bump `VERSION` at the top of `sw.js` — for example `'1.0.0'` to `'1.0.1'`.
3. Upload both.

Anyone with the app open gets a small notice saying a new version is ready,
with a Reload button. Nothing swaps out underneath them mid-analysis: the new
worker sits in waiting until they choose to reload. Old caches are deleted on
activation, so nothing accumulates.

If you forget step 2, browsers will keep serving the cached shell and your
change won't appear. It is the one manual step in the whole setup.

## Adding this to a different app

The three pieces are portable. For any existing web app:

**1. Link the manifest and icons in `<head>`:**

```html
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#161618">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-title" content="Your App">
```

**2. Register the worker, and add an install button.** Copy the `<script>`
block at the bottom of `index.html`. It needs three elements to exist:
`#installBtn`, `#pwaToast` with `#pwaToastText`, `#pwaToastAction` and
`#pwaToastClose`. Strip the `setTheme` wrapper if your app has no theme switch.

The install logic in one paragraph: browsers fire `beforeinstallprompt` when
the app qualifies, you call `preventDefault()` to stop the default banner, keep
the event, show your button, and call `prompt()` on it when the button is
clicked. The event can only be used once. Safari never fires it, so detect it
and show instructions instead. Hide the button when `display-mode: standalone`
matches, which means it is already installed.

**3. Edit `PRECACHE` in `sw.js`** to list your app's real files. A single-file
app needs one entry; an app with a build step needs the file list generating at
build time — [Workbox](https://developer.chrome.com/docs/workbox) does that for
you and is worth the dependency once you have more than a handful of hashed
bundles.

**Installability checklist** (Chrome's requirements, all met here): served over
HTTPS, a linked manifest with `name`, `short_name`, `start_url`, `display`
of `standalone`, icons at 192 and 512, and a registered service worker with a
`fetch` handler. Run Lighthouse, Installability, in DevTools to confirm on your
own host.

## Things done deliberately

- **Maskable icons are separate from the standard ones.** Android crops icons
  to whatever shape the launcher uses. The maskable pair keeps the mark inside
  the safe circle; the standard pair uses the space properly on platforms that
  don't crop.
- **No `skipWaiting()` on install.** An automatic swap can reload the page while
  someone is halfway through, and their uploaded files are gone.
- **The install button is hidden by default,** not shown-then-hidden. A button
  that appears and vanishes on load is worse than one that appears when it
  becomes useful.
- **`theme-color` follows the light/dark switch,** so the title bar in the
  installed window matches the app rather than fighting it.
- **`display_override` lists `window-controls-overlay` first.** On desktop that
  lets the app draw into the title bar area if you ever want it to; it falls
  back to plain `standalone` everywhere else.
