# Accounts and cloud save (handoff)

The owner asked: "make a login so Tyson can play on different machines and save his progress by logging in."
The family picked **Google sign-in**. Email + password is built too, switched off by default.

Files: `js/account.js` (everything), `js/account-config.js` (which sign-in buttons show), `css/account.css`,
`tests/account.test.js`, `docs/handoff/firebase-rules.json` (new `users` block), and a small block marked `ACCOUNT`
at the end of `js/online-net.js`. Nothing else was edited: the four hooks below are for the lead to paste.

---

## 1. Firebase console steps (the lead does these; nothing was changed in the console)

### A. Google sign-in (do this first)
1. Firebase console → project **tatas-equations** → **Build → Authentication → Sign-in method → Add new provider → Google**.
   Switch it on, pick the **project support email** (the owner's Gmail), **Save**.
   (Anonymous must stay on: online play still uses it when nobody is signed in.)
2. **Authentication → Settings → Authorized domains**: make sure these are listed (add the missing ones):
   - `profsean.wang` (the live site; without it every sign-in fails with "unauthorized domain")
   - `localhost` (there by default) and `127.0.0.1` (for testing with `python -m http.server`)
   - `tatas-equations.firebaseapp.com` (there by default; it hosts the Google sign-in helper page)
3. Publish the rules (section C).
4. Test on the live site: Settings → Account → **Continue with Google**, then sign in with the same Google account on
   a second device. Expect "Progress loaded from the cloud!" on the second (fresh) device.

**How the Google sign-in works, and why it is popup-first**
- The button opens Google's sign-in in a **pop-up** (`signInWithPopup`). That works on a custom domain like
  `profsean.wang` even though the helper page lives on `tatas-equations.firebaseapp.com`, because the pop-up is a
  first-party window and hands the result back with `postMessage`. Safari's third-party storage blocking
  (storage partitioning, ITP) does not break this path.
- Safari only allows a pop-up that opens **straight from a tap**. The Firebase SDK is loaded lazily, so
  `js/account.js` starts loading it the moment the sign-in pop-up of the game opens (tapping the chip), and the
  Google button calls `signInWithPopup` synchronously in the tap handler once it is loaded. (If someone taps before
  the SDK has arrived, it still tries; a blocked pop-up then falls back as below.)
- **Fallback**: if the pop-up is blocked (`auth/popup-blocked`), or the game runs as a home-screen app on iPad/iPhone
  (no pop-ups there), it uses `signInWithRedirect` (a full-page trip to Google and back), and the result is picked up
  on the next page load (`getRedirectResult`, run whenever the SDK starts; a sessionStorage flag makes it start right away).
- **The redirect caveat on a custom domain**: with `authDomain: "tatas-equations.firebaseapp.com"` and the site on
  `profsean.wang`, the redirect way relies on third-party storage, which Safari 16.1+, Firefox and (soon) Chrome block.
  There, the redirect comes back with no result. The game then says kindly: "The Google page did not return to the
  game. Tap Continue with Google again. On an iPad, allowing pop-ups for this site helps (Settings, Safari, Block
  Pop-ups off)." So: **popup-first works with no extra setup; the redirect fallback is fully reliable only after the
  optional step D.**

### D. (Optional) make the redirect fallback reliable in Safari: host the sign-in helper on profsean.wang
Only needed if pop-ups turn out to be a problem on Tyson's iPad, or for a home-screen install.
1. Download these files from the Firebase-hosted helper and keep the same paths:
   `https://tatas-equations.firebaseapp.com/__/auth/handler`, `.../__/auth/handler.js`, `.../__/auth/experiments.js`,
   `.../__/auth/iframe`, `.../__/auth/iframe.js`, and `https://tatas-equations.firebaseapp.com/__/firebase/init.json`.
2. Serve them at the **root of the domain**: `https://profsean.wang/__/auth/handler` etc. (not under `/tatas-equations/`).
   That is the repository that serves `profsean.wang` itself. GitHub Pages runs Jekyll, which **skips folders that start
   with `_`**: add an empty `.nojekyll` file at that repository's root. `handler` and `iframe` have no extension; check
   they are served as `text/html` (if not, the helper will not run; then this option needs a host that sets types).
3. Google Cloud console → APIs & Services → **Credentials** → OAuth 2.0 client "Web client (auto created by Google
   Service)" → **Authorized redirect URIs**: add `https://profsean.wang/__/auth/handler`; **Authorized JavaScript
   origins**: add `https://profsean.wang`.
4. In `js/account-config.js` add `authDomain: 'profsean.wang'`:
   `window.ACCOUNT_CONFIG = { google: true, email: false, authDomain: 'profsean.wang' };`
   (`js/account.js` uses it when it starts Firebase; it starts Firebase before online play does, so both share it.
   `js/online-config.js` stays as it is.)

### B. Email + password (only if the family wants it later)
1. Authentication → Sign-in method → **Email/Password** → on (leave "Email link" off) → Save.
2. `js/account-config.js`: `email: true`.
3. Optional: Authentication → Templates → Password reset: set the sender name to "Tata's Equations".
   Email enumeration protection (on by default for new projects) means "Forgot password?" always says
   "if there is an account..." and a wrong email gives the same sentence as a wrong password; the game's wording copes.

### C. Publish the security rules
Realtime Database → **Rules** → paste the whole of `docs/handoff/firebase-rules.json` → **Publish**.
The `rooms` part is unchanged (byte for byte); a `users` part is added:
- `users/<uid>` can be read and written **only by that same signed-in user**, and **not by anonymous users**
  (`auth.token.firebase.sign_in_provider !== 'anonymous'`). Nobody can list or read anyone else's save.
- `users/<uid>/save` must have exactly `v` (1), `data` (a JSON string, 2 to 300,000 characters, starts with `{`),
  `rev`, `updatedAt` (must be the server time), `device` (≤ 40 chars), `did` (≤ 20 chars). Nothing else is allowed
  under `users/<uid>`.
- `rev` must be exactly the old `rev + 1` (or 1 when there is no save). This is the "never overwrite each other"
  guarantee: a device writing from an old copy is refused, and then merges (section 3).
- Until the rules are published, sign-in works but the cloud save is refused; the Account panel then shows
  "The cloud said no. Tata may need to publish the new save rules first." Local saving is never affected.

---

## 2. Hooks for the lead to paste (exact anchors)

### index.html
After the anchor line `<link rel="stylesheet" href="css/fans.css">` add:
```html
<link rel="stylesheet" href="css/account.css"><!-- ACCOUNT -->
```
After the anchor line `<script src="js/online-net.js"></script>` add (must be after config.js, progress.js, game.js
and online-net.js, and **before** `js/online.js` and `js/main.js`):
```html
<script src="js/account-config.js"></script><!-- ACCOUNT -->
<script src="js/account.js"></script><!-- ACCOUNT -->
```

### js/ui.js, in `gotoTitle()` (the title chip)
Anchor: the line that starts with `    '<div class="stagechip">' + st.icon`. Insert this line just above it:
```js
    (window.Account ? '<div class="acct-wrap">' + Account.chipHTML() + '</div>' : '') + // ACCOUNT
```

### js/screens.js, in `renderSettings()` (the Account panel)
Anchor: the line `    '<div class="group"><h3>' + ico('disk') + ' Move progress to another device</h3>' +`.
Insert this line just above it:
```js
    (window.Account ? Account.panelHTML() : '') + // ACCOUNT
```

### js/config.js `persist()`: no edit needed
`js/account.js` wraps the global `persist()` once at load (`persist = function () { rawPersist(); onPersist(); }`),
so every existing `persist()` call (including `importCode()` and Reset) also schedules a cloud save. Nothing else in
the game reassigns `persist`; keep it that way (or wrap it the same way, calling the previous function).

### "Is a match running?" check
Built in: `Account.idle()` is true only when `current` is one of `title, settings, trophies, stats, season, cabinet,
fans, setup, splash`, `G` is null, the Solution builder is closed and no pop-up other than an Account one is open.
If a feature has a "busy" state that is not covered (e.g. an online lobby that must not be disturbed), define
`window.accountBusy = function () { return true-while-busy; }`; account.js respects it. No paste needed otherwise.

All four were applied in the worktree for the browser test, and reverted before the commit (they apply cleanly on
`d6acb35`).

---

## 3. How it behaves

### Signing in
- Title screen: a small chip under the player card: "☁ Sign in to save" → after sign-in "☁ Tyson ✔"
  (✔ saved, spinning ⟳ saving, ⚠ offline: saved here, ? pick a save, ! not saved to the cloud). Tapping it opens the
  sign-in pop-up, or (signed in) the account pop-up with status and "Sync now" / "Sign out".
- Settings → **Account and cloud save**: sign in, status, "Last saved to the cloud: today at 3:41 PM · This device:
  iPad", **Sync now**, **Sign out**, **Restore a backup (n)**, **Delete my cloud save**.
- Google: "Continue with Google" (big white button with the G logo). Email (when on): a real `<form>` with
  `autocomplete="email"` and `current-password` / `new-password` so password managers fill it; modes Sign in / Create
  an account / Forgot password? (reset email). The password is read once from the field when the form is submitted,
  handed to Firebase, and the field is cleared; it is never stored, logged or kept in a variable.
- Online play and anonymous users: if the device is signed in anonymously for online play, **Google links the
  anonymous user** (`linkWithPopup` / `linkWithRedirect`, same uid, nothing breaks); if that Google account already
  exists, the anonymous user is cleanly replaced (`signInWithCredential(error.credential)`). Email "Create an account"
  links the anonymous user with `linkWithCredential`; email "Sign in" replaces it. After linking, the ID token is
  refreshed so the database sees a non-anonymous sign-in. The `ACCOUNT` block in `js/online-net.js` makes `Net.init()`
  wait until a saved sign-in has been restored (so the anonymous sign-in can never replace it), and then returns
  whoever is signed in now; signed out, it signs in anonymously exactly as before.
- Firebase only loads when needed: on a device that never signed in, nothing extra loads until the chip is tapped.

### The first sync on a device (never loses progress)
- The cloud has no save → this device's save goes up.
- This device has no real progress yet (no XP, badges, history, creatures, Solutions or shakes; settings alone do
  not count) or both are identical → the cloud save is used ("Progress loaded from the cloud!").
- Both have real progress → **"Two saves found!"** with a card for each (level and XP, creatures beaten, badges,
  correct Solutions, last played, and which device the cloud copy came from), and three buttons:
  **Combine: keep the best of both** (green, "Recommended"), **Keep the one from the cloud**, **Keep this device's**,
  plus "Decide later" (nothing syncs until a choice is made; the chip says "Pick a save").
- Whatever is replaced is first kept as a backup on this device: localStorage `tatasEquations.backup.<time>` =
  `{ why, data }`, the last 3 kept, listed under Settings → Account → **Restore a backup** with date, reason and a
  summary. "Keep this device's" backs up the cloud copy it overwrites.

### While playing
- Every `persist()` marks the save "changed" and schedules a push 3 seconds later (also pushed on `pagehide` and when
  the page is hidden). One write at a time; a newer change during a write is pushed right after.
- Each write is `rev + 1`; the rules refuse a write from an older copy. Then this device reads the cloud copy,
  merges (the same Combine), and pushes the result. Merging is lossless, so two devices playing at once both keep
  everything.
- A live listener hears when another device wrote a newer `rev`. It is applied **only when idle** (a menu, no match,
  no pop-up); during a match it waits and is applied when he is back on a menu. If this device had unsent changes,
  it combines; otherwise it simply takes the newer copy (it already contains this device's earlier saves, because the
  revisions form one chain). A toast says "Updated with progress from iPad." If a newer copy has less XP than this
  device (e.g. Reset progress elsewhere), this device's save is backed up first.
- Offline: the game plays and saves on the device as always; the chip shows ⚠; the write waits and goes up when the
  connection is back (Firebase queues it; on conflict it merges as above).
- "Reset progress" while signed in resets the cloud too (Tata asked for it), but the cloud copy is first kept as a
  backup on that device.

### Signing out: "Keep Tyson's progress on this device?"
Default and recommended: **Yes, keep it here**. The game keeps playing as now; signing in again later just syncs.
Choosing "No, start fresh on this device" resets the game on that device, keeping a backup (Restore a backup). Before
signing out, unsent progress is pushed (waits up to 4 s); if it could not reach the cloud (offline), the device keeps
its progress whatever was chosen and says so. Why "keep" is the safe default for a family: signing out must never be
the moment progress disappears; if a sibling later signs in with a different account on that device, the "Two saves
found!" choice (with backups) handles it.

### Delete my cloud save
Confirm pop-up ("This can't be undone"; "The progress on this device stays"). It removes `users/<uid>/save` and signs
this device out. Other devices signed in to the same account notice the deletion and sign out too (keeping their
local progress), so the deletion sticks instead of being re-uploaded a second later.

### Size
The cloud save is `JSON.stringify(S)` plus `{ v, rev, updatedAt, device, did }`, stored as one string (so Firebase
does not drop empty objects / nulls or turn arrays into objects). Measured by `tests/account.test.js`: default
1.4 KB, typical (300 history entries) about 13 KB, the maximum (600 history entries, the cap in builder.js) about
37 KB. History is about 90% of it; it is kept because Stats' all-time accuracy and the day chart read it. There are no
caches or derivable data in `S` worth stripping.

---

## 4. How each top-level key of S is merged ("Combine")

"Latest" = the value from the side played most recently (this device's last save time vs the cloud's `updatedAt`).
Keys a future feature adds are kept from either side; objects merge key by key, otherwise latest wins.

| Key | Shape | Combine rule |
|---|---|---|
| `v` | 1 | highest |
| `name`, `backName`, `jersey` | strings | latest |
| `oppNames` | 10 strings | latest |
| `xp` | number | highest (so level is the highest) |
| `badges` | `{id: date}` | union; earliest date kept |
| `stats` | counters | each total highest (`correct`, `attempts`, `nowWins`, `impWins`, `goalsSet`, `pvpShakes`, `daily`, `fractionSolutions`, `bestMatch`, `shakes`, `challenges`, `challengeWins`); "right now" values `streak`, `noHint`, `lastWrong` latest |
| `history` | `[{t, ok, ms, g, c}]` | union (de-duplicated), sorted by time, newest 600 kept |
| `best` | `{fastMs, hardGoal, hardGoalText, mostCubes}` | fastest time (0 = none), hardest Goal (with its text), most cubes |
| `opsUsed` | `{op: n}` | highest per operation |
| `ladder` | `{stage, stars}` | highest stage, then most stars |
| `unlockAll`, `opsManual` | Tata's parent-corner switches | latest |
| `beaten` | 10 booleans | beaten on either |
| `cos` | `{skin, mat, victory, pack, stadiumIntro}` | latest, with keys from both (so `stadiumIntro` is never lost) |
| `set` | all settings | latest, with keys from both |
| `cups` | `{run, won, list}` | `won` highest per cup; `list` union; cup in progress (`run`) latest |
| `ways` | `{lvl, row, miss, done, total, best}` | medal best per level; `done`/`total` highest; `lvl/row/miss` from the side that played more |
| `gift` | `{made, solved}` | `made` union by code (30 newest); `solved` union by code (earliest), 200 kept |
| `tips` | `{seen, kinds, last}` | counts highest; `last` latest |
| `trios` | `{pair: true}` (crowns) | union |
| `vari` | `{base, seen}` | earliest `base` (= more variation cards unlocked), highest `seen` |
| `bonus` | `{base, seen, opsSeen, force, off, opOff}` | dice/faces seen union; earliest `base`; Tata's switches (`force`, `off`, `opOff`) latest |
| `team` | `{mate, mjersey, boss}` | latest |
| `teamWins` | `{creature: n}` | highest per creature |
| `lastDedication` | date | latest date |
| `tutorialDone` | boolean | done on either |
| `dailyDone` | `{date: true}` | union |
| `kit`, `kits`, `kitUse` | the shirt and kits | latest |
| `camp` (Training Camp) | `{quizRow, <drill>: {lvl,row,miss,done}}` | per drill: level from the side that played more, `done` highest; `quizRow` latest |
| `wx` (stadium weather) | `{n, cur}` | `n` highest; current sky latest |
| `puz` (today's puzzles) | `{date, cur, extra}` | same day: furthest `cur`/`extra`; else the later day |
| `cards` (creature cards) | `{id: date}` | union; earliest date |
| `stadiumTierSeen` | number | highest |
| `season` | `{c, m, hist, won, cer, last}` | each league: the one further along (season number, then fixtures played); finished seasons union (40 newest); pennants won highest per kind; a waiting ceremony kept; `last` latest |
| `fans` | `{v, k: {kind: {d, at}}}` | fans found union; earliest date; places seen from both (4 max) |

`tests/account.test.js` fails if any key of `defaults()` (read from js/config.js) or the feature keys above has no
rule, checks each rule by hand, and runs 400 random pairs of saves checking that nothing monotonic ever goes down
(XP, level, badges, creatures, stats totals, ladder, best, history, cups, ways, gift, crowns, cards, fans, season
pennants...), that every key survives, that Combine is idempotent and symmetric, and that the inputs are not changed.

---

## 5. Testing without the real project: `?accounttest=1`

Open two (or three) tabs on `http://127.0.0.1:3512/`:
`?accounttest=1&dev=a` and `?accounttest=1&dev=b` (each `dev` is a pretend device with its own save,
`tatasEquations.v1.acct.<dev>`, its own sign-in and its own backups). The pretend cloud and accounts live in this
browser's localStorage (`tataAcct:*`); tabs hear each other's writes through `storage` events. Both sign-in methods
show in this mode. Pretend Google always signs in as "Test Parent" (parent.google@example.test).
- `&popup=blocked`: the Google pop-up is "blocked", so the full-page fallback runs (a reload that comes back signed in).
- `&noprov=google` / `&noprov=email`: that method is "not switched on yet".
- In the console: `Account.drop(true)` / `Account.drop(false)` = Wi-Fi off / back; `Account._debug()` shows the state.
The pretend backend enforces the same `rev + 1` rule as the real rules.

## 6. What was verified, and what was not

Verified (this worktree, pretend backend, Chrome-based browser pane, port 3512):
- Device A with progress signs in with Google → cloud empty → uploaded (rev 1); chip "Tyson ✔".
- Device B (fresh) signs in through the **blocked-pop-up → redirect fallback** → comes back signed in, cloud save
  loaded (backup of the fresh local save kept).
- Live update A → B on a menu; B in a match (`G` set) holds the update, plays on (its own change pushed), and applies
  A's newer copy as soon as `G` is null; both end on the same rev with everything combined.
- Device C with different progress signs in → "Two saves found!" with both summaries → **Combine** → highest XP,
  union of badges and creatures, highest ladder and totals; A picked it up live. Reloading with the choice open asks again.
- Offline: C goes offline, saves (chip ⚠), A writes meanwhile; C back online → its queued write is refused (rev),
  it merges and pushes; A and C converge with both changes.
- Email: wrong account ("There is no account with that email yet..."), short password, create account (form submit
  with Enter; `autocomplete` email / new-password / current-password), wrong password, "Forgot password?",
  sign in again. Sign out "start fresh" (backup kept) and "keep"; Restore a backup (pushed to the cloud);
  Delete my cloud save (the other signed-in device signed out by itself, local progress kept);
  "provider not switched on" message; Reset progress while signed in (cloud copy backed up first).
- Without `accounttest`, with the real config: the chip shows "Sign in to save", nothing loads at start;
  `Account.authReady()` loads the real Firebase SDK 10.12.2 and restores "no user" in ~0.6 s with no console errors.
  No real account (not even anonymous) was created, no credentials typed into the real project.
- `node tests/engine.test.js` 822 passed; `node tests/account.test.js` 572 passed.

Not verified (cannot be until the providers are on):
- Real Google sign-in, the real pop-up, real linking of an anonymous online user, and the real security rules
  (the `rev + 1` rule and the non-anonymous check were reasoned through, and mirrored in the pretend backend, but not
  run against Firebase; the Rules Playground in the console can check them before publishing).
- iPad Safari: whether the pop-up opens from the tap (the SDK is preloaded for that), the redirect fallback without
  step D (expected to come back empty in Safari, with the kind message), home-screen mode.
- Real email sending for "Forgot password?".
- Two different real devices with a real network drop.
