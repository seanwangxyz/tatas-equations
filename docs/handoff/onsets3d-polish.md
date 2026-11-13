# Handoff: On-Sets on the 3D table, polished to match Equations (agent `onsets3d-polish`)

Files: `js/three/onsets3d.js` (rewritten, same `T3.onsets` API plus additions), `js/onsets/view3d.js` (`OS3D`, API backward
compatible, additions below), small ONSETS-marked edits in `js/three/table.js` (2 lines) and `js/three/bigscreen.js` (one
branch). Not touched: engine.js, ai.js, game.js, ui.js, menu.js, teach.js, css, index.html, sound.js.
`node tests/onsets.test.js` 152 passed, `node tests/engine.test.js` 948 passed.

## What changed (before -> after)

### The cards
- Card stock: a rounded slab with a tiny bevel (catches light along the edge), 0.08 thick, a printed double border in
  indigo-grey, faint linen grain. Dots are glossy beads (radial light, dark rim, a shine), always in the same 2 x 2 places
  (blue top left, red top right, green bottom left, yellow bottom right); a missing colour is a faint empty dish, so the
  layout reads even on the blank card. `a11yDot(c)` still works (shapes + letters, redrawn live on `a11ychange`).
- A designed back (indigo field, fine diamond lattice, gold line, cream medallion holding the 4 dots), used by the deal.
- Universe zone rebalanced (Universe and Goal taller, Resources shorter) so 12 cards are 6 x 2 at 1.17 scale (was 1.03) and
  6 cards one row at 1.37. Grid picks the fewest columns within 4% of the best size (7 cards = 4 + 3 rows, not one long row).
- Contact shadow fixed: it used to punch holes in the canvas alpha (a black band in canvas exports, not on screen); the
  blend now leaves alpha alone.

### The deal and the tidy-up (new)
- `deal(universe, side, done)`: a small deck (cards face down, hand-stacked, half size) slides in from the dealer's side to the
  right end of the Universe label strip (0.5 s), then the cards leave it one by one (105 ms apart, 0.6 s flight), turn over
  mid-air and land in the grid. A tap skips it. Calm (`A11y.calm()` / reduced motion): no deck, each card grows in place.
- `tidy(done)`: the reverse (cards flip back onto the deck, which slides away). `OS3D.newShake()` calls it, so the cards of the
  last shake go back to the deck behind the "set out the white cubes" pop-up.
- The last shake's cubes now stay where they lie until the roll (`keep` in view3d.js skips `T3.sync` meanwhile) so the cup
  sweeps them in (Equations' own tidy-up) and the roller dumps the cup.

### Teaching lift and replay
- A lifted card gets a thin glowing rim in the set's colour (R red, B blue, G green, Y gold, V violet, else gold; done in the
  card shader, no extra draw call), a coloured glow under it (drawn only while something is lifted), others dim gently
  (32%, was 48%).
- The count label is a sewn patch like the zone labels: the set's name, a bright count disc, the word "cards".
- Replay end: "5 cards = the Goal 5!" patch by the Goal, two soft rings opening on the cloth and the brass frame warming once
  (`T3._craft('ring' | 'plinth')`, calmer automatically). Wrong count: no burst, same kind patch as before.

### The cubes
- Faces redrawn like the Equations cubes: symbols are bold vector shapes (cup U, arch n, bar, slanted prime, V, Λ) with a
  firm outline, drop shadow and a shaded lip, plus a real `bump` layer so the inset catches light (colour cubes: a shallow dish
  with a domed bead). Tiny hint word under each operation, the same words the tutorial uses: `∪ or`, `∩ and`, `− minus`,
  `′ not`, `V all`, `Λ none`. Colours = the cards' bead colours. Skins do not apply to On-Sets cubes (they always had one look).
- Table hook (2 lines, ONSETS-marked): a cube kind may bring a `bump(res)` layer (`atlasTex`, `buildMats`).

### Table, handling, moments
- The three white V / Λ cubes sit together on a small purple stitched felt plate at the right end of Resources ("V = every
  card · Λ = no card" on the wide table), dropping in one after another after the roll.
- The Goal gets a sewn label on the felt: "2 × 3 = 6" (under the cubes; to the right on the tall table), popped in once, and the
  brass frame glows once. The stacked cubes (multiply) read as before; the sum is now spelled out.
- Roller dumps the cup: `OS3D` passes `{ by }` to `T3.pour`. Roller = the Goal-setter (`OG.setter`): a creature's seat, `'me'`
  (kid, avatar on), `'mate'` (Tata), else the cup just tips. Seats mirror Equations: with two creatures on a wide table the
  first one to play stands on the kid's left (`G.seatFlip` in game.js); `seatFlip` is computed in `seatPeople()` and
  `OS3D.use(seat)` / `seatOf()` map through it, so game.js's `OS3D.use(osSeat(i))` still works unchanged.
- Big screen: `T3.setBoard('OSGOAL\n6\n2 × 3')` shows "THE GOAL  2 × 3 = 6 CARDS" (new compact branch in bigscreen.js).
- `payload().slots` is now a getter, so a window turned between wide and tall (T3 re-syncs the last payload) re-seats the
  Goal cubes and the V / Λ plate (before, they kept the old layout's coordinates).

## New / changed API
`T3.onsets` (additions): `tidy(done)`, `goal(text | null)`, `tray(bool)`, `restrSlots()`; `deal` / `highlight` / `form` unchanged
in signature. `OS3D` additions: none public; behaviour changes: `newShake()` tidies instead of clearing, `goalSet(v)` also paints the
Goal label, `rollAndDeal` passes `by`. Hooks the lead might want to call from game.js (optional, not needed): none.

## Performance (1280x800, stadium, medium tier, waiting for the Goal)
| | draw calls | triangles |
|---|---|---|
| before | 221 - 222 | 150.1k - 150.3k |
| after | 223 - 230 (the spread is the random crowd / weather) | 151.7k |
At rest the cards are 3 draw calls (the glow mesh hides when nothing is lifted; it was always drawn before), +1 for the V / Λ plate,
+1 after a Goal is set (label). Lifted: +1 (glow). The render loop idles: 0 renders in 3 s after a deal, 0 after un-highlighting.

## Verified / not verified
Verified (own tab, rAF shim, pictures from the canvas): seat view and close-ups of cards, cubes, plate, Goal label; deal mid-flight
(deck, flip, landing); tidy; lift + rim + label; replay with skip by tap; deal skipped by tap; tall (390 wide) and wide layouts; patterns +
letters live switch; calm path (this machine reports reduced motion: grow-in-place deal, tidy 0.66 s); low tier (217 calls); the kid, a
creature and Tata dumping the cup; two creatures with the seat mirror (the first one to play, on the left, dumped); an Equations match
after On-Sets (Equations zones, 24 cubes in their colours, handlers restored); `node` tests above.
Not verified: real iPad / phone frame cost, Safari, sound by ear (`Snd.card` does not exist yet in sound.js; the code falls back to
`Snd.click`), a real finger tap on the canvas, the other venues, high-contrast palette on the new cube faces.
The offline file list (`precache-manifest.js`) needs rebuilding after merge (`node tools/build-precache.js`): two files changed hash.
