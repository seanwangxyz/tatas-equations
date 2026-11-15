# Everyday outfits in 3D (helper "outfits3d")

Branch: `worktree-agent-a3cd03cc37f39fa74`. It started on an old commit, so I fast-forwarded it onto main `e4f35fa`
first (the commit with the outfit fields in people-data.js).

## What was built

`buildPerson({ avatar, kit, num, name, front })` now dresses every `avatar.outfit` other than `'kit'`. The football
kit path has not changed: `buildKid()`, `buildTata()`, People.DEFAULT/GROWN and the examples/cute/bodies gallery
sections render **pixel-identical** to before (JPEG diff 0 against renders taken before any change).

### How it plugs into the rig (kid.js, all additive)
- `buildHuman(spec)` takes two new optional fields: `spec.dress(rig)`, which is called once the figure is built with
  the rig's parts and returns `{ setKit(k, n, nm, front), onHair(styleId) }`, and `spec.cloth = { r(y), back(y) }`, the
  outfit's radius and the hood's depth behind it at a body height. Long hair, ponytails and braids use `cloth` to
  hang outside the clothes and over the hood.
- When there is a `dress`: the jersey texture is skipped. The internal `setKit` goes to `wear.setKit`, so it repaints
  the name and number only (it never runs `applyGear`, which would put the kit sleeves back), and `buildHair` calls
  `wear.onHair`. The model also has `model.wear`.
- `leg.userData` now has `shorts`, `thigh`, `sock` and `boot`, so the outfit can hide or reuse them.
- `torsoProfile(D)` accepts `D.openHem` (the bottom is not closed) and `D.profN` (number of points).
- New export `KIT_ART`, the kit's drawing helpers (styledNumber, artCanvas, mixHex, star...).
- common.js: `ArmRig` reads optional `sleeveFrac` and `sleeveMax` (defaults 0.62 / 0.78, the same as before).

### Tops (people.js `TOPS`, `topDims`, `buildTop`, `topTexture`)
Each top is its own lathe, built from the body's shirt profile: the waist is filled out, it is roomier below the
chest, it has a cloth thickness, and it carries on straight past the waist to an open, turned-in hem above the hip
joints, so a thigh swinging forward never reaches it. It is double-sided, and textured by arc length like the kit
shirt. Raised panels (lapels, the kangaroo pocket, the cardigan's button band) are surface patches that use the top's
own UVs, so they show the cloth painted under them.
- **school**: a blazer in fit1 with a deep V. A white shirt (light blue-grey if the blazer is white), the shirt
  collar band and two collar points, a fit2 tie with diagonal stripes and a knot. Raised lapels with a notch, a collar
  round the back of the neck, two buttons (gold on a dark blazer), a breast welt, two flap pockets and a back vent.
  White shirt cuffs at the wrists.
- **cardigan**: soft knit in fit1 with a V. Under it a collared shirt in fit2 with a rounded collar and two tiny
  buttons. A raised knitted button band runs round the V and down the front with four buttons, plus a ribbed hem,
  ribbed cuffs and a knitted back collar.
- **hoodie**: an oversized fleece in fit1 with a gathered ribbed hem, a raised kangaroo pocket with dark slanted
  openings, a thick hood edge round the neck, and two fit2 drawstrings lying on the chest with tips. The **hood** lies
  behind the neck as a soft pouch that sits on the back, with a darker lining on its open top. For long styles (long,
  wavy, curtain, halfup, braids, ponytails, and partly pigtails and bob) the hood is flatter and lower, and the hair
  hangs over it. A cap and buns sit on the head, so they never touch it.
- **varsity**: a twill body in fit1 and slightly shiny sleeves in fit2. A stand-up ribbed collar, ribbed cuffs and a
  ribbed hem, each with two fit2 stripes. Five snaps down a centre placket, two fit2 welt pockets, and a round white
  felt patch with an "=" on the left chest (our own design).
- **tee**: a big roomy tee in fit1 with wide short sleeves to above the elbow, a ringer collar and sleeve bands in fit2
  (or ink, if fit2 does not contrast), a stitched hem and a big star outline on the chest (our own simple graphic).
- Sleeves: long sleeves put the whole arm (upper, fore, elbow, shoulder ball) in sleeve cloth and are 16-30 % roomier.
  On muscled bodies the muscle profile is replaced with a plain tapered cylinder, and each sleeve gets its own cuff
  that keeps its size as the arm stretches (like the kit's long-sleeve cuff). Under clothes the shoulder ball is
  slightly flatter and lower. Gloves, armband and shoulder marks are switched off.

### Name and number (backPrint)
Always on the back; the front only shows what belongs to the garment.
- tee: the name in an arc over a medium rounded number.
- hoodie: a small name arc under the hood, over a college (varsity-style) number in fit2 with a fit1 gap.
- varsity: a slab-serif name arc in fit2 with a white edge, over a large two-tone college number.
- blazer and cardigan: a neat small straight name over a small number (thin style / rounded style).

Colours go through `ink()` so the print always contrasts. Positions keep clear of the hood and of long hair, which
ends at about 1.44 x torsoY.

### Bottoms (`dressBottom`, `skirt`)
- The kit's skinned seat (hips and waistband) is re-textured in fit3 (with denim twill for jeans). The kit's drawstring
  bow is hidden: every top covers the waist.
- **shorts**: the kit's shorts legs, plain fit3 with a hem line, 32 % longer and a bit roomier (to above the knee).
  Bare shins (the sock shape without the shin pad) and crew socks.
- **skirt**: a pleated skirt to just above the knee, with 18 knife pleats that get deeper toward the hem. It has a
  waistband and a double-sided solid inside, and the kit's shorts underneath in a darker skirt colour, so nothing ever
  shows under it. It is **one skinned mesh on four bones**. The waistband follows the leaning upper body and the hips
  follow the pelvis, like the kit's seat. Below the hips each side follows the thigh under it, blended across the
  middle in a narrow band (no thigh is ever inside the blend zone). Socks are knee socks with loafers and crew socks
  otherwise (white, or navy when the skirt is white).
- **cargos / jeans / joggers**: each leg is a thigh tube on the leg with a ball round the hip joint (the same trick
  as the shorts, so nothing tears in a stride or a crouch), a knee ball, and a shin tube on the knee.
  - cargos: straight and roomy, gathered at the hem, with side pockets and flaps.
  - jeans: wide-leg, flaring to cover the top of the shoe, with denim twill, a lighter front fade, orange
    double-stitched outer seams and a stitched hem.
  - joggers: tapered, with a ribbed ankle cuff and a thin double side stripe.

  Crew socks sit under every trouser, so a gap under a wide hem shows sock.

### Shoes (`dressShoes`, in the boot's group; the soles stay on the old sole line)
- **sneakers**: a chunky trainer with a rounded sole slab, toe cap, laces, padded collar and heel tab.
- **hightops**: a thinner sole and an ankle shaft with a rim and extra laces.
- **loafers**: a low glossy shoe on a thin dark sole with a heel block and a strap across the top.
- **boots**: the football boots in shoeCol.

No marks or patches that could suggest a brand. The football kit always wears its own boots, as before.

## Interface (player.js unchanged)
- `setKit(kit, num, name, front)` on an outfit repaints the back print only.
- `setAvatar`: colour-only changes are still applied in place. Changing outfit, bottom, shoes or any fit colour returns
  false, so call buildPerson again (`personKey` changes anyway).
- `setHair`, `setFace`, `setKnees`, the arm rigs and `shirt.*` still exist. A hair style change through setHair
  rebuilds the hood for the new style, but `cloth.back` keeps the old style's depth until a rebuild (avatars rebuild on
  a style change anyway).
- Checked in the page: setKit on a hoodie, setAvatar (skin + hair, true; fit1, false), setHair. index.html loads with
  no console errors.

## Motion (checked in pictures)
Gallery section `poses`, using the same joints player.js drives (setKnees with its crouch / kneel formula and the root
drop, the legs' sideways swing, body lean, arm targets). Eight poses: crouch, kneel, knee slide (kneel + leaning back,
arms wide), stride (thighs ±0.77), run, heel click (legs out 0.5 / 0.22, knees 0.9, arms up), lean over the rim, and
belly (root pitched 1.1, legs folded up). Each was done on a kid in a school skirt, a teen in a hoodie and jeans, and
a slim grown-up in a cardigan and cargos, and viewed front, side, 3/4 back and 3/4 at a higher camera.

What I saw:
- The skirt goes with the legs in every pose. Nothing pokes through the skirt and there are no tears.
- In a deep crouch and a full stride the front of the hem opens a little and shows the dark under-shorts. That is by
  design: they are always there and in the skirt's colour.
- Trousers bend at the knee balls without gaps, and long sleeves follow the arms in the arms-up and arms-wide poses.
- Top hems clear the thighs in a crouch and a lean.

## Triangles (renderer count, figure with plain short hair, against the same body in the kit)
After lowering the top's profile to 60 points and the skirt to 72 x 14:
- kid: between 0.99x (varsity / tee + trousers) and 1.097x (hoodie + skirt + high-tops). The worst case is
  54.4k against 49.6k.
- grown-up (adult-b): between 0.94x and 1.06x.

The skirt is the most expensive bottom (about +2.5k with its under-shorts and shins). The top's lathe is about the
same size as the kit shirt's.

The starters are all within budget: school look 58.0k and cardigan 58.9k, both with long or space-bun hair plus clips
or a bow; the hair is most of it. In kits those same looks would be about 53-54k.

## Gallery (tools/people-gallery.js)
New sections:
- `outfits`: each top on a kid and on a grown-up, with a suitable bottom.
- `bottoms`: each bottom.
- `shoes`: each shoe.
- `starters`: all ten People.STARTERS, each in its own `kitFromSave(Object.assign({}, KIT_DEFAULT, starter.kit))`,
  name SAM and its jersey number.
- `poses`: described above.

Items can carry `it.pose(model, dims)`, which is applied after the rest arms. Review pictures are saved as `po_*.jpg`
in the night scratchpad (po_outfits1, po_kidclose, po_grownclose, po_poses1, po_skirtposes, po_starters, po_bottoms,
po_shoes).

## Not delivered / known weak spots
- Light colours (blush, mint) look a bit dusty, because the lower, vertical part of a roomy top catches less of the
  high light than the chest. The top's profile also bulges slightly below the chest, which gives a soft two-tone.
- The varsity "=" patch and the blazer's back name are small. They read close up but are tiny at table distance; the
  number carries identification there.
- The hood is mostly hidden under long hair (by design, the hair lies over it). From straight behind, a hoodie on a
  long-haired player shows the name and number below the hair, but not the hood.
- The tie is painted, apart from its knot, and the lapels are low raised panels; the V is not a real opening.
- Shoes were checked only at full-figure size (front / 3/4 / side). There was no close-up feet camera in the gallery.
- With wide jeans in a deep kneel the shin tube passes into the back of the thigh tube (same cloth, hidden inside). A
  cut of the knee seen exactly side-on shows a slightly boxy knee.
- Under-shorts under the skirt reuse the football shorts geometry at 80 % length. In the most extreme stride their hem
  could show at the inner thigh in the skirt's darker colour; that is intended as the "solid inside".
