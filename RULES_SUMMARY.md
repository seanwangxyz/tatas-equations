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
| 1 Sideways (a number cube means 1 ÷ that number) | Needs fractions, and a way to show a sideways number cube. Could come after Fractions unlock |
| 2 Upside-down (a number cube means its negative) | Negative numbers; the game avoids minus signs in front of numbers |
| 4 Factorial (two ! signs, written in) | ! is not a cube, and the writer may also put ! into the **Goal** (the rules' example reads the Goal 9 ÷ 8 as 9! ÷ 8!), so the Goal's value would change with the writer. Numbers get huge fast |
| 9 LCM, 10 GCF, 11 Number of Factors (2026-27 list) | They give √, ^ and × a second meaning; middle-school ideas; confusing next to the normal meaning |
| 12–15 Average, Smallest Prime, Percent, Decimal Point | The even-year list: not played in Elementary in 2026-27 |

### When cards unlock (house rule, not in the rulebook)
- Cards start only after the basics: the first card arrives when the ladder reaches **Fractions**
  (that is, after + − × ÷ have earned their stars), or straight away if Tata switched the ladder off.
- Then one new card for every **4 skill points** (correct Solutions plus correct Impossible! calls), in this
  order: Two-digit Numbers, Use It Again, 0 is Wild, Three Operations, Remainder.
- A new card is announced once, calmly, the next time a Goal is set.
- A creature only picks cards the kid has already unlocked.
- Parent corner switch "Variation cards" turns them all off (see docs/handoff/variations.md).
