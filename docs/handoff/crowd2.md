# Handoff from `crowd2`: the crowd as a character

Files: `js/three/crowd.js` (changed), `js/three/crowdstory.js` (new: what the fans know, what a moment means),
`js/three/crowdshow.js` (new: banners, card stunt, confetti cannons, phone lights), this note. Nothing else was touched.
Stadium and night stadium only (`style: 'fans'` without `o.teams`); the beach, volcano and anything passing `o.teams`
or `o.plain: true` get the first crowd exactly as before.

**No wiring needed.** Everything shows through the calls that already exist (`crowdSay` / `crowdReact` / `T3.crowd`,
Matchday's walk-out and trophy cheers, the replay's cheer). The few optional hook lines at the end only add moments.

## The resting tableau (still: nothing moves at rest)

- **Home end in his kit**: shirts, scarves, flags, beanies, seats from `S.kit.shirt` / `S.kit.trim`. Families' kids
  and some grown-ups wear a replica shirt with **his number** (`S.jersey`, a redrawn atlas cell).
- **Away corner** in the colours of the creature he is playing (`OPPONENTS[i].color`, made bolder; never the same as his
  kit): about 6% of the ground at tier 1 up to 12% at tier 5, at the right-hand end of the back stand and the corner of
  the right stand (visible from his seat beside the scoreboard). Kit, opponent, number or shirt name changing between
  matches **repaints in place** (instance colours, no rebuild), checked a few times a second while frames are drawn.
- **Groups**: families (a grown-up with kids), friends who came together (all in face paint, matching beanies, his
  number, or all with scarves), couples. Some fans hold **drinks**.
- **Brass band** (tier 2+): two short rows in the home part of the back stand, band jackets and tall hats in his
  colours, trumpets and a bass drum.
- **Standing fans** in the top rows (2 at tier 1 up to 6), and from tier 2 **a kid on a grown-up's shoulders**.
- **Stewards** in hi-vis (STEWARD on the back) on the grass in front of each stand, facing the fans (1-3 per stand).
- **TV camera platform** on the top row of the back stand, operator with headphones (opposite the scoreboard).
- **Home mascot "Cubey"**: an original big yellow cube head in his kit with his number, on the grass in front of the
  back stand (left of the table, never in front of a banner).
- **Empty seats**: gaps of 1-3 seats get a seat with nobody in it, so small grounds look like small grounds (tier 1:
  about 110 empty seats; tier 5: a few hundred spread out, from the people budget).
- **Hand-made banners** held up by two fans in the front rows: 2 at tier 1, 3, 4, 6, 8 at tier 5. Lines (original):
  `TYSON W. 7` (his shirt name from `backName()` and number), `GO TYSON GO!`, `WE ♥ MATHS`, `TYSON + GOALS = ♥`,
  `LUCKY NUMBER 7`, `SUM-BODY STOP HIM!`, `TATA ♥ TYSON`, `1 + 1 = WIN!` (first name = first word of the shirt name).
  Cream sheets with painted letters, or his shirt / trim colour. They arrive rolled up and **unfurl once** at the first
  reaction of each match.
- **Progress stories**: more fans, banners, band, standing fans, stewards and a bigger away corner as the tier grows;
  the card stunt from tier 3; **Spot the Fan characters he has found move to the front rows of the back stand** (in
  view from his seat); once a rivalry forms (`S.rivals[id].n >= 3`) the away fans hold their own banner
  (`OLLIE FAN CLUB`, from 6 matches `OLLIE'S CREW IS BACK!`, from 10 `OLD FRIENDS: OLLIE & TYSON`); no rivalry, no banner.

## Reactions with direction (one move each, then still)

`crowdstory.moment(kind, opts)` reads `G`, `Matchday.active()` and `T3.replayActive()`:

| Existing call | Moment | What the supporters do |
|---|---|---|
| `clap` (a cube moved) | move | a clap in **a different section each time** (the last three places are avoided) |
| `gasp` (challenge) | challenge | a gasp, then 80% **lean in and stay leaning in** (some hands clasped), still, until it is decided |
| `aww` (lost shake) | lost | a kind sigh (head down, never a boo), then 1.6 s later **an encouraging clap** from two sections and the away fans |
| `cheer` in the walk-out | kick-off | a cheer rippling from the home end; **scarves stretched above heads and held**; flags up |
| `cheer`/`ooh` after a Goal is set | goal | one or two sections cheer, rippling out; **flags go up and stay up for the rest of the shake** |
| `cheer` after a great shake | shake | the whole home end, rippling from a new place each time; away fans applaud; every other time **the card stunt** |
| same, Solution of 7+ symbols or 6+ points | brilliant | a bigger cheer, **one Mexican wave once round** (alternating direction), the card stunt |
| `cheer` + `wave` at a match win | win | everyone, the wave, **card stunt GOAL**, **confetti cannons** from the stand fronts, at dusk/night **phone lights on once (and staying lit)** |
| `cheer` in the trophy lift | trophy | as the win, card stunt shows a star |
| replay running (`T3.replayActive()`) | replay | **heads turn to the big screen** in a ripple (nearest first) and back when it ends; the cheer is from the section by the screen |
| anything else | plain | the first crowd's reaction, as before (`T3.fx('wave')` too) |

A new shake (G.shake changes) lowers the flags and ends any leaning; a new match puts everyone back in the plain
tableau and rolls the banners up again. Lean-in, flags, scarves, looking and phones are **stances**: one smooth move into
a new still pose (written into the rest copy), so the crowd is still while holding them.

Card stunt: the cards (one per seat, including empty ones) rise in one sweep, hold 3.3 s, go down; his number or a dice
cube on great shakes, GOAL on a win, a star on a trophy (3x5 pixel letters; grids under 5 rows show the cube). It uses
the top rows of the back stand (the upper tier at tier 5) beside the creature, away from the scoreboard: the front rows
hold the tunnel, the banners and the band.

## Accessibility and quality levels

- **prefers-reduced-motion** (and `S.set.calm`, which A11y maps onto that query): pose changes without travel. No hops,
  no ripple delays, no Mexican wave, no confetti cannons, banners appear unrolled, cards come up all at once, stances
  take 250 ms. Arms still go up, heads still turn: the crowd still answers.
- **A11y.calm()** ("Reduce flashing"): a third of the confetti. Phone lights are a steady glow (no flashing).
- **Quality**: crowd detail drops first as before (low: a third fewer people, plain boxes). Low also skips the Mexican
  wave and uses 60% of the reacting fans; confetti 300 / 550 / 850 pieces on low / medium / high.

## Performance (desktop Chrome, background tab, so read the medians; 1280x800, seat camera)

| Case | Draw calls (whole scene) | Triangles | ms per frame (render + GPU sync) | Crowd JS per frame |
|---|---|---|---|---|
| Tier 5 high, rest, before | 282 | 575 k | 12.3 | 0 |
| Tier 5 high, rest, after | 284 | 619 k | 10.9 | 0 (one time compare every 250 ms) |
| Tier 5 high, cheer + wave, before | 282 | 575 k | 17.5 | 2.0 median, 2.9 p90 |
| Tier 5 high (night), match win, after: cheer + Mexican wave + card stunt + confetti + phones | 216 at rest, up to 338 in one frame | 621 k | 9.7 rest, 11.4 busy | 1.0 median, 1.7 p90 |
| Tier 5 low, rest, before / after | 232 / 236 | 246 k / 276 k | 9.4 / 11-14 (noisy) | 0 |
| Tier 5 low, match win, after | 238 | 277 k | 11.2 | 0.1 median, 0.7 p90 |

- Crowd meshes: 18 before, 19 now (one more pool for the big rare props: standing legs, kid-on-shoulders legs, camera
  platform, drum, trumpets). Plus the banners (1 draw call, always) and, only while in use, the card stunt (1),
  confetti (1) and phone lights (1, stays on after a night win). Hidden displays cost nothing.
- Triangles: +44 k at tier 5 high (empty seats, the extras, banners), +30 k on low.
- One new shader program for the banners (the cards use the crowd's own material), one for the points.
- At rest step() still returns false and uploads nothing. After every reaction tried (each moment above, overlapping
  ones, the win with everything) a script checked that every instance matrix equals the rest copy (max difference 0),
  no reaction is pending and `busy()` is false: `currentCrowd().stillCheck()`.
- The "up to 338 calls in one frame" during the win is not the crowd (its displays add 3); it looks like the shadow
  map being redrawn while things move.

## Optional hook lines (js/game.js and js/online.js are not mine)

1. Applause after a shake in the two- and three-player modes (they have no crowd call, so a challenge's lean-in only
   ends at the next shake). `js/game.js`, in `endShake`, anchor `  else Snd.chime();` (the line right after
   `if (G.mode === 'ai' || G.mode === 'ai3' || ...`): replace with `  else { Snd.chime(); crowdSay('clap'); }`
2. Online challenges lean in too. `js/online.js`, anchor
   `board(ch.kind === 'now' ? 'NOW!' : 'IMPOSSIBLE!'); crowdSay('ooh');`: change `crowdSay('ooh')` to `crowdSay('gasp')`.

For checks: `import('/js/three/crowd.js').then(m => m.currentCrowd())` gives `stats()` (with `shows`: banners,
tifoCards, emptySeats, staff, band, standing, away), `stances()`, `stillCheck()`, `shows()`.

## Sounds wanted (for the sound helper; crowd-sfx.js is not mine)

- Scarves up at kick-off: a short swell of a wordless home "ohhh-oh" hum (not a real chant), fading as they hold.
- Banners unfurling: a soft cloth flap, two or three a beat apart.
- Card stunt: a quick paper riffle as the sweep passes, then a big friendly "whoa!" when the picture is complete.
- Mexican wave: a rising "whoooo" travelling left to right (or right to left) with the wave, about 3.8 s.
- Lean-in during a challenge: a hush (a low murmur dropping to near silence), released by the cheer or the sigh.
- Encouraging clap after a lost shake: a slower, warm rhythmic clap (never ironic), about 2 s.
- Confetti cannons: two or three soft "pomf" pops, then light paper patter.
- The brass band could play a short original 3-note fanfare at kick-off and on a win.

## Verified / not verified

- Verified in desktop Chrome (own tab, scripted): stadium tiers 1, 3, 4, 5; high, medium, low; day and night; the real
  walk-out path (scarves up, banners unroll); win, brilliant, shake, goal, challenge then aw, clap, replay look, new
  shake, new match; opponent change repaint (Ollie purple to Penny blue, rivalry banner on and off); found fans moved
  to the front rows; the reduced-motion path (the test browser reports it); stillness after each.
  `node tests/engine.test.js`: 948 passed (the first run had the known timing failures under load; the rerun passed).
- Seen in pictures: the tableau at tiers 1, 4 and 5, banners, band, camera platform, stewards, mascot, away corner,
  scarves held, heads turned, the card stunt from the pitch, phone lights at night.
- Not verified: a real iPad; the trophy lift itself (only its moment logic); the tall layout; beach, volcano and title
  crowds were only checked to build (they take the old path; the title's detached crowd shows its banners unrolled).
- Known limits: from his seat at tier 5 the upper tier is above the picture, so the card stunt shows in the walk-out,
  look-around and win camera views more than in the plain seat view; from pitch level the rows overlap and the
  picture reads best from higher up. Confetti is modest from the seat camera.
- Seen, not from this work: `Cannot read properties of undefined (reading 'isReady')` in three's `checkMaterialsReady`
  on match start; it happens with the original crowd.js too (checked by swapping it back).
