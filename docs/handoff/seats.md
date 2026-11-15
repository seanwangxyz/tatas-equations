# Seats: any avatar, three humans at the table (js/three/player.js)

Branch: `worktree-agent-a17798b4eae7b5cbe` (based on main at `cedfa29`, the People contract commit).
Files changed: `js/three/player.js` only. `js/three/poses.js` needed nothing (its poses are written in the kid's
units and mapped to any body by `mapArm`, which already works for any dims). No other file touched.

## API (new or changed)

Every person spec (`T3.playerSet`, `T3.mate`, `T3.mate2`, `T3.playerPortrait`) is
`{ avatar, who, kit, name, number }` (+ `seat`, `player` for the mates).

### Who stands there
| spec | built with | size from | grown-up reactions / stride |
|---|---|---|---|
| `o.avatar` given | `buildPerson({ avatar, kit, num, name, front })` | `personDims(avatar)` | `personAdult(avatar)` |
| no `o.avatar`, no `o.who`, the device's player (`playerSet`, `playerPortrait`) | the save's own avatar `People.own()` through `buildPerson` | as above | as above |
| `o.who` without `o.avatar` | today's `buildHuman` kid / Tata, exactly as before | KID / TATA | `who === 'tata'` |

- The avatar is cleaned with `People.clean`. The figure is rebuilt when `personKey(avatar)` changes (or kid <-> Tata
  for the old path); kit / name / number changes only call `setKit` (no rebuild).
- `T3.playerSet(null)` = back to the save's own avatar. `T3.playerRefresh()` re-reads the save including `S.avatar`
  (only matters while the device's player has no `who` / `avatar` override).
- Today's callers (`game.js`, `online.js`, `onsets/view3d.js`) always pass `who`, so they get exactly today's figures
  until the lead changes them to pass `avatar`.
- Note: the kit designer calls `playerPortrait({ kit })` (no who): that now shows the save's own avatar (on an old
  save the kid, or the grown-up if Settings says grown-up), wearing the save's kit with the override on top.

### Kit, name, number per role (rule from the lead)
- `o.kit` a full kit object (has `jersey`): used as it is, every role.
- With `o.avatar` and `o.kit` in the saved shape (may be partial or `{}`): `kitFromSave({ ...KIT_DEFAULT, ...o.kit })`.
  Never filled from this save's kit.
- With `o.avatar` and no `o.kit`: the device's player (`playerSet`, `playerPortrait`) wears the save's kit
  (`savedKit(S)`: home / away / third); a mate wears `KIT_DEFAULT` (a grown-up: `TATA_KIT`, the yellow one).
- The save's own avatar (no avatar, no who): `o.kit` merged over `savedKit(S)` (it is this save's player).
- Name: `o.name` if given. Else the device's player: `S.backName` if set, otherwise `'TYSON W.'` for the save's own
  avatar and `S.name` for an explicit avatar; a mate: `'Tata'` for a grown-up, `''` for a kid.
- Number: `o.number`; else the device's player `S.jersey || '7'`; a mate `'17'` (grown-up) / `'7'` (kid).
- Old `who` path: unchanged (kid: save kit + override, `S.backName`/'TYSON W.', `S.jersey`; Tata: yellow, 'Tata', 17).

### Seats
`T3.mate(o)` / `T3.mate2(o)`: `o.seat`:
- `'left'`: beside the left end of the table on the near side (today's search). Two people at 'left' keep clear of
  each other (the second one searches around the first).
- `'far'`: across the table in the middle (today's spot, z = -D/2 - 1.95).
- `'farL'` / `'farR'`: across the table at x = -/+ 4.6 (wide) or -/+ 2.9 (tall) (`FAR.x`), turned 0.18 rad toward the
  middle. These are roughly where creatures.js puts its two creatures (PAIR), but symmetric: humans are slimmer.
- All far seats are hidden while any creature is at the table (`T3.creatureVisible(0) || T3.creatureVisible(1)`),
  and shown again when it leaves (checked every frame, as today for 'far').
- `o.player`: index in `G.players` this person plays for (stance: study / wait, who to look at). Default: `mate` = the
  first non-AI player after 0, `mate2` = the second one (Team-up: player 0, as today).

### Third human
- `T3.mate2(o | null)`, `T3.mate2Mood(name, opts)`, `T3.mate2Move(id, zone, done, opts)` (same contract as
  `T3.mateMove`: `done()` exactly once). Included in `T3.playerState().mate2` (with `seat`), in `T3.playerModels().mate2`,
  `T3.playerMoveFinish()`, `T3.playerMoving()`, `T3.playerScript('mate2', ...)`, `T3.playerScripted('mate2')`.
- `ctx.grips.human('mate2')` returns his hands for the cup dump / toss (table.js needs the patch below to ask for it).
- `T3.playerState()` entries also carry `adult`, `avatar` (its personKey) and `player`.
- No-3D stubs exist for `mate2`, `mate2Mood`, `mate2Move`.

### Behaviour that used to assume one mate
- Walking (moves, cup walks, the walk back): a creature, or anyone at a far seat, makes the whole far side hard for
  the near people (as today). People at far seats go round each other and round the near people on the outside (soft).
- High five after the device player's celebration: whoever is at the 'left' seat (first of mate, mate2).
- Celebration run-outs ('slide' / 'plane'): the device player uses the right side when anyone is at 'left'.
- Looking while waiting: at the person whose go it is (any of the three); with one other person, him (as today).
- Far-seat head lift (`FAR.look`) and the faster run (x1.3) apply to any far seat.

## Size rule
All dims are in the kid's unit system, so the same scale `s` gives believable relative heights.
- `ref` = the scale today's kid gets at the near seat (his head just touches the line of sight over the near rim; at
  most 1.6). `fit(A)` = the same search for A's body.
- Near seat (device's player): `s = min(fit(me), ref * sqrt(KID_H / H(me)))`. A grown-up is limited by fit (as Tata
  is today). Someone shorter than the kid gets a little more than `ref` (half way, in proportion, between "same scale
  as the kid" and "head at the rim like the kid"): at the same scale a 6-year-old sank below the bottom of the picture
  (the camera fit may only back off 40%), with the full compensation she looked as tall as the kid.
- 'left' seat: `U = min(ref, near player's s)` (today: the device player's scale), with today's 1 / 0.9 / 0.8 search.
- Far seats: `FAR.s` (1.35, today's). Someone whose upper chest (`FAR.chest` = 0.55 x shoulder height) would be hidden
  by the far rim at 1.35 first steps back (up to `FAR.back` = 1.6 further from the rim: the sight line drops behind it),
  and only then is drawn bigger (at most `FAR.max` = 1.6). Grown-ups stay at 1.35, so the camera framing is today's.
- Avatars' allowed scale range at the near seat = the world heights today's kid and Tata span between them.
- With no avatar anywhere every number is today's (checked: pvp kid 1.6 / far Tata 1.35 at z 9.28 / -8.75; p3 left
  seat result identical to the main branch file on the same screen).

## Patches needed in files I do not own

1. Cup dump / reroll toss by the third human. Find (exactly once in `js/three/table.js`):
   ```
         if (by === 'me' || by === 'mate') return g.human ? g.human(by) : null;
   ```
   Replace with:
   ```
         if (by === 'me' || by === 'mate' || by === 'mate2') return g.human ? g.human(by) : null;
   ```
   (Tested with this patch applied locally: `T3.pourBy('mate2'); T3.pour(G.cubes, cb)` - the aunt at farR picked up
   the cup and dumped it, `cb` fired. The patch was then reverted.) The comments there listing `'me' | 'mate'` may
   gain `| 'mate2'`.
2. game.js / online.js / onsets (the lead's wiring, not done here): pass `avatar` (and the member's kit via
   `People.kitOf(m)`, name, `jersey` as number) to `T3.playerSet` / `T3.mate` / `T3.mate2`; for p3 with no creature use
   `T3.mate({ ..., seat: 'farL' })` + `T3.mate2({ ..., seat: 'farR' })` (the 'left' seat often has no room on screen:
   on 1024x768, 1180x820 and the phone it did not fit, as today); `avatarMoveFn` should return `T3.mate2Move` for the
   third human and `rollerOf` should map it to `'mate2'`; `mateMood(...)` calls that cheer / clap may add `T3.mate2Mood`.
   Mind `G.seatFlip`-style ordering if clockwise play matters: farL is on the device player's left.

## How it was checked
Static server on 3472, own tab, frames rendered with `T3._frame` and saved as pictures. To see different body sizes
before the full people.js exists, a TEST-ONLY local people.js scaled KID / TATA per body (kid-s 0.8, teen 1.1,
adult-a 0.97, height +-5%); it was reverted and never committed.
- Seen in pictures: today's pvp (kid near, Tata far) unchanged; avatar uncle near + kid far; three humans (farL / farR)
  on iPad landscape (1180x820, wide) and phone (390x844, tall) with 8yo / 6yo / 9yo / aunt / uncle in several
  combinations (the 6-year-old is clearly smaller than a grown-up beside her, every face and at least the collar /
  shoulders of every shirt shows, the near player's head and shoulders show); the 'left' seat with a grown-up and with
  a 6-year-old (1500x700); the aunt at farR doing the cup dump; the aunt walking round the table end; portraits:
  a 5x5 sheet (6yo, 8yo, 9yo, aunt, uncle x front, face, {yaw:-0.22}, back, {yaw:0.6, close}) and today's kit-designer /
  `{who}` portraits.
- By numbers: done() exactly once for playerMove / mateMove / mate2Move; mate2 (farR) carrying to Required passed
  behind mate (farL) at 2.54 apart (soft radius 2.58); near player never crossed the far side; far seats hidden with two
  creatures (ai3); `S.avatar` + `playerRefresh` swaps the figure; high five from the 'left' mate starts after the
  celebration; portrait times ~70-100 ms (face), ~150-270 ms (full body, first build ~350-450 ms).
- All tests pass (engine 948, explain 4558, rivals 2110, account 609, parent 75, onsets 152, voice 61, missions 603,
  why 4934).

## Known weak spots
- Sizes were tuned with my scaled stand-in bodies; the real people.js bodies (different head sizes, hair volumes) may
  need `FAR.chest`, `FAR.back`, `FAR.max` or the near-seat square-root compensation re-tuned. Hair that sticks out far
  above `dims.TOP` is only padded by 0.25 x s in the far-seat camera points.
- A raised far little kid (stepped back and at 1.6) shows head and collar only on the wide layout when the camera is
  low; the number on her shirt front does not show.
- A 6-year-old at the near seat shows head, shoulders and the top of the shirt, not the number on her back (the kid
  shows it). A bigger compensation would make her as tall as the kid.
- The 'left' seat search is today's: it may shrink the person to 0.8 to fit and allows an over-the-shoulder crop at
  the screen edge, so a grown-up there can look closer to a kid's height than he is.
- The near-seat scale clamp is reached on most screens (kid 1.6, grown-up 1.4 / world-height equivalent), so a slimmer
  shorter grown-up (adult-a, height -1) at the near seat looks as tall as Tata.
- Two humans carrying at the same time is not prevented (the game never does it).
- Portrait framing of avatars measures the skinned model (`Box3.setFromObject(root, true)`) once per body and angle;
  the old `who` portraits keep today's fixed framing.
