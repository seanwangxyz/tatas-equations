# Handoff from `arenas`: three new venues (night, beach, volcano)

Built in `js/three/environment.js`, `js/three/stadium.js` and new `js/three/arenas/` (common.js, beach.js, volcano.js).
Ids: `night` (stadium under floodlights), `beach` (beach-soccer pitch), `volcano` (Monster League crater).
Their `THEMES` entries (felt, rim, lights, fog, sky) are in `environment.js`, so `table.js` already picks them up.

Nothing below is committed: these are the edits to files I do not own. Without them the three venues
still render (static) when `S.cos.mat` is set, but they are not in the picker, have no scoreboard
text, and `T3.fx('wave' | 'flash')` returns false for them.

## 1. `js/three/table.js` (owner: `stage`): two lines in `buildTable()`

Replace

```js
    var env = name === 'stadium' ? buildStadium(W, D, aniso, layoutName, function () { return qual; }) : buildEnvironment(name, W, D, aniso); tableGroup.add(env.group);
    if (name === 'stadium') { envFx = env; env.setBoard(boardText); }
```

with

```js
    var env = name === 'stadium' ? buildStadium(W, D, aniso, layoutName, function () { return qual; }) : buildEnvironment(name, W, D, aniso, layoutName, function () { return qual; }); tableGroup.add(env.group);
    if (env.setBoard) { envFx = env; env.setBoard(boardText); }
```

That is all `setBoard`, `wave`, `flash`, `step` and `dispose` need: the venue objects have the same
shape as the stadium's. The old mats (felt/space/jungle/ocean) return no `setBoard`, so they behave
exactly as before. I tested with this exact change applied, then reverted it.

## 2. `js/config.js`: `MATS` entries

Append to the `MATS` array (levels are a suggestion: night early as a "stadium variant", the Monster
League's home ground later):

```js
{ id: 'night', name: 'Night Match', lvl: 3, sw: 'linear-gradient(#1f3a6b,#050a1e)' },
{ id: 'beach', name: 'Beach Soccer', lvl: 5, sw: 'linear-gradient(#5fd6d0,#ecd3a0)' },
{ id: 'volcano', name: 'Volcano Crater', lvl: 7, sw: 'linear-gradient(#ff8a1f,#4f3a9a)' }
```

## 3. Ambience (`js/game.js` line ~46, and optionally `js/sound.js`)

`game.js` picks `Snd.ambience(S.cos.mat === 'stadium' ? 'stadium' : 'room')`. All three new venues
have a crowd, so they should use the stadium bed:

```js
if (Snd.ambience) Snd.ambience(['stadium', 'night', 'beach', 'volcano'].indexOf(S.cos.mat) >= 0 ? 'stadium' : 'room');
```

(`Snd.ambience` only knows `'stadium' | 'room' | 'off'`. If the sound owner wants a beach bed later,
the natural kind name is `'beach'` (soft surf noise under a thinner crowd), but `'stadium'` is fine.)

## 4. For `stage` (lighting contract)

- Each new venue adds exactly one `DirectionalLight` with `userData.key = true`; the venue object also
  exposes it as `env.key`. `castShadow` is false; its shadow camera already covers the table
  (`±(max(W, D)/2 + 4)`), bias/normalBias are set like the table sun's. Its target is the default (world
  origin = table centre).
  - night: cool white 1.35 from the front-left floodlight tower
  - beach: warm sun 1.25 from high in front-left
  - volcano: warm white 1.2 from high in front-right
- For these mats the table's own `sun` is turned down in `THEMES` (`sunI` 1.0-1.3) because the venue key
  light carries the scene. If you switch shadows to the key light, you can turn `sun.castShadow` off for
  these three mats so there is only one shadow map.
- `setLightK` (spotlight dimming) does not touch the venue key light, so those venues dim a bit less
  during the spotlight. If you want it exact, scale `envFx.key.intensity` in `setLightK` too
  (base intensity = the value above).
- `castShadow`/`receiveShadow` are set on the big pieces: stands, palms, props, terraces, rim rocks,
  scoreboard casings cast; floors, pitch, terraces receive. Crowds (instanced, hundreds) deliberately do
  not cast.
- Emissive/unlit things that could take bloom: the night stadium's floodlight lamps and beams (beams are
  additive, opacity 0.16), every scoreboard screen (`toneMapped: false`), the volcano lava stream
  (`MeshBasicMaterial`, `toneMapped: false`) and its crystals (emissive in their own colour).

## Notes

- `buildStadium(W, D, aniso, layoutName, quality, opts)`: new optional `opts.night`; without it the
  stadium is unchanged (verified side by side). `pitchTexture` is now exported with optional colours.
- Nothing idles: no per-frame motion in any venue. The wave and the camera flashes are the stadium's
  one-shot effects (night uses the stadium's own; beach/volcano use the same code in `arenas/common.js`).
