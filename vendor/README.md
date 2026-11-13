# vendor/

Third-party files served from this site so the game needs no CDN (and works offline as a home-screen app).
Fetched by `node tools/fetch-vendor.js` (pinned versions; re-run only to change a version). Do not edit.

| Folder | What | Licence |
|---|---|---|
| `three/` | three.js r170 (`build/three.module.js`) and the 4 addons the game imports | MIT (`three/LICENSE`) |
| `cannon-es/` | cannon-es 0.20.0 physics | MIT (`cannon-es/LICENSE`) |
| `fonts/` | Lilita One and Nunito, latin + latin-ext woff2 (`fonts.css` declares them) | SIL Open Font License 1.1 |

Adding a new `three/addons/...` import? Add it to the list in `tools/fetch-vendor.js` and run it;
`tools/build-precache.js` warns about any import that has no file here.
