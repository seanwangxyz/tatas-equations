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
| 7 | Timers, bonus moves, variations | Full tournament rules | Left out: no timers, bonus moves or Adventurous variations | Not in the seven Basic rules; you asked for no punishing timers |
| 13 | "No Goal" with 3 players | The Third Party may also write an Equation after a "No Goal" challenge | The Third Party is scored as if they chose not to write (6 if the challenger was wrong, 2 if right) | Rare case; the rules allow not writing |
| 14 | Out-of-turn challenges | Anyone may challenge at any moment | People get "can challenge too" buttons after every move; a computer player in the third seat may also challenge out of turn | Same rule, made tappable |
| 8 | Writing an Equation | Players write "Solution = Goal" on paper | Built with tap-to-place cubes; the game checks it instantly | No typing |
| 9 | Very big numbers | No limit | Values past ±1,000,000 (numerator or denominator) are refused as "too big to check" | Keeps the exact arithmetic safe; no Basic Goal comes close |
| 10 | "No Goal" vs the computer | The opponent agrees or challenges | The computer searches for any Goal + Solution. If it finds one it challenges and shows it; if not it agrees | Fair and rules-faithful |
| 11 | Daily puzzle | Not in the rules | A seeded daily roll with a pre-set Goal and Required/Permitted cubes the solver has checked is solvable | Your request |
| 12 | Who may challenge | Anyone, any time | In 2-player play only the next player can challenge, so challenges happen on your turn | With two players, they're the same thing |
