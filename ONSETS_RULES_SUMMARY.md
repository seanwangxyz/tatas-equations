# Tata's On-Sets: Rules Summary

Source: the *On-Sets Tournament Rules 2026-27* PDF from AGLOA
(https://agloa.org/wp-content/uploads/On-SetsRules2627.pdf, 34 pages), downloaded 2026-11-12.
(The address `OnSetsRules2627.pdf`, without the hyphen, returns "not found".)
Page numbers (O2, O5, OG3 …) are that PDF's own numbering; OG = its Glossary.

Rulings from the AGLOA *Manual for Equations and On-Sets Judges* (2026-27) are cited by situation
number only (OS-A11, OS-B4, OS-E3 …). The manual is copyrighted, so nothing from it is copied here.

This first version plays **Elementary Division, basic game**: no Restrictions (the rules say the
= and ⊆ cubes "are not used in Elementary Division", page O3), no adventurous variations.
The tournament rules call the game without Restrictions and without variations **Basic On-Sets**
(page O2 and Glossary OG1).

Every rule the game had to interpret or invent is marked **⚠ INTERPRETATION** and listed again in
section 9.

---

## 1. Equipment (section I-B, page O3)

- **16 cards.** Each has a different mix of zero to four dots: blue (B), red (R), green (G), yellow (Y),
  never two of one colour. One card is blank. (The game stores a card as a 4-bit number.)
- **18 cubes:**
  - **3 digit cubes**, faces **1, 1, 2, 3, 4, 5** (Glossary "Digit cube", page OG2). Only for the Goal.
  - **8 colour cubes**: a colour dot on every face. A colour names "all cards in the Universe which
    contain a dot of that same color".
  - **4 operation cubes**: ∪ (union), ∩ (intersection), − (set minus), ′ (complement).
  - **3 Restriction cubes**: V (every card dealt), Λ (no cards: the rules draw it as /\), = and ⊆.
- A mat with **Goal, Required, Permitted, Forbidden**; the rolled cubes not yet played are the
  **Resources**. A sand timer and a challenge block (the game has neither; see section 9).

⚠ **INTERPRETATION 1 (cube faces).** The rules list the four symbols on colour, operation and
Restriction cubes but not which two symbols are repeated on the six faces. The game rolls each of
the four symbols with an equal chance. One constant, `FACES` at the top of `js/onsets/engine.js`.
On the 3D table the roll is the real physics pour: the face that lands up counts. A colour or operation cube
there has four symbols on six faces, so each cube gets one of two face layouts at random every shake
(B R G Y + B R, or B R G Y + G Y; ∪ ∩ − ′ + ∪ ∩, or + − ′): over the two layouts each symbol still comes up
exactly 1 time in 4 (checked in `tests/onsets.test.js`). Digit cubes are real 1 1 2 3 4 5 cubes.

## 2. Starting a shake (sections I-D, II, pages O3-O4)

- The Goal-setter rotates each shake (the first is chosen by lot; in the app the device owner sets first).
- **Elementary:** the three Restriction cubes are **not rolled**. The Goal-setter sets out **two V and
  one Λ, or one V and two Λ**, then rolls the other 15 cubes (page O4; also the Basic rules, page O2;
  manual OS-A11, OS-A12, OS-B7 for what happens if this is done wrong). The app asks the Goal-setter.
- **The player to the right of the Goal-setter deals the Universe**: "at least six but no more than 12
  cards" in Elementary, Middle and Junior (page O4; manual OS-A2, OS-A3). With two players that is the
  other player. The app lets the dealer choose 6–12.

⚠ **INTERPRETATION 2 (Universe size).** The main rule (page O4) says 6 to 12; the Glossary entry
"Illegal Universe" (page OG3) says 6 to 10 for these divisions. The game follows the main rule (6–12).

## 3. Setting the Goal (section III, pages O5-O6)

- The Goal is **1 to 3 digit cubes** forming a whole number. **Side by side = add; stacked = multiply;
  upside-down = negative.** The only legal shapes (page O5): A; A+B; A+B+C; A×B; A×B×C;
  A on top of B C (A×(B+C)); and A on top of B with C beside B ((A×B)+C).
- Unused digit cubes "should be placed in Forbidden" (comment, page O6; manual OS-B1). The app does
  this automatically when the Goal is set. (A digit cube played to the mat later doesn't count as a
  move: manual OS-C1. In the app digits can't be moved at all.)
- A Goal that is negative, or an illegal shape, should be answered with an Impossible! challenge
  (page O7 comment; manual OS-B2, OS-B3, OS-B4).
- **"No Goal"** (page O6): the Goal-setter may declare that no Goal has a Solution. Opponents agree
  (the shake is void, same setter rolls again) or challenge by writing a Goal *and* a Solution from any
  Resource cubes: correct challenger 6 / setter 2, otherwise challenger 2 / setter 6.

⚠ **INTERPRETATION 3 (Goals that can never be made).** The rules let a player set a negative Goal or one
larger than the number of cards (the opponent then wins by calling Impossible!). The app's Goal
builder refuses these two with a kind sentence instead, so an 8-year-old can't lose a shake by a slip.

⚠ **INTERPRETATION 4 (bonus moves).** The Goal-setter's bonus move (page O6) and the mover's bonus move
(page O7) are left out, as in Tata's Equations (RULES_SUMMARY.md, item 7).

## 4. Moving (section IV, page O7)

- Play passes to the left. On your turn you **move one cube** from Resources to Required, Permitted or
  Forbidden, **or challenge** the last mover.
- The **last cube** in Resources can't go to Forbidden (section VIII, page O13).

## 5. Challenges (section V, pages O7-O8; Basic rule IV, page O2)

- **Now!** = a Solution can be written with all of Required, any of Permitted, and **at most one** cube
  from Resources. Only legal with **at least two cubes in Resources** and at least one cube in Required
  or Permitted (pages O7-O8). The Challenger writes; the Mover may not.
- **Impossible!** = nobody can write a Solution, however the remaining cubes are played. The Mover must
  write; Resource cubes then count as Permitted (page O10).
- **Last cube** (section VIII, page O13; Basic rule VII): with one cube left only Impossible! is allowed;
  the last cube goes to Required or Permitted; then the opponent may still call Impossible!, otherwise
  **everyone writes** a Solution.

⚠ **INTERPRETATION 5 (who may challenge).** Anyone may challenge at any moment. With two players the app
lets the player whose turn it is challenge (the only opponent of the last mover, so nothing is lost). With
three players (as in Tata's Equations) the other person at the table gets "can challenge too" buttons after
every move, and a creature that is not next may also challenge out of turn (it looks once per move).

## 6. Solutions (sections III, VI-A, VII-B, pages O2, O8-O12)

A Solution is a **Set-Name**: the number of Universe cards in its set must **equal the Goal**.
It must:
1. contain **at least two cubes** (page O10);
2. use **every cube in Required**, any cubes in Permitted, **no cube in Forbidden** (page O10);
3. after Now!, use at most **one** Resource cube; after Impossible!, any Resource cubes (page O10);
4. be a legal Set-Name: no undefined symbol groups such as `′B`, `G ∪`, `− R`, `R ∪ ′B`, `R Λ G`
   (Glossary "Undefined", page OG7; page O13; manual OS-E6); no = or ⊆ in it (page O8);
5. **equal the Goal under every legal reading** (page O10). The only order of operations is that **′
   comes before ∪ ∩ −** (pages O2, O10). So `R ∪ G′` means `R ∪ (G′)` (page O12; manual OS-E3), but
   `B ∪ G − R` can be read `(B ∪ G) − R` or `B ∪ (G − R)` (page O12) and is wrong if either reading
   misses the Goal.
- Writing "= Goal" after the Set-Name makes it automatically wrong (pages O8, O10; manual OS-E2).
  The app's builder can't produce this.
- Ø for the empty set is accepted by judges (manual OS-E1); the app shows the rules' symbol Λ.

⚠ **INTERPRETATION 6 (what "equals the Goal" compares).** The rule says every legal interpretation
must *equal the Goal*, and "equals the Goal" is defined as "the number of cards selected … equals the
Goal" (page O10). So the game compares **counts**: if two readings name different sets with the same
number of cards, the Solution is still correct. (Chains with one grouping like `B ∪ G ∪ R` name a
single set and need no parentheses at all.) In practice the builder also tells the kid when his
Set-Name can be read two ways and shows both readings, so he learns to add ( ).

⚠ **INTERPRETATION 7 (each cube once).** The rules don't say it in so many words, but a cube is one
symbol on the table, and the Multiple Operations variation (page O17) exists exactly to allow reuse.
So in the basic game each cube is used at most once.

### Restrictions (section VI-B, pages O8-O9) — engine only, not used in Elementary

The engine already understands Restrictions for later divisions: `Set1 ⊆ Set2` removes cards in Set1
but not in Set2; `Set1 = Set2` removes cards in exactly one of them; chains `A ⊆ B = C …` apply each
neighbouring pair; no ( ) may enclose = or ⊆ (pages O8-O9). A cube used in both the Restriction and
the Set-Name counts once ("B = B" with Set-Name "B" is three cubes, page O10; manual OS-E10). It is
tested in `tests/onsets.test.js` but the game never rolls = or ⊆ yet.

## 7. Scoring (sections VI, X, pages O2, O15)

- After a challenge: anyone **not correct scores 2**; a **correct Challenger or Mover scores 6**.
- **Three players** (rules IV-B and VI-C, page O3): the player who is neither the Challenger nor the last Mover
  is the **Third Party** and **may** present a Solution. A correct Third Party scores **6** if they (a) present a
  correct Solution after Impossible!, (b) present a correct Solution after Now! when the Challenger's is not
  correct, or (c) present none after Now! and the Challenger's is incorrect; otherwise a correct Third Party
  scores **4**. (Correct = wrote a correct Solution, or didn't have to and nobody wrote one: rule V.) The engine's
  `scoreChallenge` was checked against this text for all 12 cases (`tests/onsets.test.js`); it is the same as
  Equations. After the last cube **all** players write (4 / 2); any player but the last mover may still call
  Impossible! first. "No Goal" with three (pages O6-O7): Challenger 6/2, Goal-setter 2/6, a Third Party who does
  not write 6 if the Challenger is wrong, 2 if right (interpretation 15).
- After the last cube with no challenge: **correct 4, not correct 2**.
- A match's winner is the higher total (match points tables, page O17, are not shown).

## 8. Time limits (section XI, pages O15-O16)

Left out on purpose: the owner's rule is "reward skill, not time; no punishing timers". Nothing in the
app is timed. Computer players pause about a second so the kid can follow. With two creatures at the table the
game stops after one creature's move and waits (untimed) for the kid to look and tap **Go on** (or challenge)
before the other creature moves, as in Equations.

## 9. Every interpretation, in one place

| # | Topic | Rules | What the app does |
|---|---|---|---|
| 1 | Cube faces | Symbols named, repeats not | Each of the four symbols equally likely (`OSE.FACES`) |
| 2 | Universe size | 6–12 (page O4) vs 6–10 (Glossary OG3) | 6–12, chosen by the dealer |
| 3 | Unwinnable Goals | Legal to set, then lost to Impossible! | Goal builder refuses negative Goals and Goals bigger than the Universe |
| 4 | Bonus moves | Allowed for a player not in the lead | Left out (as in Equations) |
| 5 | Out-of-turn challenges | Anyone, any time | 2 players: the player whose turn it is (same thing). 3 players: "can challenge too" buttons; a creature not next may challenge once per move |
| 6 | "Every interpretation equals the Goal" | Equals = same number of cards | Compares card counts of every reading |
| 7 | Each cube once | Implied | Enforced |
| 8 | Spare digit cubes | "Should be placed in Forbidden" | Moved there automatically when the Goal is set |
| 9 | Timers, sand timer, challenge block | Full rules | None (owner's rule) |
| 10 | First Goal-setter | Decided by lot (roll a digit cube) | The device owner sets first; it then alternates |
| 11 | Writing Solutions on paper; checking by opponents; judges | Opponents must show a Solution is wrong | The app checks instantly and explains why, kindly |
| 12 | Computer strength | Not in the rules | Four levels from each creature's stars (js/onsets/ai.js) |
| 13 | "No Goal" vs the computer | Opponent agrees or challenges | The creature searches for any Goal + Solution; if it finds one it challenges and shows it, otherwise it agrees |
| 14 | Three players | Allowed | You + two creatures, you + a grown-up + a creature, or three people. Third Party scoring as rule VI-C. Two creatures: an untimed "Go on" pause between their moves |
| 15 | Third Party after "No Goal" | The Third Party may also write a Goal and Solution | The app doesn't ask; the Third Party is scored as not writing (6 if the challenger was wrong, 2 if right), as in Equations item 13 |
| 16 | Face layout of 4-symbol cubes (3D) | Not specified | Two layouts, picked at random each shake, so each symbol is 1 in 4 (see interpretation 1) |
