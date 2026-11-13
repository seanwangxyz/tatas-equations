# Tata's Equations: Rules Summary

Source: the *Equations Tournament Rules 2026-27* PDF from AGLOA
(https://agloa.org/wp-content/uploads/EquationsRules2627.pdf), downloaded 2026-11-11.
Page numbers below (E1, E3, …) are that PDF's own numbering.
The Elementary page at academicgames.org returned a server error (HTTP 500) when I tried it,
so the Elementary rules here come from section XIII-A of the same PDF.

---

## 1. Equipment (PDF section I-B, page E2)

- **24 cubes, six of each color: red, blue, green, black.**
- "Every face of each cube contains either a digit (0–9) or an operation sign (+, –, x, ÷, ^ or *, √)."
- A playing mat with four sections: **Goal, Required, Permitted, Forbidden**.
  The rolled cubes that haven't been played yet are the **Resources**.
- A one-minute sand timer (left out of the game on purpose; see section 9) and a challenge block.

### ⚠ Ambiguity: which symbol is on which face

**The tournament rules never list the faces of each color cube.** They only say which symbols
exist. Two hints in the PDF support the layout below:
- Players roll a red cube to pick the first Goal-setter, and "a player who rolls an operation sign
  is eliminated". So red cubes have both digits and operations.
- The Exponent variation (page E22) mentions a roll where "the black digits are 8s and 9s". So
  black cubes carry the high digits.

The layout the game uses is the one usually documented for the original game kit
(3 or 4 digits and 2 or 3 operations per color):

| Color | Faces |
|---|---|
| Red   | 0, 1, 2, 3, +, − |
| Blue  | 0, 1, 2, 3, ×, ÷ |
| Green | 4, 5, 6, −, ×, ^ |
| Black | 7, 8, 9, +, ÷, √ |

This fits both hints and uses every symbol the rules name. **I couldn't confirm it from an
official source.** If your old set at home differs, change the single `CUBE_FACES` constant at
the top of the code in `index.html` and the whole game follows.

---

## 2. Basic Equations: the seven beginner rules (page E1)

### I. GOAL rule
- One player rolls all 24 cubes. The symbols showing on top are the **Resources**.
- The roller sets a **Goal** by moving **1 to 6 cubes** from Resources to the Goal section, forming
  a legal expression.
- The Goal may contain **one- or two-digit numbers** (two digit cubes side by side make a two-digit
  number, like 2 and 3 → 23) as well as operation signs. No three-digit numbers.
- **"No Goal" call (IV-D, page E4):** if the roller thinks no Goal with a correct Solution can be
  set, they say "no Goal". If the opponent agrees, the shake is void (no points) and the same player
  rolls again. If the opponent disagrees, they challenge and must write a full correct Equation
  (a Goal plus a Solution) using any Resources. Challenger correct → challenger 6, Goal-setter 2.
  Challenger wrong → challenger 2, Goal-setter 6.

### II. MOVE rule
After the Goal is set, play passes to the next player. On your turn you **must** either:
- move **one** cube from Resources to **Required**, **Permitted** or **Forbidden**, or
- **challenge** the player who just moved (or who just set the Goal).

### III. SOLUTION rule
A Solution must equal the Goal and:
- A. contain **at least two cubes**;
- B. use **all** Required cubes, **no** Forbidden cubes, and none, some or all of the Permitted cubes;
- C. contain **only one-digit numerals** (no gluing digits together in a Solution);
- D. may use parentheses (they aren't cubes);
- E. + and − are only addition and subtraction, **never positive/negative signs** (so "−3" alone is
  illegal). × ÷ ^ mean multiply, divide, power;
- F. √ is preceded by its **index**; with no index it means square root. `3√8` = cube root of 8 = 2.
  `4×√9` = 4 × 3 = 12.

### IV. CHALLENGE rule
On your turn (in a 2-player game you can only challenge the player who just moved) you may call:
- **NOW!**: "A Solution can be written right now using all of Required, any of Permitted, and
  **at most one more cube from Resources**."
- **IMPOSSIBLE!**: "Nobody can ever write a Solution, however the remaining Resources and Permitted
  cubes are used."

Validity limits (VI-A-2, page E6):
- **Now** needs **at least two cubes left in Resources**.
- **Now** is not allowed before at least one cube is in Required or Permitted.

### V. CORRECTNESS rule
After a challenge:
- **Now**: the Challenger **must** write a Solution (with ≤ 1 extra Resource cube). The Mover may not.
- **Impossible**: the Mover (the player who just moved or set the Goal) **must** write a Solution.
  All remaining Resources count as Permitted (VII-B-3-f).
- A player is **correct** if they had to write a Solution and wrote a correct one, or they didn't
  have to write one and nobody wrote a correct one.

### VI. CHALLENGE-SCORING rule (2 players)
- A correct Challenger or Mover scores **6**.
- A player who is not correct scores **2**.
(The 3-player "Third Party" scores of 4 and 6 aren't needed, because this game is 2-player.)

### 3-player games (rules IV-B, VI-C and section X, pages E1 and E14–E15)
The player who is neither the Challenger nor the Mover is the **Third Party**. After a challenge
the Third Party **may** write a Solution, but doesn't have to.
- Mover after a Now! challenge: correct (6) only if **nobody** wrote a correct Solution; otherwise 2.
- Challenger after an Impossible! challenge: correct (6) only if **nobody** wrote a correct Solution.
- Third Party scores **6** if they: wrote a correct Solution after Impossible!; or wrote a correct
  one after Now! when the Challenger's was wrong; or sat out a Now! whose Solution was wrong.
- Third Party scores **4** if they: sat out an Impossible! that turned out right; or wrote a correct
  Solution after Now! when the Challenger's was also correct.
- Third Party scores **2** if they wrote a wrong Solution, or sat out while the writer was correct.
These cases are unit-tested in `tests/engine.test.js`.

### VII. LAST CUBE rule (also section VIII, page E13)
- When **one cube** is left in Resources, the only challenge allowed is **Impossible**.
- If nobody challenges, the player whose turn it is must move the last cube to **Required or
  Permitted** (never Forbidden).
- The opponent may still challenge Impossible right after that move.
- Otherwise **both players write a Solution**: correct → **4**, incorrect → **2**.

---

## 3. Legal expressions (section III, pages E3–E4)
- An expression must name a real number. **Division by zero is illegal.**
- Undefined: 0√a (zero-th root); 0^a for a ≤ 0; even roots of negatives.
- Even roots mean the positive root only (√9 = 3, not −3).
- √ applies to the numeral right after it unless parentheses say otherwise (VII-B-6-b-i):
  √4+5 = (√4)+5.

### Elementary "General Rule" (XIII-A, page E17), which this game always uses
- For ^, the base and exponent must both be **whole numbers** (0, 1, 2, …). So 2^(1−3) and
  (2÷3)^3 are illegal.
- For √, the index must be a **counting number** (1, 2, 3, …), and the base and the answer must both
  be whole numbers. So √5 and 3√9 are illegal, while √9 = 3 and 9√0 = 0 are fine.

---

## 4. Rules I had to interpret (please review)

| # | Topic | Official text | What the game does | Why |
|---|---|---|---|---|
| 1 | Cube faces | Not listed in the rules | Table in section 1 | Most faithful available reading; one constant to change |
| 2 | Order of operations | "There is no default order of operations"; an ambiguous Solution can be ruled wrong by a checker who regroups it | The game uses **normal school order** (powers → × ÷ → + −, left to right) and shows the grouping it used | An 8-year-old can't argue ambiguity with a computer. Parentheses buttons let him group things his own way. |
| 3 | Goal grouping | The Goal-setter groups cubes by spacing them; an ungrouped Goal can be read any valid way | The Goal is built with the same parentheses buttons and read with normal order | Same reason as #2: one clear value, shown on screen |
| 4 | Powers & roots | Basic rules allow any real number | Elementary General Rule always applies (whole numbers only) | Keeps every value an exact fraction; matches his division |
| 5 | Fractions before they're unlocked | Not in the rules (difficulty ladder is your request) | Until "Fractions" unlocks, division must come out whole at every step | Your ladder: fractions come later |
| 6 | Locked operations | Not in the rules | Cubes showing a locked operation go straight to Forbidden with a 🔒 "Coming soon!" tag right after the roll | Your request; the official cube set stays intact |
| 7 | Timers, bonus moves, variations | Full tournament rules | Left out: no timers or bonus moves. Five Elementary variations are now in, as optional "variation cards" (see section 5) | Not in the seven Basic rules; you asked for no punishing timers |
| 13 | "No Goal" with 3 players | The Third Party may also write an Equation after a "No Goal" challenge | The Third Party is scored as if they chose not to write (6 if the challenger was wrong, 2 if right) | Rare case; the rules allow not writing |
| 14 | Out-of-turn challenges | Anyone may challenge at any moment | People get "can challenge too" buttons after every move; a computer player in the third seat may also challenge out of turn | Same rule, made tappable |
| 8 | Writing an Equation | Players write "Solution = Goal" on paper | Built with tap-to-place cubes; the game checks it instantly | No typing |
| 9 | Very big numbers | No limit | Values past ±1,000,000 (numerator or denominator) are refused as "too big to check" | Keeps the exact arithmetic safe; no Basic Goal comes close |
| 10 | "No Goal" vs the computer | The opponent agrees or challenges | The computer searches for any Goal + Solution. If it finds one it challenges and shows it; if not it agrees | Fair and rules-faithful |
| 11 | Daily puzzle | Not in the rules | A seeded daily roll with a pre-set Goal and Required/Permitted cubes the solver has checked is solvable | Your request |
| 12 | Who may challenge | Anyone, any time | In 2-player play only the next player can challenge, so challenges happen on your turn | With two players, they're the same thing |

---

## 5. Variations ("Adventurous Equations", sections II-B and XIII-A, pages E2–E3 and E17–E19)

I read these sections in the same 2026-27 PDF (downloaded 2026-11-11 and turned into text). The text
conversion dropped some symbols (√, ÷, −), so I filled those in from the surrounding words and examples.

A **variation** is an extra rule for one shake. In the game each one is a **variation card**.

### How a card is chosen

| | Official (section II-B, pages E2–E3) | What the game does |
|---|---|---|
| When | After the roll, before the Goal is set | Same |
| Who | **Every** player picks one, the Goal-setter first. In 2-player matches the player who is not the Goal-setter must pick **two** (II-B-3) | **SIMPLIFIED:** only the Goal-setter may pick, and at most **one** card. "No card" is always there |
| Time | 15 seconds each | No timer (you asked for no punishing timers) |
| A card that changes nothing | Costs 1 point and you pick again (II-B-2). The rules' example: choosing 0 Wild when no 0 was rolled | Such cards are simply not offered, so nobody can lose a point |
| Computer players | — | A creature that sets the Goal sometimes picks a card: Snoozy about 4% of the time, Penny 10%, Rusty 24%, Ollie 41%, Mondo 55%, King Zog 70%. Its math taste nudges which card |

The engine can play several cards at once (they are tested together a little), but the game only offers one.

### The five cards in the game

**1. 0 is Wild** (XIII-A-3, page E17)
- Official (paraphrase): the 0 cube may stand for any numeral on the cubes, but it must stand for the same
  numeral everywhere it appears, in the Goal and the Solution. The writer must write down what the 0 stands for; if they
  don't, it means 0 (Appendix A note, page E12).
- Game: every 0 cube stands for the same digit, 0 to 9, in the Goal and in the Solution.
- Kid version: "A 0 cube can stand for any digit from 0 to 9, but every 0 means the same digit (in the
  Goal too)." Example: Goal 8, Solution 5 + 0, where the 0 stands for 3.
- ⚠ Interpretations:
  - "Any numeral on the cubes" = a digit 0–9 (that is the Elementary reading; Middle Division lets 0 be any symbol).
  - The kid does **not** have to say what his 0 means. The game tries 0 first, then 1, 2, … 9, accepts the
    Solution if any digit works, and tells him which digit it used. (Officially an unwritten 0 means 0.)
  - A Goal with a 0 is legal if the 0 can stand for some digit that makes it legal (so 8 ÷ 0 is a legal
    Goal: the 0 could be 2). The Goal's value on screen is the one with 0 = 0 (or the first digit that works),
    with a note that the 0 is wild.
  - A two-digit Goal like 1 0 means 1 followed by the wild digit (10 to 19). The rulebook's own example
    "(5x5) − 2 = 03" reads 0 3 as 23 this way.

**2. Two-digit Numbers** (XIII-A-8 "Two-digit Numerals", page E18; played in Elementary in 2026-27)
- Official: "Two-digit numerals are allowed in Solutions."
- Game: two number cubes side by side in a Solution make one number (2 and 3 → 23). Three in a row is still not allowed.
- Kid version: "In your Solution, two number cubes side by side can make one two-digit number." Example: 23 + 1 = 24.
- ⚠ Interpretations: a leading 0 is allowed (0 5 = 5), the same as the game already allows in Goals.
  A Solution may be just one two-digit number (Goal 23, Solution 2 3): it has two cubes, and nothing forbids it.

**3. Use It Again** (XIII-A-5 "Multiple Operations", page E18)
- Official (paraphrase): any operation sign that is not in Forbidden (or the Goal) may be used many times in
  a Solution. Comment (a): after Impossible! any operation in Resources may be repeated; after Now!, if the one Resource
  cube is an operation it may be repeated. A Goal still uses each cube once.
- Game: exactly that. In the Solution builder an operation cube you may use stays tappable (dashed outline).
- Kid version: "Any operation cube you may use can be used again and again in your Solution." Example: one
  + cube, 1 + 2 + 3 = 6.
- ⚠ Interpretations: if two + cubes are in Required, the Solution must show + at least twice (one for each
  cube). The computer's search stacks square roots at most 3 deep (√√√); deeper ones are never useful with
  these cubes, but it is a search limit, not a rule.

**4. Three Operations** (XIII-A-6 "Three-operation Solution", page E18)
- Official (paraphrase): every Solution must contain at least three operation symbols (+, −, ×, ÷, ^, √).
- Game: a Solution needs at least three operation cubes. A square root with no little number counts (it is a √ cube).
  Parentheses don't count.
- Kid version: "Every Solution must use at least three operation signs." Example: 4 + 3 × 2 − 1 = 9.
- ⚠ Interpretation: the card is only offered when at least three operation cubes were rolled (with fewer,
  no Solution could ever count, which I treat as "has no effect").

**5. Remainder** (XIII-A-7, page E18)
- Official (paraphrase): A ⊘ B (⊘ = a ÷ cube turned sideways) is the remainder when A is divided by B;
  A and B must be positive whole numbers and A at most 1000. Examples include 15 ⊘ 2 = 1 and 45 ⊘ 70 = 45.
- Game: in the Solution builder, the button "Turn ÷ sideways" turns the last ÷ into a remainder; it shows as
  **rem** on the cube. 7 rem 3 = 1.
- Kid version: "Turn a ÷ cube sideways and it means what is left over when you divide." Example: 7 ÷ 3 is 2
  with 1 left over, so 7 rem 3 = 1.
- ⚠ Interpretations:
  - Order: rem goes with × and ÷, left to right (the tournament has no order of operations; the game uses
    school order, see #2 in section 4).
  - Only in Solutions, not in the Goal. The rule does not mention the Goal; keeping Goals plain keeps the
    Goal builder simple.
  - 0 rem 3 is not allowed (A must be 1, 2, 3, …), as the rule says.

### Elementary variations left out, and why

| Variation | Why not (for now) |
|---|---|
| 1 Sideways, 2 Upside-down, 4 Factorial, 9 LCM, 10 GCF, 11 Number of Factors, 12–15 Average, Smallest Prime, Percent, Decimal Point | Now built as second-tier cards, after the five above: see section 6 |

### When cards unlock (house rule, not in the rulebook)
- Cards start only after the basics: the first card arrives when the ladder reaches **Fractions**
  (that is, after + − × ÷ have earned their stars), or straight away if Tata switched the ladder off.
- Then one new card for every **4 skill points** (correct Solutions plus correct Impossible! calls), in this
  order: Two-digit Numbers, Use It Again, 0 is Wild, Three Operations, Remainder.
- A new card is announced once, calmly, the next time a Goal is set.
- A creature only picks cards the kid has already unlocked.
- Parent corner switch "Variation cards" turns them all off (see docs/handoff/variations.md).

---

## 6. Middle-division variation cards (the second tier)

Sources, read for this tier on 2026-11-12:
- the same *Equations Tournament Rules 2026-27* PDF, downloaded again from agloa.org; sections XIII-A (Elementary list,
  where several of these cards have their examples), XIII-B (Middle list, pages E20–E23), VII-B-6 (default groupings),
  VII-C-5 (checking), and Appendix A (how a writer marks a turned cube or a second meaning, pages EA1–EA7). The text
  conversion drops symbols such as √, ÷ and the drawn upside-down radical, so I read those pages as page images too;
- the judges' manual (sections B-II, C-II, E-II). It is copyrighted, so below I only cite situation numbers (B45, E58, …).
  Every number cited here is also in a test in `tests/engine.test.js` (block "MIDDLE-DIVISION VARIATION CARDS").

### Which list each card comes from

The owner asked for "Middle division" cards. In the 2026-27 PDF they are not all on the Middle list:

| Card | Official place (2026-27 PDF) | Played in Middle? |
|---|---|---|
| Upside-down, Sideways, Factorial | XIII-B-1, B-2, B-4 (examples under XIII-A-1, A-2, A-4) | yes, every year |
| Base m, Multiple of k | XIII-B-6, B-7 | yes, every year |
| Number of Factors | XIII-B-8 (examples under XIII-A-11) | yes, 2026-27 |
| Exponent, Powers of the Base | XIII-B-9, B-10 | yes, 2026-27 |
| Average, Percent, Decimal Point | XIII-B-11, B-12, B-13 (examples under XIII-A-12, A-14, A-15) | 2027-28 |
| Smallest Prime, LCM, GCF | XIII-A-13, A-9, A-10 | **Elementary list only** (not on the Middle list) |

All fourteen are official AGLOA variations; the card shows its reference. Smallest Prime, LCM and GCF use their
Elementary wording (Smallest Prime: A ≤ 200; Number of Factors uses the Middle limit A ≤ 1000).

### How cards work in the game (same as section 5, plus)

- One card per shake, picked by the Goal-setter, "No card" always allowed, no timer (section 5).
- **Unlocking:** after the five Elementary cards, the same rule continues: one new card every **4 skill points**, in
  this order (easiest first for an 8-year-old):
  Average → Upside-down → Sideways → Exponent Colour → Multiple of k → Powers of Ten → Factorial → Number of Factors →
  Smallest Prime → LCM → GCF → Percent → Decimal Point → Base m. (`CARDS` order and `STAR_STEP` in `js/variations.js`.)
  So the last card arrives 72 skill points after the first one.
- **Cards with a setting** (official: the player fills in a blank when circling the card, II-B-1-c): Multiple of k asks
  for k = 6 to 11 (XIII-B-7), Base m for 8 or 9, Exponent Colour for a colour. A creature picks a random setting.
- **"Must be able to affect the shake"** (II-B-2; manual General Principle 1). A card is offered only when:
  Average: a + in Resources (the PDF's own example); Upside-down: a nonzero digit (an upside-down 0 is 0, manual B52);
  Sideways: a nonzero digit and fractions on; Exponent: powers (^) unlocked and the chosen colour has a digit in
  Resources (XIII-B-9 comment (c): picking a colour with no digits is illegal; only colours with digits are shown);
  Powers of Ten: a 1; Number of Factors / Smallest Prime: a ×; LCM / Percent: a √ (Percent also needs fractions on);
  GCF / Decimal Point: a ^ (Decimal also needs fractions on); Multiple of k, Factorial, Base m: two digits.
  Locked operations sit in Forbidden, so a card that needs a locked cube is never offered.
- **Creatures:** only creatures with 4 stars or more (Ollie, Mondo, Splosh, Blaze, Hex, Messy) pick Middle cards; weaker
  ones never do but play correctly when the kid picks one (their search uses the card, they are just less clever with it).
- **Parent corner:** one on/off switch per card (all 19), plus the existing master switch.

### The fourteen cards: rule, how the game reads it, and judgment calls

In the tables, ⚠ marks a judgment call or a deviation from the official rule.

**Average** (XIII-B-11; examples XIII-A-12). Official: + no longer adds; it averages two numbers.
- Game: every + (Goal and Solution) is the average; the builder writes it as "+ average". 7 + 9 = 8; 5 + (4 × 2) = 6.5.
- ⚠ A chain like 4 + 6 + 9 has two official values ((4+6)+9 = 7, 4+(6+9) = 5.75); the game reads left to right (7)
  and shows the value, as for the order of operations (section 4, #2). Parentheses give the other reading.
- ⚠ With fractions switched off, an average must come out whole (like division).
- Manual VII-C-5-f example (b): a Solution that only works if + adds is wrong. The feedback says so.

**Upside-down** (XIII-B-2; examples XIII-A-2). Official: a number cube upside-down is its additive inverse.
- Game: tap a number cube in the builder to turn it; it is drawn upside-down with "−3" underneath. Goal and Solution.
- A turned cube is a number by itself: it cannot touch another digit (PDF "62 is not legal"; manual B48, B49, E33, E34).
- An upside-down 0 is 0, so 0 is not offered for turning (manual B52 says it can't even be told apart).
- One 2 upright and another upside-down is fine (manual E32). The placement on the mat binds nobody (manual C31).
- ⚠ Powers and roots still follow the Elementary "General Rule" (section 3): (−2)^2 is refused, although the manual's
  B62/E53 allow negative bases in Middle. Kept for one rule set and exact whole-number powers.

**Sideways** (XIII-B-1; examples XIII-A-1). Official: a nonzero number cube sideways is its reciprocal.
- Game: tap to turn; drawn on its side with "1/3" underneath. 1 + 2 + ½ = 3.5; 1 ÷ ⅓ = 3. A sideways 0 is never allowed.
- Same "number by itself" rule (manual B45, E30), mixed use fine (E29).
- ⚠ Only offered with fractions on (a sideways cube IS a fraction). Both turns at once (allowed when Upside-down and
  Sideways are both chosen) never happens: one card per shake.

**Exponent Colour** (XIII-B-9; VII-B-6-b-iii). Official: a numeral on a cube of the chosen colour may be an exponent
without a ^ cube; it applies to the numeral right before it unless grouped.
- Game: in a Solution, a digit of that colour tapped right after a number goes in as its exponent (drawn small and raised,
  labelled "power"); tap it to bring it down. In the Goal it goes in plain (Appendix A's default for two digits) and a
  tap raises it. 5² = 25; (5²)³, never 5^(2^3) (PDF (c)); 4 + 3² = 13 (E50); Goal 25 then a red 3 = 25³ (PDF (a)).
- Only a cube of that colour can be an exponent (checked in `checkSolution` with the colour's cube ids).
- ⚠ The PDF calls some mixes ambiguous (manual E54, E55: √5!², ×12²); the game reads every postfix sign (exponent, !)
  as binding tightest, so √9² = √(9²), and shows the value.
- ⚠ Technical: which cubes have the colour is fixed, but their zone changes with every move. While this card is in play
  `G.fractions` is a live value that adds fresh per-zone counts each time it is read (see `makeLive` in
  `js/variations.js`). Everything else stays plain data.

**Multiple of k** (XIII-B-7; manual E58–E61). Official: the Solution must not equal the Goal but differ from it by a
nonzero whole multiple of k (k = 6 to 11); the Goal must be between −1000 and 1000.
- Game: exactly that, including fractional Goals (Goal ½, Solution 6½ is fine; a whole number never is, E60). The
  builder says "= 11: that is 6 away from the Goal, a multiple of 6. It counts!" and refuses a Solution equal to the Goal.
- The solver (and so hints, Now!, Impossible! and the creatures) looks for any value that qualifies.

**Powers of Ten** (XIII-B-10 "Powers of the Base"). Official: a 1 may stand for any integral power of ten (10, 100, …,
0.1, 0.01, …); inside a two-digit numeral it is just 1.
- Game: tap a 1 to cycle 1 → 10 → 100 → 1000 → 0.1 → 0.01 → 0.001. Two 1s may be different powers (E57).
- ⚠ "Any power" is unbounded; the checker's own limit (numbers past ±1,000,000 are refused, section 4 #9) makes it
  10^−6 … 10^6, and the solver searches all of those, so "impossible" stays truthful within the game's limits. The
  builder's tap cycle stops at 1000 and 0.001 (larger ones are never useful with these cubes).
- ⚠ With fractions off, only 10, 100, … (no 0.1).
- A turned 1 can't glue into a two-digit number (the official "it stands for 1" inside a numeral).

**Factorial** (XIII-B-4; examples XIII-A-4; manual E44–E46). Official: two ! signs for the whole Equation, written in,
in the Goal and/or the Solution.
- Game: a "!" button in both builders; the Goal and the Solution share the two (the chip says how many are left).
  5 × 4 ÷ 0! = 20; (8 − 5)! + 2 = 4! ÷ 3; 3!! = 720; a Solution of just 5! is one cube (E44).
- ⚠ **Deviation:** officially the Equation-writer may add ! to the Goal when writing (the PDF reads the Goal 9 ÷ 8 as
  9! ÷ 8!). In the game the Goal-setter places any ! when setting the Goal, and that Goal is fixed for everyone (the same
  choice as section 4 #3: one clear Goal value on screen). Solution-writers can't add ! to the Goal.
- ⚠ 9! (362,880) is the biggest factorial the checker allows; 10! is past its limit.
- ⚠ The PDF calls 4 + ×7! and √9! ambiguous (E41, E46); the game reads ! as binding to the number right before it,
  before √ or ×: √9! = √(9!).

**Number of Factors** (XIII-B-8; examples XIII-A-11; manual B55, C33, E39, E40). Official: ×A = how many counting
numbers divide A (A a counting number, ≤ 1000 in Middle); × still multiplies; the place decides.
- Game: a × with no number in front of it counts factors (start, after an operation, after "("); otherwise it
  multiplies. The builder labels it "# factors". ×(6 × 2) = 6; ××12 = 4; 3××7 = 6; ×4×2 = 6; ×(5^4) = 5.

**Smallest Prime** (XIII-A-13). Official: ×A = the smallest prime bigger than A (A rational, ≤ 200).
- Game: same place rule as Number of Factors, labelled "next prime". ×7 = 11; ×(9 ÷ 2) = 5; ×(0 − 3) = 2; ×××9 = 17.

**LCM** (XIII-A-9; manual C35, E47). Official: √ between two counting numbers may be their least common multiple; the
writer must mark which √ is LCM (root is the default).
- Game: tap a √ in the builder to switch root ↔ "lcm". 6 lcm 8 = 24; 6 lcm √9 = 6. It binds like a root index.

**GCF** (XIII-A-10; manual E47). Official: ^ may be the greatest common factor of two whole numbers, not both 0; the
writer marks it (exponent is the default).
- Game: tap a ^ to switch power ↔ "gcf". 8 gcf 6 = 2; 5 gcf 0 = 5; 0 gcf 0 is refused. It sits with ^ in the order.

**Percent** (XIII-B-12; examples XIII-A-14; manual C37, E48). Official: an upside-down √ means "percent of"; A and B may
be two-digit numerals in the Goal or Solution.
- Game: tap a √ to turn it upside-down ("percent of"). 25 % 16 = 4; 6 % 8 = 0.48. In a Solution only the numbers right
  next to % may have two digits. ⚠ % sits with × and ÷ in the order (the PDF gives no order). Only with fractions on.

**Decimal Point** (XIII-B-13; examples XIII-A-15; manual C38, E49). Official: ^ may be a decimal point joining at most
three digits; it binds before everything.
- Game: tap a ^ to switch power ↔ "point". 2.5, .25, 12.5, 255. (= 255), .050; 15.25 has four digits and is refused.
  One ^ may be a point and another a power (E49). ⚠ 4^.5 = √4 = 2 officially (XIII-B-13 (a)); the game still refuses a
  fractional exponent (Elementary General Rule, as for Upside-down above). Only with fractions on.

**Base m** (XIII-B-6; manual C42–C44, E62, E63). Official: everything is read in base m (Middle: eight, nine or ten);
two-digit numerals are allowed in Solutions; 8 and 9 don't exist in base eight.
- Game: Base 8 or Base 9. 37 + 5 = 6 ^ 2 in base eight (both 36 in base ten). An 8 or 9 can't be used (a 9 in
  Required makes every Goal impossible, C42). ⚠ Values on screen are shown in base ten, with "(counted in tens)" in the
  builder: an 8-year-old reading base-8 fractions would be lost. ⚠ Base ten is left out (it would only be Two-digit
  Numbers again). ⚠ The owner's list said bases 8, 9, 11, 12: bases eleven and twelve are on the **Junior** list
  (XIII-C-5) and need ^ and √ cubes to act as the digits ten and eleven, so they are not built.

### Left out, and why
- **Base 11 and 12**: Junior division only (above).
- **Combinations of cards** (and the Middle 0 Wild, where 0 may stand for an operation): one card per shake, so
  combinations are neither offered nor tested. The engine flags are independent, but no combination is promised to work.

### How the game reads every new symbol (for parents and other helpers)
Each new meaning is one internal character, so the solver's text still splits into tokens: an upside-down digit is
₀–₉, a sideways digit ①–⑨, an exponent ⁰–⁹, a power of ten T H K W V Z (10…10⁶) and t h k w v z (0.1…10⁻⁶), and the
operations a (average), % (percent), g (GCF), l (LCM), f (number of factors), p (smallest prime), . (decimal point),
! (factorial, not a cube). `Eq.cubeOf(symbol)` says which cube face each one uses; `Eq.OPDEF` in `js/engine.js` is the
operator table (see docs/handoff/vari2.md for how to add an operator).

---

## 7. HOUSE RULES: the two bonus dice and the Twist deck (NOT part of the official game)

**Everything in this section is a house rule Tata asked for. It is not in the AGLOA rulebook, and nothing here
changes a shake that has no bonus die or Twist card.** The kid earns two twenty-sided dice and a deck of Twist
cards with skill points, for higher levels of play. (The Twist deck used to be a third die; Tata found a die that
stays at the side confusing, so it became a deck of cards with exactly the same cards and odds.) Code: `js/bonus.js`
(dice, deck, unlocking, lessons, Parent corner), the `BONUS` block in `js/engine.js` (the maths), `js/three/table.js`
(the 3D icosahedra and the Twist deck on its stand). Tests: block "BONUS DICE" in `tests/engine.test.js`.
Developer notes: `docs/handoff/bonus.md`.

### Earning them (skill, not time; never random)
- Nothing starts until the difficulty ladder reaches its **last stage** (Roots: every operation unlocked), or Tata
  switches everything on. From that moment the game counts **skill points** (correct Solutions + correct
  Impossible! calls, the same points the variation cards use):
  **Big-number die after 8 more, Power die after 20, Twist deck after 36.** At one card per 4 points that puts
  the Big-number die around the 6th-7th variation card, the Power die around the 9th-10th and the Twist deck
  around the 13th-14th, so the dice and the cards interleave.
- Old saves: nothing changes until earned (the count starts when the ladder is first seen at its last stage). A save
  that had already earned (or switched off) the Twist die keeps that for the Twist deck (same save key).
- A new die or the deck is announced once, with confetti and a "How it works" lesson, the first shake it plays.
  The first time each Power operation comes up, its own lesson (3 worked examples) pops up once.
- Parent corner: an on/off switch per die and for the deck, an on/off switch per Power operation, and **Unlock
  now** for each.
- Where they play: normal matches against a creature (Cup matches are normal matches, so they include them) and
  pass-and-play. **Not** online (the dice and the deck are not synced), Team-up, Three at the table, the tutorial,
  the daily puzzles, puzzle codes or How Many Ways (all unchanged). Training Camp has a "Bonus dice" tile: Make the
  Goal with a bonus cube in Required, plus every lesson (the Twist deck's too).

### How they enter play
- Each shake the earned, switched-on dice roll out of the cup with the 24 cubes (real physics in 3D).
- **Power die and Big-number die become one extra cube each in Resources** (cubes 25 and 26 of the shake).
  They are cubes in every rule: they can go to Required, Permitted or Forbidden, into the Goal, into a Solution;
  they count for the last-cube rule (one cube left in Resources may be a bonus cube), for "Required must be used",
  for Now! ("at most one more cube from Resources"), for the Goal's 1 to 6 cubes and a Solution's 2 or more.
- A face Tata switched off (or a fraction face while fractions are off) is rolled again, like a locked operation.
- **One Twist card is drawn after the roll** (after any operation cubes are rolled again), before the Goal is set.
  It is not a cube and is never played with: it only sets a rule for this shake. In 3D the deck sits on a small teal
  TWIST stand just outside the right-hand rim, near the player's end; the top card lifts, flips over, comes up to
  the camera so its face can be read, then lies face up next to the deck for the rest of the shake (about 2 seconds,
  once; a tap skips it). On the flat mat a small deck sits in the top bar and the drawn card flips over once. The
  card's name is also on a chip (tap it to read the rule again) and on the stadium big screen; Pip says it in one
  sentence. At the next shake the card goes back into the deck (every shake draws from all 20 cards).

### Big-number die (purple): 20 faces
10, 11, 12, 15, 20, 24, 25, 30, 36, 50, 60, 100, 1000, ½, ¼, ¾, ⅓, ⅔, 1/10, 1½.
- It is ONE number all by itself, never digits: it can't touch a digit cube in a Goal or a Solution
  ("1" next to "12" is not 112). Upside-down, Sideways and Powers of Ten turn digit cubes only, never this die.
- ⚠ Judgment calls: the owner's list is kept except 40 and 75, replaced by **24 (= 4!) and 36 (= 6²)**, which pair
  with the Power die. With Base 8/9 (Twist) the die keeps its ordinary value (12 is twelve): it shows a number, not
  digits. Fraction faces need fractions switched on (otherwise they are rolled again; the checker says so kindly).

### Power die (gold): 20 faces, 18 operations
Each face is a cube face of its own. **Post** = works on the number right before it and binds tightest
(like the Factorial card's !); **pre** = works on the number (or group) right after it, like √; **between** = two numbers.

| Face | Name | Kind | Exact meaning and caps |
|---|---|---|---|
| n! | Factorial | post | whole n only; 0! = 1; **9! is the cap** (the checker's limit). Reuses the Factorial card's maths |
| x² (2 faces) | Squared | post | any number, fractions and negatives too: (½)² = ¼, (2 − 5)² = 9; up to the checker's limit (1,000,000) |
| x³ | Cubed | post | any number: (2/3)³ = 8/27; same limit |
| \|x\| | Distance from 0 | pre | \|2 − 5\| = 3 |
| mod | Mod (remainder) | between, with × ÷ | the Remainder card's maths: counting numbers only, A ≤ 1000. 7 mod 3 = 1 |
| % | Percent of | between, with × ÷ | A % B = A × B ÷ 100 (the Percent card's maths, but no two-digit numerals: a 50 needs the Big-number die) |
| max / min | The bigger / smaller one | between, with × ÷ | any two numbers |
| avg | Average | between, with + − | the Average card's maths; with fractions off it must come out whole |
| gcf | Greatest common factor | between, with ^ | the GCF card's maths: whole numbers, not both 0 |
| lcm | Lowest common multiple | between, with ^ | the LCM card's maths: counting numbers |
| 2× (2 faces) | Double | pre | 2× 7 = 14 |
| ½× | Half | pre | ½× 7 = 3½ (refused with fractions off) |
| −x | Negative | pre | −x 3 = −3. The ONLY way to make a minus sign (the − cube still can't) |
| 1/x | One over | pre | 1/x 4 = ¼; 1/x 0 is refused (division by zero); fractions off: only 1/x 1 |
| √x | Square root | pre | the √ cube's rule: a whole number with a whole root (√9 = 3, √8 refused) |
| Σ | Sum of digits | pre | whole numbers only: Σ 81 = 9 |
| # | How many factors | pre | the Number of Factors card's maths: counting numbers up to 1000 |

⚠ Judgment calls: x² and x³ accept fractions and negatives (always exact), although ^ keeps the Elementary
whole-number rule. The levels "with × ÷", "with + −", "with ^" decide the order when there are no parentheses
(the game reads left to right inside a level and shows the value, as for the order of operations, section 4 #2):
1 + 3 avg 5 = 4½ because it reads (1 + 3) avg 5, while 1 + (3 avg 5) = 5. A pre op grabs the number right after it
**including** a post op on it: −x 3² = −(3²) = −9, √9! = √(9!). The gold op counts as one of the "three operation
signs" of the Three Operations card. With Use It Again the gold operation may be repeated; the Big-number die never.
x² and double appear on two faces each (18 operations, 20 faces).

### Twist deck (teal cards): 20 cards
One card per face of the old Twist die, so the odds are the same.

| Cards | What happens this shake |
|---|---|
| 2 cards: Base 8, Base 9 | **Base 8** / **Base 9** (variation card) |
| 5 cards | **0 is Wild**, **Upside-down**, **Sideways**, **Average**, **Use It Again** (variation cards) |
| 2 cards: Multiple of 6, of 10 | **Multiple of 6** / **Multiple of 10** (variation card) |
| 6 cards | **Exponent Colour** (a random colour that has digits in Resources), **Powers of Ten**, **Two-digit Numbers**, **Remainder**, **Factorial**, **Number of Factors** (variation cards) |
| Golden Goal (2 cards) | **Golden Goal**: every score this shake counts double, for everybody (2 → 4, 4 → 8, 6 → 12) |
| Bonus +2 (2 cards) | **Bonus +2**: a correct Solution that uses a bonus cube scores 2 extra points |
| Free hint (1 card) | **Free hint**: Pip's Hint this shake doesn't cost the "no hint needed" bonus |

Each card shows a big icon (a variation card shows the same icon as its card in the card picker), its name and one
short line, and is marked VARIATION CARD or BONUS TWIST at the bottom.

- **Only cards that can change the shake are drawn.** A variation card can be drawn only if the kid has earned that
  card, Tata left it switched on, and the card's own "can it affect the shake" test passes (section 6); Bonus +2
  needs a bonus cube in play. The other cards stay in the deck this shake. Every card that can be drawn is equally
  likely, which is exactly what the old die did (it was rolled again until it showed such a face). Golden Goal and
  Free hint can always be drawn, so there is always a card.
- **Twist and cards:** when the Twist card is a variation card, **that is this shake's card and nobody picks
  another** (the engine supports one card's rules at a time). When it is a scoring twist, the Goal-setter may
  pick a card as usual; the two never interact.
- Scoring twists never take points away and apply to every player alike (creatures too).
- ⚠ Judgment call: Three Operations, Smallest Prime, LCM, GCF, Percent and Decimal Point are not in the Twist deck
  (Three Operations can feel like a punishment when it is forced on a shake; the others are covered by the Power die).
- ⚠ Judgment call (presentation only, not a rule): the drawn card goes back into the deck at the next shake, so
  every shake draws from the same 20 cards (the odds never drift during a match).

### Creatures and the solver
- Creatures of **4 stars and up** (Ollie, Mondo, Splosh, Blaze, Hex, Messy) prefer Goals with a bonus cube, keep
  bonus cubes out of Forbidden and try to work them into their Solutions. Weaker creatures never put a bonus cube in
  a Goal but play correctly around them (their search sees every cube).
- The solver searches the bonus cubes exactly like the others (hints, Now!/Impossible!, Pip's after-match tip,
  "one way that works"). A search that runs out of time never claims anything: Impossible! hints only come from a
  complete search, and the end-of-shake "I couldn't find one" now adds "(I ran out of searching time, so that does
  not prove there is none)" when the search was cut short.
