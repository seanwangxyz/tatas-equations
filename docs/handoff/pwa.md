# Home-screen app (PWA): install, offline play, safe updates

Owner request: "A home-screen icon on the iPad that opens full screen and works without internet for one-device play."

## The one command before every publish

```bash
node tools/build-precache.js
```

It lists every file the game needs (with a content hash), writes `precache-manifest.js` and stamps the new
version into `sw.js`. Commit both with the rest and `git push` as usual. `node tools/build-precache.js --check`
only reports (exit 1 if out of date). If it is forgotten nothing breaks: devices keep working, and changed or new
files are still fetched (see "Stale list" below); they just don't get the "New version ready" chip until the next build.

## First-time setup (once)

1. `node tools/pwa-snippets.js` applies the edits to `index.html` and `js/screens.js` (listed below; safe to
   run twice; `--check` only reports). Then `node tools/build-precache.js`, test, commit, push.
2. Optional, for Google sign-in inside the iPad home-screen app: step D in `docs/handoff/account.md`
   (host the sign-in helper on profsean.wang). Without it, sign-in inside the installed iPad app usually comes
   back empty (Safari blocks the third-party storage the redirect needs) and the game shows its kind message;
   the Export/Import code always works.

## Files

| File | What |
|---|---|
| `sw.js` | The service worker (site root of the sub-path, so its scope is `/tatas-equations/`) |
| `precache-manifest.js` | Generated list: version, files with hash and size. Do not edit |
| `manifest.webmanifest` | Name, icons (192/512 + maskable), `start_url`/`scope` relative to the sub-path, fullscreen, colours |
| `js/pwa.js` | Registers the worker, update chip, install helper, offline chip, "needs the internet" messages, Settings rows |
| `css/pwa.css` | Their look; standalone manners (no rubber-band), green page background |
| `assets/icons/` | App icon (Pip with an "=" cube on the pitch): `icon-192/512`, `icon-maskable-192/512`, `apple-touch-icon` (180) + 167/152/120, `favicon-16/32`, `icon.svg` (favicon), `icon-full.svg`, `icon-maskable.svg`, `splash/` launch pictures + `links.html` |
| `vendor/` | three.js r170 (+4 addons), cannon-es 0.20.0, Lilita One + Nunito woff2 and `fonts.css` (licences in `vendor/README.md`) |
| `tools/build-precache.js` | The publish command above |
| `tools/make-icons.js` | Draws the icon as SVG and renders all PNGs with the headless Chrome/Edge already on the computer (`--no-splash` for icons only) |
| `tools/fetch-vendor.js` | Re-downloads `vendor/` (only when changing a library version) |
| `tools/pwa-snippets.js` | Applies the index.html / screens.js edits |
| `tools/sw-killswitch.js` | Emergency replacement for `sw.js` (below) |

## How caching works (plain words)

- **One version = one box.** At install the worker downloads *every* listed file into a cache named after the
  version (`tata-pre-<version>`). The game page, its scripts, styles, models and fonts all come out of that one box,
  so a device never runs new HTML with old scripts.
- **index.html comes from the box too (not network-first).** I chose this over "network-first for index.html"
  on purpose: network-first gives you the new page with the *old* cached scripts until the new worker takes over,
  which is exactly the half-updated mix that breaks a no-build game with ~90 shared globals. Freshness is handled
  by the update flow below instead, which is just as fast in practice.
- **Not in the box?** (a file added after the last build, a page like `legacy/`): stale-while-revalidate in
  `tata-run-<version>`. Online it is fetched and kept; offline the kept copy is used.
- **Cross-origin:** only the pinned CDN libraries (`cdn.jsdelivr.net/npm/three@0.170.0/...`, `cannon-es@0.20.0`)
  and Google Fonts are cached (`tata-xo-v1`), and only while index.html still points at them. Everything else
  (Firebase SDK from gstatic, firebaseio, Google sign-in, any other site) is not intercepted at all: online play,
  sign-in and cloud save always talk to the real network.
- `HEAD` requests (the monster loader asks "does this file exist?") are answered from the box, so the glTF
  monsters load offline. `?v=` cache-busters on the AI workers map to the same file.

### Why vendor three.js, cannon-es and the fonts (decision)

jsDelivr sends CORS headers, so the worker *could* cache the CDN copies (it does, as a fallback). I still moved
them into `vendor/` and point the import map there, because: (1) no network dependency at all, not even on the
first launch after install (jsDelivr outages and school/office filters that block it happen); (2) everything is
same-origin, so it goes through the same hash-checked, versioned install as the game's own files; (3) Google
Fonts CSS is browser-specific and its `<link>` (no `crossorigin`) gives opaque responses, which cannot be
checked and count ~7 MB each against Chrome's quota. Cost: ~1.8 MB more in the repo (MIT/OFL licences included).
Versions stay pinned; `tools/fetch-vendor.js` re-fetches them. `build-precache.js` warns if a module imports a
`three/addons/...` file that is not in `vendor/`.

## How updates work (never trapped on an old version)

1. Every launch, every return to the app (visibility), every 30 minutes, on reconnect and on each visit to the
   title screen (at most every 5 minutes) the page asks the browser to check `sw.js`. It is registered with
   `updateViaCache: 'none'`, so the check skips the HTTP cache. Because `build-precache.js` stamps the version into
   `sw.js`, any change to any listed file makes `sw.js` byte-different, so it is always noticed.
2. The new worker downloads the full new version in the background with `cache: 'reload'` (skips the browser's
   10-minute HTTP cache) and checks each file's hash. A mismatch (a CDN edge still holding the old file right after
   a push) is retried with a unique URL. Any network error = install fails, the old version keeps running intact,
   the next check retries (files already fetched are kept, so it resumes).
3. When it is ready: if the game is still on the very first "Tap to Play" screen (within a minute of launch,
   nothing started) it switches straight away (one reload). Otherwise a chip **"✨ New version ready: tap to
   update"** appears on the title screen only, never in a match. Settings shows "Update now" too.
4. Tap: the page tells the waiting worker to `skipWaiting`, it activates, deletes all older `tata-*` caches,
   and the page reloads once on `controllerchange` (with a 4 s fallback reload).
5. If the app is closed completely, the browser activates the new worker by itself on the next launch, and step 3's
   cold-start rule covers the rest.

### Escape hatches

- **Settings, Parent corner, "Reset app cache"**: unregisters the worker, deletes all `tata-*` caches, reloads
  from the internet (refused while offline, with a kind message, since the game could not load again). Progress,
  names and settings are untouched (they live in localStorage).
- **Kill switch** (if a published version ever breaks for everyone): `cp tools/sw-killswitch.js sw.js`, commit,
  push. Each device picks it up on its next check (every launch); it deletes the caches, unregisters, and reloads
  the page from the internet with `?swoff=1`. `js/pwa.js` then stops registering (no reload loop) and re-checks
  `sw.js` once a day; restoring the real `sw.js` + `build-precache.js` turns offline play back on.

## Failure modes considered

| Risk | What happens |
|---|---|
| Half-updated cache (some new files, some old) | Impossible by design: a version is served only from its own complete cache; install is all-or-nothing |
| GitHub Pages `Cache-Control: max-age=600` (checked: every file, incl. `sw.js`; ETag + Last-Modified; `Access-Control-Allow-Origin: *`) | `updateViaCache:'none'` for the worker script; `cache:'reload'` for install downloads |
| Fastly edge still serving the old file just after a push | Hash check + retry with a unique URL |
| Owner forgets `build-precache` (stale list) | File changed: hash differs after retry, the newer server copy is kept. File deleted: 404 is skipped, install does not fail. File added: served by the runtime cache. No update chip until the next build |
| Line endings (git on Windows: CRLF on disk, LF published) | Text files are hashed with CR removed on both sides |
| Offline during install | Install fails quietly, old version keeps working, retried later |
| A worker bug | Kill switch, or Reset app cache on one device |
| Safari 7-day storage rule | Applies to sites used in a Safari *tab* with no visit for 7 days of Safari use: the offline copy (and localStorage!) can be erased; the game then simply loads from the internet again. Home-screen apps are exempt per WebKit. The installed app also asks for persistent storage (`navigator.storage.persist()`) |
| iOS storage quota | ~5.4 MB: far below any limit |
| Firebase requests cached by mistake | Not intercepted at all (allow-list of hosts); verified no cross-origin entries |
| Android back button closes the app mid-match | In the installed app the back button closes a pop-up or goes to the menu; on the title/match screens it does nothing |

## Offline behaviour

- Works offline: matches against all creatures (3D, glTF monsters), Training Camp, On-Sets, daily puzzle, puzzle
  links (`#puzzle=...` are decoded locally), the flat mat, sounds (synthesised), saves.
- Needs the internet, says so kindly (Pip + "You're offline: Playing online needs the internet..."): Play online,
  Continue with Google, Sign in, cloud backups/restore/delete. `js/pwa.js` stops those taps before they reach
  the game when `navigator.onLine` is false. Cloud save sync already queues offline (`js/account.js`).
- A small offline chip at the top (hidden during matches): an amber dot that opens to "Offline: playing on this
  device" for 5 seconds.

## Install helper

- Chrome/Edge (desktop, Android): `beforeinstallprompt` is kept; an **Install app** button appears in Settings
  ("App on this device") and on a one-time title-screen card for Tata.
- iPad/iPhone Safari: no install prompt exists, so "Show me how" opens illustrated steps: Share button, Add to
  Home Screen, open it once online. The card is dismissible and remembered (`localStorage tataPWA.hint`).
- Installed (standalone/fullscreen): safe areas already handled by the game's `--sat/--sab/--sal/--sar`;
  `overscroll-behavior:none` (no pull-to-refresh), iOS page pinch-zoom blocked (`gesturestart`), links to other
  sites open in the browser, Google sign-in uses the redirect flow (already in `js/account.js`).

### Progress on the iPad home-screen app (important)

On iOS the home-screen app has **its own storage**, separate from Safari: Tyson's progress in Safari is not there
on first launch. Two ways to bring it (both shown in the install steps):
1. **Sign in with Google** once inside the app (Settings, Account; needs internet). Reliable inside the iPad app
   only after account.md step D; otherwise use 2.
2. **Export/Import code**: in Safari, Settings, "Move progress to another device", Copy code; open the app,
   paste, Load. Do it before playing in the app, or the app's fresh save and the old one diverge.

## The edits for files I don't own

`node tools/pwa-snippets.js` applies exactly these (anchors are the current text).

**index.html, head.** Replace
```html
<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800;900&display=swap">
```
with
```html
<link rel="icon" type="image/png" sizes="16x16" href="assets/icons/favicon-16.png">
<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">
<link rel="apple-touch-icon" sizes="180x180" href="assets/icons/apple-touch-icon.png">
<link rel="apple-touch-icon" sizes="167x167" href="assets/icons/apple-touch-icon-167.png">
<link rel="apple-touch-icon" sizes="152x152" href="assets/icons/apple-touch-icon-152.png">
<link rel="apple-touch-icon" sizes="120x120" href="assets/icons/apple-touch-icon-120.png">
<!-- PWA: launch pictures for the home-screen app (iPad and iPhone), made by tools/make-icons.js -->
(the 28 lines of assets/icons/splash/links.html)
<link rel="stylesheet" href="vendor/fonts/fonts.css"><!-- PWA: fonts from this site, so they work offline -->
```
The existing `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `status-bar-style black-translucent`,
`apple-mobile-web-app-title`, `theme-color`, `viewport-fit=cover`, manifest and favicon tags stay as they are.

**index.html, after** `<link rel="stylesheet" href="css/onsets.css"><!-- ON-SETS: the sister game -->`
```html
<link rel="stylesheet" href="css/pwa.css"><!-- PWA: home-screen app chips -->
```

**index.html, import map.** Replace the three CDN lines with
```json
  "three": "./vendor/three/build/three.module.js",
  "three/addons/": "./vendor/three/examples/jsm/",
  "cannon-es": "./vendor/cannon-es/cannon-es.js"
```

**index.html, before** `<script src="js/main.js"></script>`
```html
<script src="js/pwa.js"></script><!-- PWA: offline app, updates, install helper -->
```

**js/screens.js, `renderSettings()`, after** `(window.Account ? Account.panelHTML() : '') + // ACCOUNT`
```js
    (window.PWA ? PWA.settingsHTML() : '') + // PWA: app on this device (install, offline, updates)
```
**and before** `'<div class="setrow"><label>Start over from zero</label>...` (Parent corner)
```js
    (window.PWA ? PWA.parentRowHTML() : '') + // PWA: Reset app cache
```

**js/ui.js**: nothing needed. `js/pwa.js` draws its chips in its own fixed `#pwaChips` box and shows them only
while `#title` has class `on` (bottom-left, z-index 45: above the 3D title, below pop-ups). If the title layout
changes and they collide, move `#pwaChips` in `css/pwa.css`.

## Page API (`window.PWA`)

`settingsHTML()`, `parentRowHTML()`, `install()`, `iosSteps()`, `standalone()`, `online()`, `update()`, `check()`,
`reset()`, `state()` → `{sw, controlled, waiting, installable, ios, standalone, info:{version,built,bytes,files}}`,
`cacheMB()`. Actions: `pwaUpdate`, `pwaInstall`, `pwaIosSteps`, `pwaHintClose`, `pwaCheck`, `pwaResetAsk`, `pwaResetGo`.

## Testing notes

The desktop app's browser pane cannot register service workers at all ("unknown error when fetching the script",
even for a one-line worker), so tests ran in a separate headless Chrome driven over the DevTools protocol with a
throwaway profile, on a scratch copy with the snippets applied, served on port 3536, with the internet blocked
by a dead proxy (only localhost reachable).

Verified (desktop Chrome, headless):
- Manifest parsed with no errors; no installability errors; `beforeinstallprompt` fired (Install app button shown).
- First visit: worker installed and controlling; 136 files in `tata-pre-<version>`, **5.4 MB** stored
  (storage estimate 5.5 MB); no cross-origin entries in any cache; a Firebase SDK request passed through untouched
  and was not cached.
- Server stopped + browser offline, then reload: title screen, fonts (Lilita One, Nunito) loaded, 3D on; a 3D match
  started (both glTF monster models and their textures, three.js, GLTFLoader served by the worker); Training Camp;
  an On-Sets match; zero failed requests; the "Play online" tap showed the kind offline message; offline chip shown.
- Update: changed a file + rebuilt the list → new version installed in the background, chip "New version ready"
  on the title screen, not shown during a match; tap → one reload, new version active, old cache deleted, changed
  file served.
- Settings group and Parent corner reset row render; iOS steps pop-up renders.
- Kill switch: worker unregistered, all `tata-*` caches deleted, page reloaded once with `?swoff=1`, not
  re-registered after a further reload.
- `tools/pwa-snippets.js` output identical to the tested copy, and a second run changes nothing.
- `node tests/engine.test.js`: 831 passed.

Not verified: a real iPad/iPhone (Add to Home Screen, launch pictures, Safari's service worker and storage
behaviour, the iOS standalone back/zoom manners, Google sign-in inside the installed app), Android, and the
live GitHub Pages deploy (headers were checked with curl; the hash/CR handling is designed for it but untested there).
Test tip: Python's server answers 304 when a file's timestamp did not change, and on Windows `copy` keeps the old
timestamp, so when testing the kill switch locally write the file rather than copy it (Pages has no such issue).
