# Handoff: the cubes and the table (agent `craft`, free creative round)

Files changed: `js/three/table.js` (blocks marked CRAFT), `js/three/onsets3d.js` (card drawing and meshes only),
`css/style.css` (the four `.skin-candy` rules only), this note. A11Y, ONSETS, BONUS, VARI3D and COLLECT blocks are
untouched and still work (checked: colour-helper patterns and letters on the new skins, solid / dashed / dotted zone
edges, On-Sets dot shapes). `node tests/engine.test.js` 948 passed, `node tests/onsets.test.js` 152 passed.

## What changed (before -> after)

### The cubes
- **Geometry**: 6 even segments with pushed corners -> 8 segments spaced so 3 of them sweep each rounded edge in even
  15-degree steps (`CUBE_R` 0.15). Softer edges that catch a highlight, a flat face where the symbol is. 768 triangles a
  cube (was 432): about +8k triangles for 24 cubes.
- **Symbols pressed in**: a shaded lip along the inner top-left edge of every symbol, plus a `bumpMap` layer (medium and
  high) so the inset really catches the light. The firm outline and drop shadow are kept: legibility first.
- **Five skins with character** (`SKINMAT`, `drawFace`, `faceLayer`):
  - classic: glossy toy plastic (the painted sticker-like sheen band is gone; the clear coat does it for real).
  - candy: boiled-sweet pastel with a soft inner light (a glow layer, so the shaded sides never go muddy) and **dark
    symbols** (was white on pastel, about 1.5:1; now 4.6:1 or better on every stripe). Same fix in the flat CSS cubes.
  - lava: dark basalt, glowing veins (an emissive layer) kept to the edges so the cream symbol stays clear, a band in
    the cube's colour.
  - galaxy: a nebula in the cube's own colour (before all colours were the same purple), a few glittering stars.
  - gold: real metal where it is gold (a metalness / roughness map), an enamel band in the cube's colour and an
    engraved dark symbol.
- Fixed an old bug: in `buildMats` a `// (BONUS ...)` comment swallowed `roughness` and `metalness`, so no skin ever
  got its own finish.
- Slot rows are tidier: the random hand-placed turn is 0.05 rad wide (was 0.12).
- The bonus dice and the On-Sets cube kinds use the classic finish (they bring their own faces; no extra layers).

### Handling
- **Lifted**: its contact shadow draws in and fades as it rises (it used to grow).
- **Set down**: a tiny squash (a little smaller than before) and ONE soft ring on the cloth in the zone's colour
  (Required green, Permitted blue, Forbidden rose, Goal / Resources warm white). Replaces the dust puff for zone moves;
  the pour keeps its puffs and sparks.
- **Tidy slots**: re-slotting eases out with a 3% overshoot and settles (320 ms, was a 220 ms in-out).
- **"No" wobble**: a cube dropped on (or tapped toward) a zone it cannot go to turns side to side twice, smaller each
  time, and is still (460 ms, once). `T3.nope(id)` lets other modules ask for it.
- **The cup**: stitched leather (two rows of saddle stitching), a rolled leather lip, a dark-red felt lining (what you
  see as it tips), two thin brass bands and a brass "=" medallion facing the seat. Physics untouched.
- **End of shake**: the cubes left on the table sweep back into the cup (nearest first, each on an arc, turning over
  and a little smaller as they drop in, with soft ticks), then the cup tips as before. The pour's own clock simply
  starts later (`pour.lag`, about 0.6 to 0.9 s); the first pour of a match has no sweep. Hidden tab / fast pour: skipped.
  Checked twice: 0 cubes off the table, `settleInside` never needed.

### The table
- **Cloth**: deeper colour (the felt's sheen was lerped 45% to white and washed it out; now 20%), a fine nap.
- **Sewn zones**: each area pressed in a little (soft inner shadow) with a faint tint of its colour; Resources is a
  deeper tray. Outlines are raised cords with a satin-stitch texture; the dash pattern (solid / dashed / dotted with the
  colour helpers) is kept exactly, because the texture is drawn source-atop onto the strokes themselves.
- **Label patches**: every label sits on a dark sewn patch with a rim in the zone's colour and a stitched edge, white
  text a little larger (0.5 of a unit, shrinks to fit; follows the A11Y text size). Much easier to read at seat distance.
- **Goal plinth**: a low brass frame round the Goal (1 extra draw call). It warms up and fades back once when a Goal
  is set (1.4 s), softer with "Reduce flashing".

### Moments (all one-shot, nothing loops)
- **Goal set**: the plinth glows once (read from `T3.sync`: phase goal -> move with Goal tokens).
- **Now! / Impossible!** (`T3.fx('shake')`): one soft shock ring across the cloth (yellow for Now!, rose for
  Impossible!) and every resting cube hops 0.07 as the ring passes (lands back exactly). The camera nudge is smaller
  (0.18, was 0.28) and is left out with "Reduce flashing".
- **Correct Solution** (read from `T3.sync`: phase 'over' with `G.lastShake.sols[*].ok`): the used cubes warm up one
  by one in the order the expression is read, left to right, once. The player's own Solution first.
- **Tidy-up**: the sweep into the cup above.
- With `A11y.calm()` or prefers-reduced-motion: rings at about half strength, no hops, smaller wobble, softer glows.

### On-Sets cards (js/three/onsets3d.js)
- Dots 21% bigger in radius (0.2 of the card width, was 0.165), in the same 2 x 2 places on every card.
- Card stock: thicker (0.075, was 0.05) with a darker edge so the thickness reads, a faint linen grain and a fine
  printed frame.
- A soft contact shadow under every card (one more instanced mesh, On-Sets only); it pales and widens as a card lifts,
  and grows in with a card being dealt. The A11y shapes and letters (`a11yDot`) draw bigger with the dots.

## Performance (1280x800, side-column canvas 958x784, pixel ratio 1, stadium, waiting for the Goal)

| | draw calls | triangles | ms per render (30 renders, noisy machine) |
|---|---|---|---|
| before, high | 267 | 192k | 2.7 - 3.2 |
| after, high | 276 | 209k | 3.4 - 4.2 |
| before, low | 217 | 175k | 2.9 |
| after, low | 226 | 184k | 2.7 - 3.3 |

The +9 calls are mostly a different match scene (crowd, time of day); my measured share at rest is **+1 draw call**
(the plinth: 276 with it, 275 hidden). Rings, hops, glows and the sweep add nothing at rest (pooled, hidden). The
extra triangles: the cubes (+8k) and the plinth. The extra per-render cost is the cube shader (bump, clear coat,
optional glow / metalness maps) on high and medium; low keeps the colour map only. The render loop still idles: 11
drawn frames a second while waiting (the existing ambient breathing rate).

## For the sound helper (not done: js/sound.js is not mine)
These play existing sounds now; a dedicated sound would make each nicer:
- **Set-down ring**: currently `Snd.thunk()` (already there). A soft felt "tup" with a tiny high shimmer for the ring.
- **Sweep into the cup**: currently `Snd.diceHit(0.16)` every 55 ms or more as cubes drop in. A quiet "rattle into
  leather" (a few muffled clicks) would be better.
- **Plinth glow on Goal set**: plays during `Snd.chime()` already; a warm low brass "hum-ding" would suit it.
- **Shock ring**: plays during `Snd.slam()`; a soft low "whoomp" under it, never loud.
- **"No" wobble**: silent now. A tiny two-note "uh-uh" (descending), very soft.

## Hooks (new)
- `T3.nope(id)`: the "no" wobble on a cube.
- `T3._craft(cmd, arg)`: checks / debugging (`'ring' {x, z, css, size}`, `'shock' css`, `'glow' [ids]`, `'plinth'`;
  returns the live counts).

## Verified / not verified
Verified in Chrome (my own background tab, rAF shimmed, pictures rendered from the canvas): seat view and close-ups of
all five skins; A11Y patterns + letters on classic and galaxy; the zone edges with helpers on; the cloth, patches and
plinth in the wide (side column) and tall (390x844 phone) layouts; Goal-set plinth glow; shock ring and hops (cubes back
exactly where they were); Solution glow (emissive back to 0 after); the "no" wobble (back to the exact turn); the sweep
and the new cup during a pour (high and low quality, 0 cubes off the table, no console errors); On-Sets cards at the
seat and up close.
Not verified: real iPad / phone GPUs (frame cost there), Safari (canvas `filter: blur` for the bump layer and the card
shadow falls back to unblurred, which is fine), watching motion at a real 60 fps (judged from stills and numbers), the
other venues besides the stadium, high-contrast palette on the new skins (the code path is the same as before:
`A11y.faceCols`), and the browser here reports prefers-reduced-motion, so most motion was seen in "calm" strength and
checked at full strength by overriding the media query.
