# Handoff: the avatar maker, players on this device, the kit designer for anyone (agent `maker`)

Branch: `worktree-agent-a0287534405747dca` (fast-forwarded onto main `ea530d0` first, so it has the newest
`js/people-data.js` with highpony / spacebuns / halfup / curtain, clips / scrunchie, `gems`, `streaks`).
Files (all mine): new `js/avatar.js`, new `js/crew.js`, new `css/avatar.css`, changed `js/kit.js`, this note.
Nothing else touched. Tests: engine 948, explain 4558, rivals 2110, account 621, parent 75, onsets 152, voice 61,
missions 603, why 4902, people 142: all pass.

## 1. Tags to add to index.html

Stylesheet, right after `<link rel="stylesheet" href="css/kit.css">` (a11y.css must stay last):

    <link rel="stylesheet" href="css/avatar.css"><!-- MAKER: avatar maker and players list -->

Scripts, right after `<script src="js/kit.js"></script>` (people-data.js is already earlier, at the top of the list):

    <script src="js/avatar.js"></script><!-- MAKER: the avatar maker -->
    <script src="js/crew.js"></script><!-- MAKER: players on this device -->

Both are classic scripts using `S`, `ACT`, `modal`, `closeModal`, `esc`, `ico`, `persist`, `People`, `Kit`, `T3` at call time.

## 2. API

### Avatar (js/avatar.js)
- `Avatar.open(target, opts)`
  - `target`: `{ kind: 'own' }` (the save's own player), `{ kind: 'crew', id }`, `{ kind: 'new' }`. An unknown crew id
    becomes `new`; `new` when the list is full (People.MAX_CREW) shows a plain "The list is full" pop-up instead.
  - `opts.onDone(result)`: called exactly once when it closes. Done: for own the `Crew.person('own')` object, for others the
    saved member (People.cleanMember shape). Cancel (or the pop-up closed by anything else): `null`.
  - `opts.tab`: first tab, `'who' | 'body' | 'skin' | 'face' | 'hair' | 'kit'` (default `'who'`).
  - Tabs: **Who** (name, shirt number 1-99 with - / +, name on the back), **Body** (People.BODIES with label + hint, each a
    picture of this person with that body; People.HEIGHTS), **Skin** (People.SKINS swatches, screen-reader names
    "Tone 1".."Tone 10"), **Face** (People.EYES, People.GLASSES + GLASS_COLORS when glasses are on, picture pairs for
    freckles / longer lashes / rosy cheeks / face sparkles (`gems`), People.BEARDS only for teen / adult-a / adult-b),
    **Hair** (People.HAIR_STYLES as head pictures, People.HAIR_COLORS, streaks: None + every other HAIR_COLORS swatch,
    People.ACCS as head pictures + ACC_COLORS when one is on), **Kit** (front / back picture + "Design the kit").
    Every list is built by looping over the People lists at run time, so new options appear by themselves (a hair style
    with no flat shape yet is drawn as `short`; see weak spots).
  - Picture: big, always in view; Front / Side / Back buttons change the view once (nothing rotates or moves at rest).
    "Surprise me" (keeps body and height; about 15% fun hair colours, 25% streaks, 25% sparkles, 40% an accessory,
    beards only where allowed, grey / white hair left out for the young bodies), "Start again" (back to how it was when
    opened, kit included).
  - Switching body to a kid body hides the beard and sets it to none; switching back within the same visit restores it.
  - Kit button: opens `Kit.open({ kind: 'draft', person })` on the maker's own copy, then comes back to the maker on the
    Kit tab. Kit changes made there are only kept if the maker's Done is pressed (Cancel throws them away too).
- **What Done saves**
  - own: `S.avatar = People.clean(a)` with `at: Date.now()`; `S.set.me = People.isAdult(a) ? 'tata' : 'kid'`;
    `S.name = People.cleanName(typed)` (only if something was typed; otherwise unchanged); `S.backName` = the typed back
    name (cleanName, upper case) or else the name in upper case (max 12); `S.jersey = People.cleanJersey(...)`;
    `S.kit / S.kits / S.kitUse` from the draft; also `S.kit.hair = avatar.hair` and `S.kit.hairStyle` when the style is
    one of the five old ones (older 3D code still reads the hair from the kit); `S.avatarAsked = true`; `persist()`;
    `T3.playerRefresh && T3.playerRefresh()`.
  - others: `People.saveMember({ id, name, jersey, back (null = use the name), avatar, kit, kits, kitUse })`, `persist()`.
  - Placeholders on a brand-new save: `S.name === 'Champ'` shows an empty name box ("Type a name"); `S.backName` ===
    `'TYSON W.'` (or null) while the name does not start with "Tyson" counts as not chosen: the back box is empty and the
    printed back name follows the typed name. A save whose back name is anything else is untouched unless edited.
- `Avatar.firstRun(done)`: if `S.avatar` or `S.avatarAsked` exists, calls `done()` at once. Otherwise sets
  `S.avatarAsked = true` (+ persist) and shows "Make your player!": picture, a "Your name" box (empty for 'Champ'),
  **Make it!** (keeps the name, fixes a placeholder back name, opens the maker on Body, or on Who if no name was typed)
  and **Skip for now** (keeps a typed name, default kid look). `done()` runs once, after the maker or Skip closes.
- `Avatar.flat(p, view, crop)`: SVG string (class `av-flat`). `p = { avatar, kit (saved or full shape, `_slot` ok),
  name (printed on the back), number }`, `view 'front' | 'side' | 'back'`, `crop 'bust' | 'head'`.
- `Avatar.surprise(avatar)`: a random clean avatar with the same body and height. `Avatar.active()`: the maker is open.
- `ACT.openAvatar`: for a button anywhere (`data-act="openAvatar"`), opens the maker for the save's own player.

### Crew (js/crew.js)
- `Crew.open()`: pop-up "Players": You first, then the others; each card has a round picture, name, number, **Edit**
  (opens the maker, comes back to the list) and, for the others, **Remove** ("Remove Mia? This deletes Mia's look and
  kit from this device. Nothing else changes." Keep / Remove -> `People.removeMember(id)` + `persist()`).
  "Add a player" while there is room. `ACT.openCrew` for a button anywhere.
- `Crew.choose(opts, cb)`: "Who is playing?" (or `opts.title`): You and the others with pictures, minus `opts.exclude`
  (ids already in a seat, `'own'` for the save's own player; they are left out, not greyed), **Someone new** (when there
  is room: the maker, then that person is picked; Cancel in the maker comes back to this list) and **Guest** (`cb(null)`).
  **Back** closes it and calls `opts.onCancel()` if given (closing it any other way does the same); cb is not called.
  cb runs after the pop-up has closed, so the caller can open its own pop-up straight away.
- `Crew.person(id)`: `{ id: 'own' | 'c..', name, jersey, back, avatar, kit }` or null. `back` is the printed back name
  (own: `backName()`, others: `People.backOf(m)`). `kit` is the saved shape: `Kit.current()` (full) for own,
  `People.kitOf(m)` for others (may carry `_slot`; `Kit.fill()` makes it full).
- `Crew.faceHTML(person, size)`: a round picture (`span.cr-face`, `size` px): the flat head at once; when 3D is on, a
  `T3.playerPortrait(..., 160, 'face')` is queued (one at a time, so requests never cancel each other) and every
  `[data-face]` element with that look gets the picture when it arrives. Cached in memory by the look itself (avatar,
  full kit, number, back name), so lists never redraw what they already have and never show a stale face.
- `Crew.everyone()`: all persons, own first. `Crew.forget()`: drops the waiting picture queue.

### Kit (js/kit.js) changes
- `Kit.open()` / `ACT.openKit`: unchanged for the save's own kits (same panel, same saving on every tap).
- `Kit.open({ kind: 'crew', id, onDone })`: the same panel for a crew member; every tap saves through
  `People.saveMember` + `persist()`; title "Mia's kit"; the number edits the member's `jersey`; no `T3.playerRefresh`.
- `Kit.open({ kind: 'draft', person, title, onDone })`: edits `person.kit / kits / kitUse / jersey` in place, saves nothing.
- Any target may carry `onDone()`, called when the panel closes.
- `Kit.fill(k)`: saved-shape kit (or a People.kitOf slot with `_slot`) -> full kit. `Kit.viewOf(person)`: the full kit a
  person object wears now.
- The preview passes the right person to `T3.playerPortrait`: `avatar` always (own: `People.own()`); for someone else also
  `name` (printed back name), `number`, and their hair in the kit. The flat preview's V-neck uses their skin, the back
  their name.
- Hair colour and hair style rows are gone from the panel (they are in the maker). `Kit.get()`, `Kit.current()`,
  `defaults()` (still holds `hair` / `hairStyle` defaults, read by older code) are unchanged.

## 3. New save fields
- `S.avatar` (People shape, with `at`), `S.avatarAsked` (true once the first-run invitation was shown, or after any own
  Done). `S.crew` / `S.crewGone` through People's helpers only. `S.set.me`, `S.name`, `S.backName`, `S.jersey`,
  `S.kit`, `S.kits`, `S.kitUse` as before. The cloud-merge rules for `avatar` / `crew` are in People's commit on main;
  `avatarAsked` falls to the generic rule (newest wins), which is fine for a flag that only ever becomes true.

## 4. Patches for files I do not own (optional, for the lead)

Settings / Trophy Room entry point. Find (exactly once in `js/screens.js`):

    if (typeof Kit !== 'undefined') html += '<h3 class="tierh">' + ico('star') + ' My kit</h3><div class="row" style="justify-content:flex-start;margin:6px 0 12px"><button class="btn green" data-act="openKit">' + ico('star') + ' Design my kit</button></div>';

Replace with:

    if (typeof Kit !== 'undefined') html += '<h3 class="tierh">' + ico('star') + ' My kit</h3><div class="row" style="justify-content:flex-start;margin:6px 0 12px"><button class="btn green" data-act="openKit">' + ico('star') + ' Design my kit</button>' + (typeof Avatar !== 'undefined' ? '<button class="btn blue" data-act="openAvatar">' + ico('pencil') + ' My player</button><button class="btn" data-act="openCrew">' + ico('people') + ' Players</button>' : '') + '</div>';

The Settings choice "My player looks like Kid / Grown-up" (`ACT.setMe`, js/screens.js) now fights the maker (Done
writes `S.set.me` from the body). Suggest removing that row or replacing it with the `openAvatar` button.

## 5. How it was checked
Static server on 127.0.0.1:3473 from this worktree, my files injected from the console, one browser tab I created.
- Flat drawing, by picture (contact sheets POSTed to the receiver, `pc_front`, `pc_sideback`, `pc_feat`, `pc_feat2`,
  `pc_surprise`): all 22 hair styles in front, side and back on all ten skin tones and many hair colours; all five
  bodies; every beard; both glasses; every accessory front / side / back; sparkles, streaks, lashes, freckles; 14 random
  "Surprise me" people. Fixed on the way: curls and the afro showed every circle's outline (now one outline), shapes
  drawn in opposite directions cut holes (each sub-shape is now its own path), sparkles looked like tears (now coloured
  four-point stars on the cheekbone).
- Maker, by measurement (element rectangles) and screenshots: 1024x768, iPad sideways 1180x820, iPad upright 820x1180
  (picture on top, 300x330), phone 375x812 (picture 132x150 beside Front / Side / Back): no sideways scrolling, Done
  always on screen, every button 44 px or more; text size XL (`ts-xl`, --ts 1.3) at 1180x820 and 375x812 still fits.
- Flows, by script: own (cancel leaves S untouched including kit edits made through the Kit button; Done saves all
  fields; placeholder 'Champ' / 'TYSON W.' handling; S.set.me follows the body), new player with a name containing
  `<b>` (stored as "Mia b", shown escaped), Kit button round trip, crew kit designer saving through saveMember,
  Kit.open() for own unchanged (no hair rows, saves on tap), Crew.open / Remove / Keep, Crew.choose with exclude,
  Guest, Back + onCancel, Someone new, firstRun (once only, leads with the name), keyboard focus kept on the tapped
  choice after a redraw with aria-pressed set. 3D on: portraits arrive for the maker and for the faces (they still show
  the old kid, see below). No console errors.
- Not checked: real iPad / phone hardware, VoiceOver itself (labels and roles are in place), Firefox / Safari.

## 6. Known weak spots
- `T3.playerPortrait` in this branch ignores `avatar`; with 3D on, the maker's big picture and the faces show the old
  kid until the other helper's change lands (the flat drawing is underneath and shows when 3D is off or the portrait is
  null). The maker asks for whole-body views `{ yaw: -0.2 }`, `{ yaw: -PI/2 }`, `{ yaw: PI }` at 400 px; faces use 'face'
  at 160 px. If the 3D side wants a different size or a flag, change `VIEWS3D` in avatar.js / `pump()` in crew.js.
- Height shows only as a small shift of the bust in the flat drawing (the Height tiles have their own little figures).
- A hair style added to People later gets a choice tile at once but is drawn with the `short` shape in the flat drawing
  until someone adds its shapes to `FRONT` / `HANG` / `BACKV` / `SIDEX` in avatar.js.
- The players list scrolls inside the pop-up on a phone with 5+ players (Done is at the bottom of the list).
- Kit changes for a crew member made through the players list's Edit -> Kit go through the maker (draft) and are saved
  on the maker's Done; `Kit.open({ kind: 'crew' })` saves on every tap, like the save's own panel.
