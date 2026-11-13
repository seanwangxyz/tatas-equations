# UI round 9: one hand for the 2D screens

Owner brief: "freelance and be creative with motion/graphics/sounds". This part: menus, pop-ups, results, UI motion.
Rule kept everywhere: a transition plays once (150-400 ms, eased), then the screen is still. Nothing loops.

## Audit (1280x800, 1024x768, 390x844)

Top findings:
1. **Results pop-ups taller than the screen.** End of shake at 1280x800: scores, XP and the Next button were below
   the fold; plain text lines, solutions stacked one under another.
2. **Mixed icon language.** Emoji (💡 🎲 👹 🌟 👑 ⚖️ ✔) next to the line icons from `ico()` in headings, tabs and cards.
3. **On/off settings looked like ordinary buttons** ("✔ On" green / "Off" white) in a 65-row list with no folding.
4. **Creature cards had no league identity**; tip/likes lines as centred grey text of uneven height; the Play screen
   overflowed sideways at 390 px (grid columns could not shrink below their content).
5. **Motion was inconsistent**: screens rose and scaled, pop-ups popped from scale 0 with an overshoot, toasts
   bounced in; pop-ups vanished instantly on close.
6. Secondary match buttons (Hint, No Goal possible, Judge) had the same weight as Now!/Impossible!.
7. First paint: the splash is plain HTML and paints before the scripts; fonts are local with `font-display:swap`
   (a short swap is possible on a cold start). Left as is (see "Left").

## What changed

- `css/style.css`
  - Tokens in `:root`: `--ease`, `--t-fast/--t/--t-slow`, spacing `--sp1..5`, type `--fs-s/--fs/--fs-l`, league colours
    `--lg1..3`, `--soft`. Screen, pop-up and toast entrances now use them (no overshoot).
  - "ROUND 9 DESIGN LAYER" block at the end: stagger, pop-up open/close/fresh staging, quiet secondary buttons,
    results cards (`.rc*`), shared `.score-line` restyle (Team-up, Tournament, On-Sets and online results follow it),
    Play screen league bands and card lines, Settings folding groups and switches (`.btn.sw`), match side column
    (primary buttons full width, secondary buttons in two columns, emotes at the bottom), calm/reduced-motion cuts.
- `js/ui.js`
  - New icons: `crown`, `scale`, `flame`, `chev`.
  - `Motion` (end of file): `Motion.stagger(screen)` (called from `go()` when the screen changes; marks list items
    `data-st`, ~0.8 s, never on re-renders), `Motion.countUp(root)` for `[data-count]`/`data-from` (with a timer
    fallback so a hidden tab still shows the real numbers), and a wrap of `modal` / `closeModal` after all scripts load:
    a new pop-up stages its parts once (`.fresh`, a tap finishes everything at once), closing fades in 150 ms
    (`.leaving`, without the `on` class, so code that checks `#modal.on` is unaffected).
  - `setOpen` remembers which Settings groups are open; a Settings jump button opens its group first.
- `js/game.js` (marked RESULTS)
  - `solHTML` returns a small Solution card (cubes, what to fix, Explain button). New helpers `rcFace`, `rcSide`,
    `rcXP`, `rcLight`.
  - End of shake: card with Shake n of m + Goal chips, one tile per player (the creature's portrait; the kid's own shirt
    in his kit colours with his number), totals and "+n this shake" counting up once, the replay slot, the lines,
    Solutions and "Another way" side by side, XP as chips, a sticky main button.
  - End of match: two tiles with VS (winner gets the gold edge and a cup), the creature's line in a bubble, next
    opponent, XP, Season line, Career boss line, Player of the Match, Pip's tip slot, Cup rows / Play again + Menu,
    all inside one `.rc` card. A loss gets the calm blue header ("Good game!") and "Best effort" card, never shame.
    Only HTML-building lines were touched (plus `rcTone`); FX, Rivals, Trio, fireworks and the Review call are as before.
- `js/screens.js` (marked ROUND 9) `renderSetup`: league dots and colour bands, icon lines for Tip/Likes, crown/scale
  icons, "Shakes per match" in a footer bar. `renderSettings`: jump row full width, "Name your creatures", "Move
  progress" and "Parent corner" fold (closed by default), every on/off button (also the ones other files add) becomes a
  switch (`role="switch"`, `aria-checked`), same acts.

## Left / not done

- Level-up, badge and card ceremonies are staged by the generic pop-up staging (ribbon header, parts in turn, tap to
  finish), but their markup lives in `js/progress.js` / `js/cards.js` (not mine). Suggested snippet for
  `drainQueue` in progress.js: give the level-up `<h2>` the class `hero` so it gets the ribbon like the others.
- First paint: an early class would need a tag in `<head>` (index.html, not mine). Optional snippet:
  `<script>document.documentElement.classList.add('js-wait');setTimeout(function(){document.documentElement.classList.remove('js-wait')},900)</script>`
  plus a fade rule; I did not add it, the splash is already stable.
- On-Sets / Tournament / Team-up results still build their own markup; they inherit the new `.score-line`, `.xplist`
  and staging, not the tiles. `js/onsets/game.js` and `js/tourney.js` could reuse `rcSide()` later.
- Not checked: the 3D side column at Large/XL text in a real match (CSS falls back to one column at ts-l/ts-xl).

## How it loads

No new files: everything is in `css/style.css`, `js/ui.js`, `js/game.js`, `js/screens.js`. No index.html change needed.
