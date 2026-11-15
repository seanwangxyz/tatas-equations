# People in 3D (helper "people3d")

Branch: `worktree-agent-a901ecef02651fb2f` (fast-forwarded onto main `f37efa3` first, so it has the newer
people-data.js with highpony / spacebuns / halfup / curtain, clips / scrunchie, gems and streaks).

## What was built

The human rig in `js/three/creatures/kid.js` (buildHuman) can now draw every avatar that `People.clean()` allows, and
`js/three/creatures/people.js` turns an avatar into dims + look and builds the figure.

- **Bodies** (people.js `BODY`): `kid-s` (smaller, shorter legs and arms, head big for the body, rounder cheeks, bigger
  eyes), `kid` (= `KID` itself), `teen` (between kid and grown-up, slimmer face with a hint of chin), `adult-a` (slim
  grown-up: narrower soft-shouldered torso profile, no muscle bumps, slim arms and legs, oval face with a soft jaw and
  slightly bigger eyes; clearly not Tata), `adult-b` (= `TATA` itself). Every dims object is a full copy of KID / TATA with
  its own values, so every field kid.js / player.js / poses.js read is present. SH_Y and NECK_Y follow torsoY, TOP /
  FOOT / HIP_LOW are derived the way grownup.js does it (TOP uses 1.1 x head height for kid bodies, 1.27 for grown-ups).
- **Height** -1 / 0 / 1: about 6 % of the whole height, mostly in the legs, a little in the torso, arms 80 % of the leg
  change, widths 25 %; the head keeps its size. Cached per body+height (profileOf caches by object identity).
- **Tall hair raises TOP** (afro, bun, space buns, high ponytail, spiky) so seats and framing leave room.
- **Hair**: all 22 ids. New shells: buzz, side, thin, bald (no shell), coils, afro, bob, plus centre-part / sleek-pulled-
  back shells for the tied styles. New pieces (rigid, on the head): ponytail tube (low), high ponytail (out and over
  behind the head), pigtail bunches, two braids (alternating lobes) down the back beside the number, buns (one on the
  crown, two high = space buns, a small knot for half-up), and a long hanging slab (wavy, curtain, halfup) that ends just
  above the name on the back and at shoulder height at the sides, pushed out so it never cuts into the shirt.
- **Streaks** (`avatar.streaks` hex): painted through the hair's vertex colours (two face-framing locks + a few thin
  ribbons; along tubes and slabs too). Exact in linear light, follows hair colour changes. Tata's own lighter locks
  (`look.streaks`) are kept for his exact look only.
- **Skin**: any hex. Derived per skin: cheeks are a flush of the skin itself (browner and subtler on deep skin, none when
  `cheeks: false`), brows a shade darker than the hair and pushed away from the skin's lightness when they would vanish
  (white hair on light skin, black on dark), a deeper mouth interior on deep skin so a closed smile still reads, freckles a
  shade deeper than the skin. Lids, nose, hands, knees and the V-neck inside all use the skin colour as before.
- **Face**: eye colour; `lashes` (a dark lash line on each upper lid + three longer lashes at the outer corner, children
  of the lid so they follow blinks; kid bodies with lashes also get 8 % bigger, rounder, more open eyes - the "cute"
  look); `glasses` round / square (thin tube frames, clear lenses, a bridge, arms back over the temples to the ears,
  placed from the face's own eye positions so they fit every head); `beard` stubble (the old decal, dots in the hair
  colour), moustache, goatee, full beard (a shell over the jaw ear to ear with the mouth left clear), all in the hair
  colour; `freckles`; `gems` (three tiny sparkly stones under each eye).
- **Accessories** (`acc` in `accCol`): bow (on the tie of a ponytail / pigtails / bun / braid ends when there is one,
  otherwise on the side of the head), band (an Alice band laid over the outside of the hair), clips (five butterfly
  clips in two shades round the front and sides), scrunchie (on every tie; on the left wrist when the style has none),
  cap (six-panel crown, button, curved peak; the hair under it is pressed flat and eased out below the rim, spikes are
  dropped, ponytails come out the back). Placed by a ray onto the actual hair surface.
- **Dev gallery**: `tools/people-gallery.html` + `tools/people-gallery.js`. Buttons per section (today, bodies,
  heights, hair-kid, hair-adult, hair-teen, hair-colors, skins, skin-tones, glasses, beards, acc, examples, cute), tick
  "heads close up". Renders on demand only (no loop), preserveDrawingBuffer. From the console:
  `gallery.render('cute', { head: true, views: ['front','q','side','back'], el: 0.5 })` returns a JPEG data URL; each
  label shows the figure's triangle count. The examples section has the four asked for plus the two "cute" girls (girl
  of 9: high ponytail, scrunchie, face gems, lashes; girl of 6: space buns, butterfly clips, pink streaks, lashes).

## Exact API (people.js)

```js
buildPerson({ avatar, kit, num, name, front }) -> model   // same interface as buildHuman (+ below)
  model.avatar                 // the clean avatar it was built from
  model.setAvatar(avatar)      // true: applied in place (only colours changed: skin, hair, eyes, glassCol, accCol,
                               //   streak colour or streaks on/off); false: shape changed -> call buildPerson again
  model.recolor(look)          // (kid.js) the in-place colour change setAvatar uses
personDims(avatar) -> dims     // KID / TATA themselves for kid / adult-b at height 0 with ordinary hair
personLook(avatar) -> look     // People.DEFAULT -> exactly KID_LOOK values, People.GROWN -> exactly TATA_LOOK values
personKey(avatar) -> string    // People.pack(clean avatar): changes on every visible change (colours too), so a caller
                               //   that only compares keys is always right; setAvatar can spare rebuilds for colours
personAdult(avatar) -> bool    // adult-a / adult-b
```

New optional look fields read by buildHuman (all absent / off for the kid and Tata): `beard`, `stubbleCol`, `mouthCol`,
`highlight` (streak colour), `glasses`, `glassCol`, `freckles`, `lashes`, `gems`, `acc`, `accCol`, `eyeK`; `cheeks: null`
means no cheeks. New hair style ids are added to kid.js `HAIR_STYLES` (so `model.setHair(col, 'afro')` works too).
Small fix: `setHair(col)` without a style change now also recolours the hair shell (it used to recolour only the spikes'
material), and the beard.

## Unchanged figures (checked)

`buildKid()` / `buildTata()` with today's defaults render pixel-identical to before my changes (JPEG diff 0 on full
figures and head close-ups). `buildPerson(People.DEFAULT)` matches `buildKid` and `buildPerson(People.GROWN)` matches
`buildTata` (block-aligned head close-ups: mean diff 0.0003 / 0.0005 of 255, max 1 / 6 = JPEG noise). The placeholder
version lost Tata's lighter strands, brows and iris size; those are back.

## Contract notes / things I could not or did not change

- `People.clean()` gives a missing `beard` the GROWN default (stubble) for both grown-up bodies, so an `adult-a` made
  without saying `beard: 'none'` gets stubble. That is the data file's rule, not the rig's; the maker should set beard
  explicitly (or the default could become 'none' for adult-a in people-data.js).
- Beards, gems etc. are drawn on any body if the avatar asks (the data allows a beard on a kid); the maker decides what
  to offer.
- Nothing in js/people-data.js, player.js, kit.js or index.html was touched. Nothing calls buildPerson in the game yet
  (player.js wiring is the other helper's); the game page loads with no console errors.

## How each option was checked (gallery pictures, saved as pa_*.jpg)

- Bodies at height 0, front / 3/4 / side / back; all 15 body x height combos front and side.
- All 22 hair styles on kid (heads front, 3/4, side, back), on adult-a / adult-b alternating (heads and full figures
  3/4 and back), on kid-s / teen (front and back). Long styles checked from the back against the name and number:
  wavy / curtain / halfup end at the top of the name; braids frame the name and number; ponytails end above the name.
- Hair colours: all 16 (dark to white, bright colours) seen across the hair sections (grey, silver, white included).
- Skin: light / medium / dark rows on kid, adult-a, adult-b (heads front and 3/4) and all 10 tones (front). Deep skin:
  brows and mouth were weak at first; the mouth interior is now much darker on deep skin; dark brows on the darkest
  skin are still subtle (they are geometry, so they keep a shading edge).
- Glasses round / square, five frame colours, on kid, kid-s, teen, adult-a (bob), adult-b, bald dark-skinned: front,
  3/4, side, back.
- Beards: none, stubble, moustache, goatee, full beard, beard on deep skin, goatee on a teen: front, 3/4, side, back.
- Accessories: bow / band / cap on swept, ponytail, afro, long; clips on space buns; scrunchie on high ponytail,
  pigtails and the wrist (bob); front, 3/4, back, plus a seat-like high camera (el 0.5) from behind.
- Freckles, lashes, gems: seen front and 3/4 on the examples and the cute section.
- setAvatar: a recoloured figure (skin light->dark, hair, eyes, streaks, glasses and accessory colours, Tata -> deeper
  skin and grey hair) renders the same as a fresh build; a style change returns false.
- Tests: engine, explain, rivals, account, parent, onsets, voice, missions, why (and people) all pass.

## Known weak spots

- The hanging long-hair slab has squarish front corners at the shoulders and can touch the shoulder balls when the arms
  are raised high; it is rigid on the head, so a big head turn swings it through the shoulder a little.
- From straight behind, a black high ponytail is hard to tell from the black head behind it (fine from 3/4 and above).
- Streaks are bold on very dark hair (that is the look asked for, but there is no "subtle" option).
- The headband is a strip laid on ray hits; on very lumpy hair (curly, afro) it can dip into a lock in places.
- The full beard's top edge is a visible step (cartoon, intentional-ish); the moustache is a lifted strip, thin from the
  side.
- Glasses arms pass through long side hair (bob, wavy) rather than under it.
- The cap is one shape for every head (scaled by the head surface); on an afro it squashes the hair a lot.
- adult-a reads as a slim grown-up of either sex; its face differs from Tata's (rounder jaw, no long chin, bigger eyes)
  but the difference is moderate at table distance; lashes / hair do most of the work.

## Triangles (renderer geometry count, one figure)

| figure | before | after |
|---|---|---|
| kid (DEFAULT / buildKid) | 49,616 | 49,616 |
| Tata (GROWN / buildTata) | 53,720 | 53,720 |
| kid-s, teen, adult-a, plain hair | - | 49,616 |
| kid, braids + round glasses + clips + lashes + gems + freckles | - | 58,744 (1.18x) |
| adult-b, half-up + square glasses + full beard + bow | - | 60,348 (1.12x Tata) |
| bald grown-up | - | 36,408 |

The hair shell (about 16.5k triangles) was already the biggest part and is unchanged; new pieces add 0.5k to 6k.
Build cost: the accessory placement casts a few dozen rays at the hair shell once at build time; nothing per frame.
