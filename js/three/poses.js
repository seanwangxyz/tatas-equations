// The people's acting vocabulary (the kid and Tata, js/three/player.js): held poses at the seat ("stances", chosen by
// the game state) and one-shot moods / celebrations. Each is a pure pose function: it writes weighted targets into the
// avatar (body P, arm targets, face) and player.js eases everything there in one calm move. Nothing here loops: a mood
// plays once and settles; a stance is a still pose that is held until the game state changes.
//
// Units: the kid's own (origin at the hips, +z = the way he faces, x- = his right, arm 0 = his right hand). A grown-up's
// arm targets are mapped to his shoulders and reach by player.js (mapArm), so every pose fits Tata as well.
// Original moves only, built from generic football joy (no real player's signature celebration).
//
//   installPoses(H) -> { stances }   H: helpers from player.js (setArm, face, curl, win, ramp, clamp, lerp, sstep, easeIO,
//                                     easeOut, TAU) and H.GEST (the mood table; new moods are added to it)

export function installPoses(H) {
  const { GEST, setArm, face, curl, win, ramp, clamp, lerp, sstep, TAU } = H;
  const bump = (u, a, d) => Math.max(0, Math.sin(clamp((u - a) / d, 0, 1) * Math.PI));   // one smooth 0..1..0 hump

  // ---------- held poses at the seat (stances) ----------
  // fn(A, w, info): info.rail = { L, R } the two hand spots on the rail in his chest space (or null when the rail is
  // out of reach), set by player.js. Weighted by w (0..1), so two stances can cross-fade during the eased change.
  const stances = {
    // standing easy (his rest pose: the arms hang relaxed, hands a little open)
    rest: { fn() {} },
    // his turn: leaning in over the rail, both hands on it, elbows out, looking down at the cubes
    study: { fn(A, w, info) {
      const P = A.P, r = info.rail;
      P.lean += 0.14 * w; P.crouch += 0.12 * w; P.headPitch += 0.2 * w;
      if (r) { setArm(A, 0, r.R.x, r.R.y, r.R.z, w, 0.92, 0.9, true); setArm(A, 1, r.L.x, r.L.y, r.L.z, w, 0.92, 0.9, true); }
      else { setArm(A, 0, -0.8, 0.1, 0.62, w, 0.85, 0.8); setArm(A, 1, 0.8, 0.1, 0.62, w, 0.85, 0.8); }   // hands on his thighs
      curl(A, 0, 0.15, w); curl(A, 1, 0.15, w);
      face(A, { gazeY: -0.35, browUp: 0.12, smile: 0.25 }, w);
    } },
    // someone else's turn: chin on his right fist, the left hand on his hip, head tipped a little toward the fist
    wait: { fn(A, w) {
      const P = A.P;
      setArm(A, 0, -0.26, 1.74, 0.6, w, 0.0, 0.0); curl(A, 0, 1, w, 0.8);
      setArm(A, 1, 0.98, 0.62, -0.05, w, 0.5, 0.3);
      P.headRoll += -0.1 * w; P.headPitch += -0.05 * w; P.twist += 0.06 * w; P.lean += 0.02 * w;
      face(A, { smile: 0.3, browUp: 0.1 }, w);
    } },
    // pleased with himself (after a great shake): hands on his hips, chin up, a big grin
    proud: { fn(A, w) {
      const P = A.P;
      setArm(A, 0, -1.0, 0.64, -0.08, w, 0.55, 0.25); setArm(A, 1, 1.0, 0.64, -0.08, w, 0.55, 0.25);
      P.headPitch += -0.16 * w; P.lean += -0.05 * w; P.shrug += 0.03 * w;
      face(A, { big: 0.7, squint: 0.4, browUp: 0.2 }, w);
    } },
    // the replay on the big board: hands on the rail, head up to watch it
    look: { fn(A, w, info) {
      const P = A.P, r = info.rail;
      P.headPitch += -0.32 * w; P.lean += 0.05 * w;
      if (r) { setArm(A, 0, r.R.x, r.R.y, r.R.z, w, 0.92, 0.9, true); setArm(A, 1, r.L.x, r.L.y, r.L.z, w, 0.92, 0.9, true); }
      face(A, { wide: 0.35, o: 0.25, browUp: 0.4 }, w);
    } }
  };

  // ---------- moods ----------
  // A small "ah well" (palms up, a tilt of the head), then a determined nod with a fist at his side ("next time!"), then
  // a sporting round of applause toward the opponent. Never a slump. ~3.4 s.
  GEST.aw = { dur: 3.4, att: 0.35, rel: 0.6, fn(A, u, e) {
    const P = A.P, palms = win(u, 0.05, 0.95, 0.22), nod = bump(u, 1.05, 0.55), fist = win(u, 0.95, 1.75, 0.18), cl = win(u, 1.8, 3.0, 0.2);
    P.shrug += 0.11 * palms * e; P.headRoll += -0.1 * palms * e;
    setArm(A, 0, -0.78, 0.5, 0.62, e * palms, 0.0, 1); setArm(A, 1, 0.78, 0.5, 0.62, e * palms, 0.0, 1);
    P.headPitch += 0.22 * nod * e;
    setArm(A, 0, -0.62, 0.78, 0.55, e * fist, 0.2, 0); curl(A, 0, 1, e * fist, 1);
    // two claps at chest height, the head up toward the opponent
    const sep = 1 - cl * (0.5 - 0.5 * Math.cos(clamp((u - 1.9) / 0.9, 0, 1) * TAU * 2));
    setArm(A, 0, -(0.12 + 0.45 * sep), 1.5, 0.78, e * cl, 0.1, 0.9); setArm(A, 1, 0.12 + 0.45 * sep, 1.5, 0.78, e * cl, 0.1, 0.9);
    P.headPitch += -0.1 * cl * e;
    face(A, { o: 0.45 * palms, browTilt: 0.45 * palms - 0.55 * fist, smile: 0.5 * fist + 0.6 * cl, lid: palms > 0.5 ? 0.85 : 0.95 }, e);
  } };
  // "Yes!": one fist pump, up and pulled down to his side, a little dip of the knees. 1.7 s.
  GEST.yes = { dur: 1.7, att: 0.12, rel: 0.45, fn(A, u, e) {
    const P = A.P, up = ramp(u, 0.05, 0.32) * (1 - ramp(u, 0.42, 0.62)), pull = ramp(u, 0.42, 0.62);
    setArm(A, 0, lerp(-1.0, -0.95, up), lerp(0.6, 2.05, up), lerp(0.35, 0.55, up), e * (1 - pull), 0, 0);
    setArm(A, 0, -0.72, 0.72, 0.5, e * pull, 0.2, 0); curl(A, 0, 1, e, 1);
    P.crouch += 0.18 * pull * e; P.twist += -0.12 * pull * e; P.headPitch += (-0.15 * up + 0.1 * pull) * e;
    face(A, { shout: 0.8 * ramp(u, 0.2, 0.5) * (1 - ramp(u, 0.9, 1.2)), big: ramp(u, 0.9, 1.2), squint: 0.4, browTilt: -0.4 }, e);
  } };
  // Pleased with himself: hands on hips, chin up, held (like 'think') until the next mood or null.
  GEST.proud = { dur: 60, att: 0.45, rel: 0.6, keep: 0, fn(A, u, e) { stances.proud.fn(A, e); } };
  // A sporting "good game": turns his head to the opponent, one nod, two claps, a raised open hand. 2.6 s.
  GEST.gg = { dur: 2.6, att: 0.3, rel: 0.6, fn(A, u, e) {
    const P = A.P, nod = bump(u, 0.2, 0.55), cl = win(u, 0.6, 1.6, 0.18), hand = win(u, 1.55, 2.2, 0.2);
    P.headPitch += (0.2 * nod - 0.08) * e;
    const sep = 1 - cl * (0.5 - 0.5 * Math.cos(clamp((u - 0.7) / 0.8, 0, 1) * TAU * 2));
    setArm(A, 0, -(0.12 + 0.45 * sep), 1.45, 0.78, e * cl, 0.1, 0.9); setArm(A, 1, 0.12 + 0.45 * sep, 1.45, 0.78, e * cl, 0.1, 0.9);
    setArm(A, 0, -0.9, 2.55, 0.6, e * hand, 0.0, 1);
    face(A, { smile: 0.75, browUp: 0.25 }, e);
  } };
  // Tata's proud applause: three warm claps at chest height, then a thumbs up held a moment. 3.0 s.
  GEST.proudClap = { dur: 3.0, att: 0.3, rel: 0.6, fn(A, u, e) {
    const P = A.P, cl = win(u, 0.25, 1.45, 0.15), th = win(u, 1.5, 2.55, 0.22);
    const sep = 1 - cl * (0.5 - 0.5 * Math.cos(clamp((u - 0.35) / 1.0, 0, 1) * TAU * 3));
    setArm(A, 0, -(0.12 + 0.48 * sep), 1.35, 0.78, e * cl, 0.1, 0.9); setArm(A, 1, 0.12 + 0.48 * sep, 1.35, 0.78, e * cl, 0.1, 0.9);
    setArm(A, 0, -0.62, 1.62, 0.95, e * th, 0.0, 0.0); curl(A, 0, 1, e * th, 0);
    P.headPitch += (0.08 * cl - 0.04) * e; P.headRoll += 0.06 * th * e;
    face(A, { smile: 0.9, squint: 0.35, browUp: 0.2 }, e);
  } };
  // Tata's "next time, son": a calm nod and a thumbs up (no shrug, no slump). 2.4 s.
  GEST.chinUp = { dur: 2.4, att: 0.3, rel: 0.6, fn(A, u, e) {
    const P = A.P, nod = bump(u, 0.15, 0.55), th = win(u, 0.6, 1.9, 0.22);
    P.headPitch += 0.18 * nod * e;
    setArm(A, 0, -0.62, 1.62, 0.95, e * th, 0.0, 0.0); curl(A, 0, 1, e * th, 0);
    face(A, { smile: 0.6, browUp: 0.2 }, e);
  } };

  // ---------- celebrations (in place; player.js may add a run beside the table for 'slide' and 'plane') ----------
  // Heel Click: crouch, a jump with the heels clicked together out to one side, land, both arms up. 2.8 s.
  GEST.heel = { dur: 2.8, att: 0.1, rel: 0.6, fn(A, u, e) {
    const P = A.P, crouch = win(u, 0.02, 0.3, 0.12) * 0.7 + win(u, 0.98, 1.16, 0.08) * 0.55;
    const air = clamp((u - 0.34) / 0.62, 0, 1), arc = Math.sin(air * Math.PI) * (u > 0.34 && u < 0.96 ? 1 : 0), click = bump(u, 0.44, 0.44);
    P.crouch += (crouch + 0.15 * arc) * e; P.hop += 1.05 * arc * e; P.lean += (0.15 * crouch - 0.05 * arc) * e;
    P.heel += click * e;
    const back = 1 - ramp(u, 0.22, 0.36), inAir = ramp(u, 0.3, 0.42) * (1 - ramp(u, 0.95, 1.1)), vee = ramp(u, 1.15, 1.4) * (1 - ramp(u, 2.15, 2.4));
    setArm(A, 0, -0.95, 0.4, -0.5, e * back, 0, 0.5); setArm(A, 1, 0.95, 0.4, -0.5, e * back, 0, 0.5);
    setArm(A, 0, -1.55, 2.6, 0.2, e * inAir, 0, 1); setArm(A, 1, 1.55, 2.6, 0.2, e * inAir, 0, 1);
    setArm(A, 0, -1.25, 3.4, 0.35, e * vee, 0, 1); setArm(A, 1, 1.25, 3.4, 0.35, e * vee, 0, 1);
    P.headPitch += (-0.2 * inAir - 0.3 * vee) * e;
    face(A, { big: 1, squint: 0.4, browUp: 0.6 }, e);
  } };
  // Big Brain: two fingers to his temple with a little tap ("calculating..."), then he points at the table. 3.0 s.
  GEST.brain = { dur: 3.0, att: 0.25, rel: 0.6, fn(A, u, e) {
    const P = A.P, temple = win(u, 0.1, 1.35, 0.25), tap = bump(u, 0.62, 0.3), point = win(u, 1.4, 2.45, 0.22);
    setArm(A, 0, -0.84, 2.42 + 0.05 * tap, 0.3, e * temple, 0.0, 0.1); curl(A, 0, 0.25, e * temple, 1);
    P.headRoll += -0.12 * temple * e; P.headPitch += (0.06 * tap - 0.06 * temple) * e;
    setArm(A, 0, -0.55, 1.45, 1.75, e * point, 0.15, 0.2); curl(A, 0, 0.4, e * point, 1);
    P.lean += 0.06 * point * e; P.headPitch += 0.18 * point * e; P.twist += -0.08 * point * e;
    setArm(A, 1, 0.98, 0.62, -0.05, e * (temple + point) * 0.9, 0.5, 0.3);
    face(A, { hmm: 0.6 * temple, browAsym: 0.4 * temple, gazeX: 0.3 * temple, gazeY: 0.4 * temple, big: 0.9 * point, squint: 0.4 * point }, e);
  } };
  // That's Me!: fists to his chest, then arms open wide and low, chin up, a turn to show the name and number. 3.0 s.
  GEST.number = { dur: 3.0, att: 0.2, rel: 0.6, fn(A, u, e) {
    // both fists to his chest ("me!"), then the arms open wide and low, chest out, a turn to show the back of the shirt
    const P = A.P, chest = win(u, 0.1, 0.85, 0.18), wide = ramp(u, 0.8, 1.1) * (1 - ramp(u, 2.2, 2.55)), show = bump(u, 1.0, 1.1);
    setArm(A, 0, -0.32, 1.32, 0.98, e * chest, 0.3, 0.0); setArm(A, 1, 0.32, 1.32, 0.98, e * chest, 0.3, 0.0);
    curl(A, 0, 1, e * chest, 0.2); curl(A, 1, 1, e * chest, 0.2);
    setArm(A, 0, -1.65, 0.85, 0.35, e * wide, 0.1, 1); setArm(A, 1, 1.65, 0.85, 0.35, e * wide, 0.1, 1);
    P.headPitch += (0.1 * chest - 0.22 * wide) * e; P.lean += -0.08 * wide * e; P.shrug += 0.05 * wide * e; P.twist += 0.32 * show * e; P.headYaw += 0.25 * show * e;
    face(A, { big: 0.9, squint: 0.45, browUp: 0.4 }, e);
  } };
  // Aeroplane (in place; the full version runs a loop on the pitch beside the table): arms out like wings, a bank one
  // way and the other, then both arms up. 3.0 s.
  GEST.plane = { dur: 3.0, att: 0.2, rel: 0.6, fn(A, u, e) {
    const P = A.P, wings = ramp(u, 0.05, 0.35) * (1 - ramp(u, 2.0, 2.3)), b = Math.sin(clamp((u - 0.35) / 1.5, 0, 1) * TAU) * wings, up = ramp(u, 2.0, 2.3) * (1 - ramp(u, 2.6, 2.9));
    setArm(A, 0, -2.05, 1.62, 0.05, e * wings, 0, 1); setArm(A, 1, 2.05, 1.62, 0.05, e * wings, 0, 1);
    P.bank += 0.22 * b * e; P.lean += 0.12 * wings * e; P.twist += -0.12 * b * e; P.headRoll += -0.15 * b * e;
    setArm(A, 0, -1.2, 3.4, 0.3, e * up, 0, 1); setArm(A, 1, 1.2, 3.4, 0.3, e * up, 0, 1);
    face(A, { big: 1, squint: 0.35, browUp: 0.5 }, e);
  } };
  // High five, the kid's half: his left hand up and out to the side where Tata comes in, head turned to him. 1.7 s.
  GEST.five = { dur: 1.7, att: 0.2, rel: 0.5, fn(A, u, e) {
    const P = A.P, up = ramp(u, 0.0, 0.3) * (1 - ramp(u, 1.0, 1.3)), hit = bump(u, 0.38, 0.22);
    setArm(A, 1, 1.55 + 0.1 * hit, 2.95 - 0.1 * hit, 0.2, e * up, 0.0, 1);
    P.headYaw += 0.55 * e; P.twist += 0.18 * up * e; P.hop += 0.12 * hit * e;
    face(A, { big: 1, squint: 0.45, browUp: 0.5 }, e);
  } };
  return { stances };
}

// ---------- pose functions for the travelling celebrations (segments of a trip; u = s into the segment, k = 0..1) ----
// Kept here with the rest of the acting; player.js builds the trip (where he runs) and calls these per frame.
export const TRAVEL = {
  // running out to the pitch beside the table: a happy run, arms pumping a little higher
  run(A, u, k, H) { H.face(A, { big: 0.8, squint: 0.3, browUp: 0.4 }, 1); },
  // arms out like wings while he runs a loop (banking into the curve: bank is set by player.js from the path)
  wings(A, u, k, H) {
    const w = H.sstep(u / 0.25);
    H.setArm(A, 0, -2.05, 1.6, 0.0, w, 0, 1); H.setArm(A, 1, 2.05, 1.6, 0.0, w, 0, 1);
    A.P.headPitch += -0.12 * w; H.face(A, { big: 1, squint: 0.35, browUp: 0.55 }, 1);
  },
  // the knee slide: down onto both knees as he glides, leaning back, arms flung wide and up, a shout
  slide(A, u, k, H) {
    const P = A.P, kn = H.sstep(u / 0.16), arms = H.sstep((u - 0.1) / 0.25);
    P.kneel += kn; P.lean += -0.3 * kn; P.headPitch += -0.4 * arms;
    H.setArm(A, 0, -1.95, 2.9, 0.25, arms, 0, 0.9); H.setArm(A, 1, 1.95, 2.9, 0.25, arms, 0, 0.9);
    H.face(A, { shout: 1, squint: 0.3, browUp: 0.6 }, 1);
  },
  // held on his knees at the end of the slide, arms up, the shout turning into a big grin
  slideHold(A, u, k, H) {
    const P = A.P; P.kneel += 1; P.lean += -0.3; P.headPitch += -0.4;
    H.setArm(A, 0, -1.95, 2.9, 0.25, 1, 0, 0.9); H.setArm(A, 1, 1.95, 2.9, 0.25, 1, 0, 0.9);
    H.face(A, { shout: 1 - H.sstep(u / 0.5), big: H.sstep(u / 0.5), squint: 0.4, browUp: 0.5 }, 1);
  },
  // getting up from his knees (one hand pushing off his knee), back to standing
  rise(A, u, k, H) {
    const P = A.P, d = 1 - H.sstep(k); P.kneel += d; P.lean += -0.3 * d + 0.25 * Math.sin(k * Math.PI);
    H.setArm(A, 0, -0.7, 0.2, 0.75, Math.sin(k * Math.PI), 0.8, 0.9);
    H.face(A, { big: 0.8, squint: 0.3 }, 1);
  },
  // High five, Tata's half (he has walked up beside the kid, facing him): right hand up and forward, one clap of hands
  five(A, u, k, H) {
    const up = H.sstep(u / 0.3) * (1 - H.sstep((u - 0.85) / 0.25)), hit = Math.max(0, Math.sin(H.clamp((u - 0.38) / 0.22, 0, 1) * Math.PI));
    H.setArm(A, 0, -0.35, 1.95 - 0.12 * hit, 1.35 + 0.1 * hit, up, 0.0, 1);
    A.P.headPitch += 0.15 * up; H.face(A, { smile: 1, squint: 0.4 }, 1);
  },
  // the end of a run: stop, face the table, both arms up in a V for a moment
  vee(A, u, k, H) {
    const w = H.sstep(u / 0.25) * (1 - H.sstep((u - (k > 0 ? u / k : 1) + 0.3) / 0.3));
    H.setArm(A, 0, -1.25, 3.4, 0.35, w, 0, 1); H.setArm(A, 1, 1.25, 3.4, 0.35, w, 0, 1);
    A.P.headPitch += -0.3 * w; H.face(A, { big: 1, squint: 0.4, browUp: 0.5 }, 1);
  }
};
