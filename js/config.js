'use strict';

// ----- Settings Tata can change -----
// "Beat Tata's Record" badge: points needed in ONE match against the computer.
// (Each shake is worth 2, 4 or 6 points, so a 3-shake match tops out at 18.)
var TATA_RECORD = 16;

var SAVE_KEY = 'tatasEquations.v1';
// Online-play testing on one computer (?onlinetest=1&p=b): each test tab gets its own pretend player and save.
if (/[?&]onlinetest=1(&|$)/.test(location.search)) SAVE_KEY += '.test.' + ((location.search.match(/[?&]p=([a-z0-9]{1,8})(&|$)/) || [])[1] || 'a');

// Difficulty ladder. "need" = skill stars (correct Solutions / correct challenges) to unlock the next stage.
var STAGES = [
  { id: 'addsub', name: 'Adding & Subtracting', icon: '➕', ops: ['+', '-'], fractions: true, need: 5, maxGoal: 20 },
  { id: 'muldiv', name: 'Times & Divide', icon: '✖️', ops: ['+', '-', '*', '/'], fractions: true, need: 6, maxGoal: 40 },
  { id: 'frac', name: 'Bigger Goals', icon: '🎯', ops: ['+', '-', '*', '/'], fractions: true, need: 6, maxGoal: 50 },
  { id: 'pow', name: 'Powers', icon: '🚀', ops: ['+', '-', '*', '/', '^'], fractions: true, need: 6, maxGoal: 80 },
  { id: 'root', name: 'Roots', icon: '🌱', ops: ['+', '-', '*', '/', '^', 'r'], fractions: true, need: 0, maxGoal: 99 }
];
var UNLOCK_LESSONS = {
  muldiv: [
    { t: '× means "groups of". 3 × 4 = 12, which is 3 groups of 4.', e: '3*4' },
    { t: '÷ means "share equally". 12 ÷ 3 = 4.', e: '8/2' },
    { t: '× and ÷ happen BEFORE + and −. So 2 + 3 × 4 = 14.', e: '2+3*4' },
    { t: 'Parentheses change the order: (2 + 3) × 4 = 20.', e: '(2+3)*4' }
  ],
  frac: [
    { t: 'Now divisions don\'t have to come out even! 7 ÷ 2 = 3½.', e: '7/2' },
    { t: 'Fractions can add up to whole numbers: 1 ÷ 2 + 1 ÷ 2 = 1.', e: '1/2+1/2' },
    { t: 'A Goal can be a fraction too, like 3 ÷ 4.', e: '3/4' },
    { t: 'The game checks every number exactly. No rounding, ever!', e: '1/3*3' }
  ],
  pow: [
    { t: '^ means "times itself". 2 ^ 3 = 2 × 2 × 2 = 8.', e: '2^3' },
    { t: '3 ^ 2 = 9. And any number ^ 0 = 1!', e: '3^2' },
    { t: 'Powers happen before ×, ÷, + and −. So 1 + 2 ^ 3 = 9.', e: '1+2^3' },
    { t: 'Powers only use whole numbers: no fractions or negatives here.', e: '5^2' }
  ],
  root: [
    { t: '√ undoes squaring: √9 = 3, because 3 × 3 = 9.', e: 'r9' },
    { t: 'A number in front picks the root: 3√8 = 2, because 2 × 2 × 2 = 8.', e: '3r8' },
    { t: '√ only works when the answer is whole: √4, √9, √16, √25…', e: 'r(1+3)' },
    { t: '√ grabs just the number right after it: √4 + 5 = 7.', e: 'r4+5' }
  ]
};

// Skill settings per creature (checked with tests/playtest.js):
//   seeNow / seeImp = chance per turn that it notices a Now! or Impossible! chance;
//   smart = chance it checks its move is safe; maxDigits = how long a Solution it can find
//   (counted in number cubes); tip = the one-line hint shown on its card in the opponent picker.
//
// Snoozy and Penny each have one clear BLIND SPOT instead of random carelessness, so that
// beating each one teaches the kid one real skill (the playtest has a "Kid who knows the trick"
// to prove it). The flags below are read by the computer player's decisions in js/ai.js.
//   style 'shortsighted' (Snoozy): shortView = true. Snoozy only thinks about Solutions with two
//     number cubes and one operation (like 3 + 4): maxDigits is 2 and it uses that same short view
//     everywhere: spotting Now!, judging whether the Goal is still possible, checking its own
//     moves, picking Goals it can solve itself, and writing a Solution. It trusts its view, so
//     "I can't find one" means "Impossible!", and it will call Impossible! when a longer Solution
//     exists (the kid wins 6 by showing it). Lesson: longer Solutions beat Snoozy.
//   style 'no-impossible' (Penny): callsImpossible = false (never challenges Impossible!, not even
//     after the last cube) and keepGoal = false (never checks that her own move keeps the Goal
//     possible). She DOES notice Now! reliably (seeNow high, normal 3-number view) and always
//     checks that her move doesn't hand the opponent a Now! (smart = 1).
//     Lesson: be careful what you leave in Required/Permitted; risky moves that make the Goal
//     harder are safe against Penny; when Penny makes the Goal impossible, call Impossible! yourself.
//
// Math tastes: taste = one line for the opponent picker; likes = what it prefers (explained at the top
// of js/ai.js). A taste only picks between moves, Goals and Solutions it already finds good, so it does
// not change how strong the creature is, and a taste for a locked operation simply doesn't show yet.
var OPPONENTS = [
  { id: 'snoozy', name: 'Snoozy', title: 'the Sleepy Sloth', emoji: '🦥', color: '#d3f9d8', stars: 1, style: 'shortsighted', shortView: true, maxDigits: 2, timeMs: 150, seeNow: 0.75, seeImp: 0.45, smart: 1, goalCubes: 1, goalMax: 12, tip: 'Snoozy only spots short Solutions.', taste: 'Loves + and small numbers.', likes: { syms: ['+', '1', '2', '3'], ops: ['+'], sol: [['+']] },
    think: ['Zzz… oh! Is it my turn?', 'Slooowly thinking…', '*yawn* Let me see…'], now: '*yawn*… NOW!', imp: 'Zzz… IMPOSSIBLE!', goal: 'Here is a Goal… *yawn*', lose: 'Zzz… you got me! Good game!', win: 'I won? While napping?' },
  { id: 'penny', name: 'Penny', title: 'the Puzzle Penguin', emoji: '🐧', color: '#d0ebff', stars: 2, style: 'no-impossible', callsImpossible: false, keepGoal: false, maxDigits: 3, timeMs: 250, seeNow: 0.9, seeImp: 0, smart: 1, goalCubes: 2, goalMax: 25, tip: 'Penny never calls Impossible!', taste: 'Loves taking away with −.', likes: { syms: ['-'], ops: ['-'], sol: [['-']] },
    think: ['Waddle, waddle… thinking!', 'Hmm, chilly choices…', 'Let me slide this over…'], now: 'Flippers up: NOW!', imp: 'Brrr… IMPOSSIBLE!', goal: 'Try this Goal on for size!', lose: 'Great waddling! You win!', win: 'Penguin power!' },
  { id: 'fox', name: 'Rusty', title: 'the Clever Fox', emoji: '🦊', color: '#ffd8a8', stars: 3, tip: 'Rusty spots Now! chances fast. Do not leave him an easy one.', taste: 'Loves × and ÷.', likes: { syms: ['*', '/'], ops: ['*', '/'], sol: [['*', '/'], ['*'], ['/']] }, maxDigits: 4, timeMs: 350, seeNow: 0.55, seeImp: 0.5, smart: 0.7, goalCubes: 3, goalMax: 40,
    think: ['Hmm… a sly move…', 'Let me sniff this out…', 'Foxy thinking…'], now: 'Gotcha! NOW!', imp: 'Sneaky… IMPOSSIBLE!', goal: 'A clever Goal for you!', lose: 'Outfoxed! Well played!', win: 'Too clever for you this time!' },
  { id: 'owl', name: 'Ollie', title: 'the Wise Owl', emoji: '🦉', color: '#e5dbff', stars: 4, tip: 'Ollie almost never misses. Plan two moves ahead.', taste: 'Loves prime numbers: 2, 3, 5, 7, 11, 13…', likes: { syms: ['2', '3', '5', '7'], goal: 'prime', sol: [['7'], ['5']] }, maxDigits: 5, timeMs: 500, seeNow: 0.8, seeImp: 0.75, smart: 0.9, goalCubes: 3, goalMax: 60,
    think: ['Hoo-hoo… let me think…', 'Wise moves only…', 'Hmm, hoo…'], now: 'Hoo! NOW!', imp: 'Hoo-hoo… IMPOSSIBLE!', goal: 'A wise Goal…', lose: 'Hoo! You are wise indeed!', win: 'Wisdom wins today!' },
  { id: 'wizard', name: 'Mondo', title: 'the Math Wizard', emoji: '🧙', color: '#fff3bf', stars: 5, tip: 'Mondo sees everything. Check every move twice.', taste: 'Loves powers ^ and roots √ (once you unlock them).', likes: { syms: ['^', 'r'], goal: 'pow', ops: ['^', 'r'], sol: [['^', 'r'], ['r'], ['^']] }, maxDigits: 5, timeMs: 700, seeNow: 1, seeImp: 0.95, smart: 1, goalCubes: 3, goalMax: 99,
    think: ['By my beard… let me think…', 'Abraca-math…', 'The cubes whisper to me…'], now: 'Abracadabra… NOW!', imp: 'By my beard… IMPOSSIBLE!', goal: 'Behold, a Goal!', lose: 'You have out-wizarded the Wizard!', win: 'Magic and math win again!' },
  // ---- Monster League (opponents 6-10). Each uses the 3D model in the same slot of the monsters pack. ----
  { id: 'grub', name: 'Grub', title: 'the Grumpy Puglin', emoji: '🐽', color: '#ffdeeb', stars: 3, style: 'careless', maxDigits: 4, timeMs: 400, seeNow: 0.7, seeImp: 0.6, smart: 0.8, goalCubes: 3, goalMax: 50, tip: 'Grub is as sharp as Rusty, but he still rushes now and then.', taste: 'Loves big numbers, smashed together with + and ×.', likes: { syms: ['+', '*', '7', '8', '9'], goal: 'big', ops: ['+', '*'], sol: [['*', '+'], ['*'], ['9']] }, think: ['Hmph. Thinking.', 'Grumble, grumble…', 'Snort. Let me look.'], now: 'Snort! NOW!', imp: 'Hmph! IMPOSSIBLE!', goal: 'Here. A Goal. Hmph.', lose: 'Hmph! Fine. You played well.', win: 'Ha! Even grumpy, I win!' },
  { id: 'splosh', name: 'Splosh', title: 'the Careful Puglin', emoji: '🐷', color: '#d0ebff', stars: 4, style: 'careful', maxDigits: 5, timeMs: 500, seeNow: 0.8, seeImp: 0.9, smart: 0.95, goalCubes: 3, goalMax: 60, tip: 'Splosh checks everything twice. Her weak spot: a Now! she is not expecting.', taste: 'Loves even numbers and neat, tidy answers.', likes: { syms: ['2', '4', '6', '8'], goal: 'even', sol: [['2'], ['4'], ['6']] }, think: ['Carefully, carefully…', 'Let me check twice…', 'Hmm, is that safe?'], now: 'Oh! Oh! NOW!', imp: 'I checked twice: IMPOSSIBLE!', goal: 'A careful little Goal!', lose: 'Oh my! You were too good!', win: 'Careful wins the cup!' },
  { id: 'blaze', name: 'Blaze', title: 'the Fiery Imp', emoji: '👹', color: '#ffc9c9', stars: 5, style: 'pouncer', maxDigits: 5, timeMs: 600, seeNow: 1, seeImp: 0.9, smart: 0.95, goalCubes: 3, goalMax: 80, tip: 'Blaze never misses a Now! Do not leave him one.', taste: 'Loves doubles and square numbers: 4, 9, 16, 25…', likes: { syms: ['2', '^', '*'], goal: 'square', sol: [['^', '2'], ['*', '2'], ['+']] }, think: ['Quick, quick, quick!', 'Fire it up…', 'Fast feet, fast brain!'], now: 'Sizzle! NOW!', imp: 'Smoke and ash… IMPOSSIBLE!', goal: 'A red-hot Goal!', lose: 'Whoa! You put my fire out!', win: 'Too hot to handle!' },
  { id: 'hex', name: 'Hex', title: 'the Tricky Imp', emoji: '👺', color: '#d3f9d8', stars: 5, fire: 1, style: 'trickster', maxDigits: 5, timeMs: 700, seeNow: 1, seeImp: 0.95, smart: 1, goalCubes: 4, goalMax: 99, tip: 'Hex is as strong as Mondo and sets longer, sneakier Goals.', taste: 'Loves ÷, and fractions once you unlock them.', likes: { syms: ['/'], goal: 'div', ops: ['/'], sol: [['/']], frac: true }, think: ['Hee hee… a trick…', 'Let me twist this…', 'Sneaky, sneaky…'], now: 'Hee hee! NOW!', imp: 'Tricked you… IMPOSSIBLE!', goal: 'A twisty Goal for you!', lose: 'Out-tricked! How did you do that?', win: 'Tricks win the match!' },
  { id: 'zog', name: 'Messy', title: 'the Messy Imp King', emoji: '😈', color: '#e5dbff', stars: 5, fire: 2, style: 'boss', maxDigits: 6, timeMs: 900, seeNow: 1, seeImp: 1, smart: 1, goalCubes: 5, goalMax: 99, tip: 'King Messy looks like a mess but misses nothing and sets the hardest Goals in the game.', taste: 'A bit of everything, and the longest Goals.', likes: { syms: ['+', '-', '*', '/', '^', 'r'], goal: 'long', mix: true }, think: ['The King considers…', 'Royal thinking…', 'Silence! I am counting.'], now: 'By my crown… NOW!', imp: 'The King declares: IMPOSSIBLE!', goal: 'A Goal fit for a king!', lose: 'I bow to you. Take the crown!', win: 'Long live the King!' },
  // ---- CAREER: Legend League (opponents 11-15), code-built creatures (js/three/creatures/classic.js) ----
  // Every one plays like King Messy (sees everything) and adds the new skills read by js/ai.js:
  //   sure = 1: never guesses Impossible!; when its quick search is not finished it thinks longer first.
  //   wide = 1: looks at every cube for its move, not just a few.
  //   trap = chance per move to look one move further: "after my move, can my opponent still make a safe move?"
  //          and prefer the move that leaves the fewest safe answers (only near the end of a shake; trapMs = how long).
  //   moveMs = how long it checks each move for "does this hand my opponent a Now!?" (the others use 90 ms).
  //   timeMs is also a little higher than King Messy's: it searches longer for a Now! or a Solution.
  // sig = its SIGNATURE RULE (js/career.js): announced before the match, shown on its card. Built only from rules
  //   the engine already has (a variation card, a bonus die). light = only on shakes where it sets the Goal.
  { id: 'bleep', name: 'Bleep', title: 'the Busy Robot', emoji: '🤖', color: '#c5f6fa', stars: 5, fire: 2, style: 'robot', maxDigits: 6, timeMs: 1000, seeNow: 1, seeImp: 1, smart: 1, sure: 1, wide: 1, trap: 0.3, trapMs: 600, moveMs: 150, goalCubes: 5, goalMax: 99,
    sig: { kind: 'card', card: 'multiops' }, tip: 'Bleep never guesses. Every match with Bleep uses the Use It Again card.', taste: 'Loves doing the same thing again and again: + + +.', likes: { syms: ['+', '*', '1'], ops: ['+', '*'], sol: [['+', '+'], ['*', '*'], ['+']] },
    think: ['Bleep. Computing…', 'Whirr, whirr…', 'Loading clever move…'], now: 'Bleep bloop: NOW!', imp: 'Error 404: IMPOSSIBLE!', goal: 'Goal printed! Bleep!', lose: 'Bleep… you win! Rebooting.', win: 'Task complete. Bleep!' },
  { id: 'flip', name: 'Flip', title: 'the Upside-down Bat', emoji: '🦇', color: '#e5dbff', stars: 5, fire: 2, style: 'bat', maxDigits: 6, timeMs: 1050, seeNow: 1, seeImp: 1, smart: 1, sure: 1, wide: 1, trap: 0.5, trapMs: 700, moveMs: 200, goalCubes: 5, goalMax: 99,
    sig: { kind: 'card', card: 'upside' }, tip: 'Flip sees the world upside-down: every match with Flip uses the Upside-down card.', taste: 'Loves taking away, and numbers below zero.', likes: { syms: ['-', '9', '6'], ops: ['-'], sol: [['-', '-'], ['-']] },
    think: ['Hanging around… thinking…', 'Let me look at it upside-down…', 'Flap… flap… hmm.'], now: 'Swoop! NOW!', imp: 'Topsy-turvy… IMPOSSIBLE!', goal: 'A Goal from the ceiling!', lose: 'You turned me right side up! Well played!', win: 'Upside-down and on top!' },
  { id: 'squiggle', name: 'Squiggle', title: 'the Eight-Armed Octopus', emoji: '🐙', color: '#ffd8e8', stars: 5, fire: 3, style: 'octopus', maxDigits: 6, timeMs: 1100, seeNow: 1, seeImp: 1, smart: 1, sure: 1, wide: 1, trap: 0.7, trapMs: 800, moveMs: 250, goalCubes: 5, goalMax: 99,
    sig: { kind: 'card', card: 'basem', set: { base: 8 } }, tip: 'Squiggle has eight arms, so Squiggle counts in eights: every match uses Base 8.', taste: 'Loves eights, and two-cube numbers.', likes: { syms: ['8', '4', '2', '*'], ops: ['*'], sol: [['*'], ['2']] },
    think: ['Eight arms, eight thoughts…', 'Blub… thinking…', 'Squiggle, squiggle…'], now: 'All eight arms up: NOW!', imp: 'Blub blub… IMPOSSIBLE!', goal: 'A wiggly Goal for you!', lose: 'Eight cheers for you! You win!', win: 'Eight arms beat two!' },
  { id: 'nugget', name: 'Nugget', title: 'the Treasure Dragon', emoji: '🐉', color: '#fff3bf', stars: 5, fire: 3, style: 'dragon', maxDigits: 6, timeMs: 1200, seeNow: 1, seeImp: 1, smart: 1, sure: 1, wide: 1, trap: 0.85, trapMs: 900, moveMs: 300, goalCubes: 5, goalMax: 99,
    sig: { kind: 'bonus', die: 'power' }, tip: 'Nugget guards a golden treasure: every match with Nugget has the gold Power die in it.', taste: 'Loves gold: the Power die, and powers ^.', likes: { syms: ['^', '*'], goal: 'pow', ops: ['^'], sol: [['^'], ['*']] },
    think: ['Counting my treasure…', 'Hmm, shiny thoughts…', 'A dragon never rushes.'], now: 'ROAR! NOW!', imp: 'Smoke rings say… IMPOSSIBLE!', goal: 'A golden Goal!', lose: 'You may keep a gold coin. You won it!', win: 'My treasure stays with me!' },
  { id: 'chroma', name: 'Chroma', title: 'the Chameleon Queen', emoji: '🦎', color: '#d3f9d8', stars: 5, fire: 4, style: 'chameleon', maxDigits: 6, timeMs: 1300, seeNow: 1, seeImp: 1, smart: 1, sure: 1, wide: 1, trap: 1, trapMs: 1000, moveMs: 350, goalCubes: 5, goalMax: 99,
    sig: { kind: 'shuffle' }, tip: 'Queen Chroma changes colour AND rules: a different variation card every shake. The final boss!', taste: 'Loves change: a bit of everything, and long Goals.', likes: { syms: ['+', '-', '*', '/', '^', 'r'], goal: 'long', mix: true },
    think: ['The Queen changes her mind…', 'New colour, new idea…', 'Shh. Blending in. Thinking.'], now: 'Colour change… NOW!', imp: 'In every colour: IMPOSSIBLE!', goal: 'A Goal in a new colour!', lose: 'You saw through all my colours! You win!', win: 'The Queen keeps her crown… and her colours!' }
];
// CAREER: light signatures for the two older league bosses (only on shakes where they set the Goal).
OPPONENTS[4].sig = { kind: 'card', card: 'twodigit', light: true };
OPPONENTS[9].sig = { kind: 'card', card: 'threeops', light: true };
var CREATURE_KINDS = ['sloth', 'penguin', 'fox', 'owl', 'wizard'], JERSEYS = ['1', '4', '9', '8', '99', '2', '5', '11', '13', '10', '3', '6', '88', '12', '21'];
// CAREER: the Legend League's own code-built kinds (opponents 11-15; js/three/creatures/classic.js builds them).
var CAREER_KINDS = ['robot', 'bat', 'octopus', 'dragon', 'chameleon'];
var LEAGUE = 5; // creatures per league: 0-4 classic, 5-9 monsters, 10-14 Legend League (CAREER)
var LEAGUE_NAMES = ['Classic League', 'Monster League', 'Legend League']; // CAREER
function leagueOf(i) { return Math.floor(i / LEAGUE); }                   // CAREER: 0, 1 or 2
function isLeagueBoss(i) { return (i + 1) % LEAGUE === 0; }               // CAREER: 4, 9, 14
// An opponent is open if it starts a league or the one before it has been beaten.
function oppOpen(i) { return i % LEAGUE === 0 || !!S.beaten[i - 1]; }
function oppStars(o) { return '★'.repeat(o.stars) + '<span style="opacity:.3">' + '★'.repeat(5 - o.stars) + '</span>' + (o.fire ? ' ' + '🔥'.repeat(o.fire) : ''); }
// Creature attitude. All of it is playful teasing between friends: never about being bad at math.
// Match flow: gloat / sore = after a shake; trash = while playing (Settings switch); bluff = claims that may or may
// not be true (Settings switch, off by default).
// Situational: greet = match start; kidGoodMove = grudging respect after the kid does well; kidChallenge = nervous when
// the kid calls Now!/Impossible!; kidWrong = kind and encouraging after the kid's mistake (never gloating);
// close = tight match; lastCube = the last cube is about to be played.
// Math tastes (js/ai.js): tasteGoal = it set a Goal it likes; tasteMove = it put a favourite cube in Required/Permitted;
// tasteSol = its Solution uses its favourite math; tasteFrac (Hex) = its Solution went through a fraction.
// reply = answers to the kid's emotes, keyed by emote type: friendly, cheeky, think (an object, not an array:
// use Social.reactionFor(emoteId) rather than talkLine(o, 'reply')).
var TALK = {
  snoozy: {
    gloat: ['I won that one… in my sleep!', 'Zzz… oh, did I win? Nice.', 'Best nap AND a win!', 'I scored while dreaming. Cozy!', 'Slow and steady… and ahead!', '*yawn* Another goal for the keeper.', 'Winning is easy when you\'re relaxed.', 'That was my best snooze-play yet.'],
    sore: ['Aww… I need a nap after that.', 'No fair, I was resting my eyes!', '*sniff* Good one.', 'Zzz… you got me. Nicely done!', 'My pillow was in the way!', 'I\'ll beat you after a snack. And a nap.', 'Great goal! I\'ll clap… tomorrow.', 'Okay okay, you woke me up!'],
    trash: ['*yawn* Wake me when it gets tricky.', 'I can play with my eyes closed. They ARE closed.', 'Slow and steady wins the shake…', 'Is it nap time yet?', 'I\'m playing at full speed. This is full speed.', 'I\'ll take my time. All of it.', 'Tick tock… zzz… tick tock…', 'Number 1 never rushes!'],
    bluff: ['Careful… I\'m one cube away from Now!', 'Hmm, this Goal looks impossible to me…', 'I dreamed the Solution already.', 'I think I see something. Or it\'s a sheep.', 'I could say Now! any second. Maybe.', 'This Goal? Pretty sure it can\'t be made. Zzz.', 'My dream said "Impossible!" Hmm.', 'I have a secret plan. I forgot it, though.'],
    greet: ['*yawn* Oh, hi! Ready to play?', 'Zzz… huh? Kick-off already?', 'Let\'s have a nice, slow game.', 'I\'m in goal. I mean, in the game. Hi!', 'Good luck! I brought my pillow.'],
    kidGoodMove: ['Ooh, that was clever. *yawn* Wow.', 'Nice move! I\'m awake now.', 'Hey, that was good!', 'Whoa. Did you plan that?', 'Zzz… I mean, great play!'],
    kidChallenge: ['Uh oh… I\'m suddenly awake.', 'Eek! Okay, let\'s see…', 'Ooh, a challenge! My nap is ruined.', 'Gulp… let me check…', 'Wait wait, I\'m still waking up!'],
    kidWrong: ['That\'s okay! Try again, you can do it.', 'So close! Have another go.', 'No worries. Even I trip over my own paws.', 'It happens! Take your time. I\'m slow too.', 'Good try! Your next one will be great.'],
    close: ['Wow, so close… I\'m wide awake!', 'It\'s a tight one! Who needs naps?', 'Neck and neck! Ooh, exciting.', 'This is the most awake I\'ve ever been.', 'Tied-ish! Don\'t blink. I will, though.'],
    lastCube: ['Last cube! Don\'t wake me for the rest.', 'Final cube… *gasp* so exciting.', 'The last cube! Let\'s see who dreams of this.', 'One cube left. I\'m very awake.', 'Last one! Ready, set, zzz… GO!'],
    tasteGoal: ['I can add my way to this one. Cozy.', 'Little numbers are the comfiest.', 'Here is a small one. Like a pillow.'],
    tasteMove: ['Small and cozy. I like it.', 'Plus is my favourite. So comfy.', 'Little cubes for a sleepy sloth.'],
    tasteSol: ['I just added it up. Easy peasy… zzz.', 'Plus, plus, done. Nap time!', 'Adding is the comfiest math.'],
    reply: {
      friendly: ['Aww, thanks! You\'re nice. Zzz.', 'Good one! High five. Slowly.', 'You\'re a great opponent. Wait, teammate. Both!', 'Thank you! I\'ll nap happy tonight.'],
      cheeky: ['Ha! Bring it on. Slowly.', 'Ooh, spicy! I\'ll answer after a yawn.', 'Cheeky! I like it. *yawn*', 'You do your thing. I\'ll do my nap.'],
      think: ['Hmm… I\'m thinking too. Zzz.', 'Take your time! I will.', 'Ooh, big thoughts. Me too. Mostly.']
    }
  },
  penny: {
    gloat: ['Ice cold! That\'s how penguins play!', 'Slide, slide, WIN!', 'Flippers up for me!', 'That one was a cool customer. Me!', 'Waddle I say? Good game, me!', 'Chilling at the top of the table!', 'Scored on ice. Smooth!', 'Penguin power, activated!'],
    sore: ['My flippers slipped!', 'Brrr… you got me.', 'That was a fishy move. A good one!', 'You\'re too cool for me! Nice one.', 'I got the cold shoulder. Well played!', 'Oh, snow way! Great job.', 'That slid right past me!', 'Okay, you\'re ice. Er, nice!'],
    trash: ['Waddle you do now?', 'Your move gave me chills… of joy!', 'Stay cool. I know I will.', 'This game is a breeze. An arctic one.', 'I\'m on thin ice? More like thick ice!', 'Let\'s break the ice… with a Solution.', 'You\'ll need more than flippers for that.', 'Number 4 never melts under pressure.'],
    bluff: ['I already see a Solution. Do you?', 'One more cube and I say Now!', 'This one can\'t be made. Probably.', 'I have a cool trick up my flipper.', 'Is that Goal even possible? Hmm, hmm.', 'I could call Impossible. I\'m just being nice.', 'Careful. Penguins love a surprise.', 'My belly says Now! is close.'],
    greet: ['Hi there! Let\'s make this a cool match!', 'Waddle we play today? Math!', 'Good luck! May the best flipper win.', 'Kick-off! Ice to meet you!', 'Let\'s have fun. And win. Mostly win.'],
    kidGoodMove: ['Cool move! I\'m impressed.', 'Well, that\'s a chilly-good one!', 'Nice slide! I mean, nice move.', 'Hey, that was smooth!', 'Ooh, you\'re on a roll. A snowball!'],
    kidChallenge: ['Brrr! A challenge! I\'m shivering.', 'Uh oh, flippers crossed!', 'Ooh, spicy. Let me check!', 'Hold on, my beak is chattering!', 'Okay okay, let\'s see what you\'ve got!'],
    kidWrong: ['No worries, that happens to all penguins!', 'So close! Slide right back in there.', 'Good try! Try another one.', 'Don\'t let it chill your spirits!', 'It\'s okay! Everyone slips on ice.'],
    close: ['It\'s a nail-biter! Or a flipper-biter.', 'So close! This is getting hot. For a penguin.', 'Tight game! I love it.', 'Neck and neck on the ice!', 'Whoa, it\'s anyone\'s match!'],
    lastCube: ['Last cube! Final slide!', 'Here comes the last one. Hold on to your flippers!', 'Last cube, big moment!', 'One cube to go. Brrr, exciting!', 'The last cube! Let\'s slide into it!'],
    tasteGoal: ['I can take away my way to this one!', 'A Goal made for minus. Slide!', 'This one is all about taking away.'],
    tasteMove: ['Minus! My favourite cube!', 'Take away, take away! Wheee!', 'A minus for the penguin. Yes!'],
    tasteSol: ['Done! I took away, like a penguin on ice.', 'Minus did it again!', 'Slid down with a minus. Done!'],
    reply: {
      friendly: ['Aww, thanks! You\'re cool too.', 'Great sportsmanship! High flipper!', 'That warms my heart. Even on ice.', 'You\'re a great player to play with!'],
      cheeky: ['Ooh, feeling spicy? I\'m on ice!', 'Ha! That\'s the spirit. Waddle you do next?', 'Confident, huh? Let\'s see it!', 'Nice try yourself! Wink, wink.'],
      think: ['Hmm, chilly thinking!', 'Take your time. I\'m patient. Mostly.', 'Ooh, deep thoughts! I\'m thinking too.']
    }
  },
  fox: {
    gloat: ['Too quick for you!', 'Number 9 scores again!', 'Outfoxed!', 'That\'s how a striker finishes!', 'Top corner! Well, top of the table.', 'Fast feet, fast brain. That\'s me!', 'I make this look easy. Because it is. Ha!', 'And the crowd goes wild. For me!'],
    sore: ['Hmph! Lucky bounce.', 'I LET you have that one.', 'Grr… rematch!', 'Okay, that was a good one. Don\'t tell anyone I said that.', 'You got me this time. THIS time.', 'Nice shot, kid. I\'ll get you next round!', 'Whoa, didn\'t see that coming. Respect.', 'Hmph. Fine. You earned it.'],
    trash: ['My tail could find a better move! Just kidding… sort of.', 'I\'m three moves ahead, kid.', 'You sure about that one?', 'Nobody stops number 9!', 'Blink and you\'ll miss me.', 'I\'ve got the speed. You\'ve got… hope!', 'This pitch is MY pitch.', 'Pssst, I already know how this ends.'],
    bluff: ['Go on, challenge me. I dare you.', 'I could call Now any second…', 'This Goal? Can\'t be made. Trust me.', 'I see a Solution. It\'s a beauty.', 'Wouldn\'t want to be you right now.', 'Oh, I have a plan. A sneaky one.', 'Call me out. See what happens.', 'Honest! This one is Impossible. Probably.'],
    greet: ['Ready to lose? Kidding! Let\'s play!', 'Number 9 is in the house!', 'Good luck, you\'ll need it. Just kidding. Mostly!', 'Let\'s see what you\'ve got, kid.', 'Kick-off time! Don\'t blink!'],
    kidGoodMove: ['Hey, nice one! Not bad at all.', 'Okay, okay. That was sharp.', 'Whoa! I didn\'t expect that.', 'Grr, good move. Hmph.', 'I see you. That was smooth!'],
    kidChallenge: ['Ooh! You\'re calling me out? Brave!', 'Wait, what? Okay, let\'s see!', 'Uh oh. That\'s a bold move.', 'Gulp. I mean, bring it!', 'Hmm! Didn\'t see that coming.'],
    kidWrong: ['Tough break! You\'ve got another go.', 'Hey, even the best strikers miss. Shake it off!', 'Good try! That one was tricky.', 'No big deal. Next shake, you\'ll nail it.', 'Hang in there, kid. It happens to everyone.'],
    close: ['This is getting hot! I love it.', 'A real battle! Respect.', 'Oooh, it\'s anyone\'s match.', 'Now THIS is a game!', 'Neck and neck! Let\'s go!'],
    lastCube: ['Last cube! Time for a golden goal!', 'The last cube! Make it count.', 'Final play! Here we go!', 'Last cube: showtime!', 'One cube left. Who wants it?'],
    tasteGoal: ['Times and divide will get me there. Sly!', 'A foxy Goal for × and ÷.', 'I can see the groups already.'],
    tasteMove: ['Times and divide, my sneaky friends.', 'A × or ÷ always comes in handy.', 'Groups of things! Foxy.'],
    tasteSol: ['Groups and sharing. That\'s how a fox does it!', 'Times, divide, done. Too quick!', 'Multiply! Gotcha.'],
    reply: {
      friendly: ['Hey, thanks! You\'re alright, kid.', 'Respect! Good game so far.', 'Aw, shucks. You too!', 'That\'s the spirit! Nice one.'],
      cheeky: ['Ha! I like your style. Bring it!', 'Oh, so you want to play like that?', 'Cocky? Me too. Let\'s go!', 'Ooh, trash talk! Fun. Keep it coming.'],
      think: ['Thinking, huh? Take your time. I\'ll wait. Barely!', 'Hmm, a deep thinker. I like it.', 'Ooh, plotting! Me too.']
    }
  },
  owl: {
    gloat: ['Wisdom wins, hoo-hoo!', 'Just as I predicted.', 'Hoo\'s the champion? Me.', 'A well-timed pass of the cubes.', 'Experience matters, little owlet.', 'The midfield belongs to Number 8.', 'I did see that coming. Hoo.', 'A fine shake, if I may say so myself.'],
    sore: ['Hoo… I did not see that coming.', 'A wise owl knows when it\'s beaten.', 'Well played, owlet.', 'Hoo! You are full of surprises.', 'Even the wisest can be outplayed.', 'A beautiful solution, indeed.', 'I shall study that move. Hoo-hoo.', 'You have taught me something today.'],
    trash: ['Hoo taught you that move? Not me.', 'Think carefully, little owlet.', 'I have studied this position for years.', 'A wise move is a quiet move.', 'I see all of the pitch from up here.', 'Patience, owlet. Patience wins.', 'I have seen a thousand shakes like this.', 'Hoo-hoo. Interesting. Very interesting.'],
    bluff: ['I have read every Solution here.', 'It would be unwise to challenge me now.', 'There is no Solution. I checked. Hoo.', 'The answer is clear to me. Is it to you?', 'My feathers tell me Now! is near.', 'I would not call Impossible lightly. Hoo.', 'I already know a Solution. A beautiful one.', 'Trust me. I have studied this.'],
    greet: ['Hoo-hoo! Welcome, young player.', 'A match! How splendid.', 'Let\'s play. Learn, and have fun.', 'Good luck, owlet. May the best mind win.', 'Number 8 greets you. Kick off!'],
    kidGoodMove: ['Hoo! A wise move indeed.', 'Impressive. Very impressive.', 'Well done, owlet. Well done!', 'Hoo-hoo! You have a good eye.', 'I tip my wing to you.'],
    kidChallenge: ['Hoo! A challenge? How bold!', 'Interesting! Let me think carefully.', 'Hmm, a daring call, young one.', 'Hoo-hoo. Very brave.', 'Ah! I did not expect that.'],
    kidWrong: ['Every mistake teaches us something. Hoo!', 'A fine try! Try again, owlet.', 'Do not worry. Even owls drop things.', 'Close! Have another go.', 'Learning is the goal. You are doing it.'],
    close: ['A close contest! How exciting. Hoo!', 'The match hangs in the balance.', 'Both of us are playing well.', 'A thrilling match! I am enjoying it.', 'It is anyone\'s game, owlet.'],
    lastCube: ['The last cube! A decisive moment.', 'Hoo… the final cube.', 'One cube left. Choose wisely.', 'The end approaches. Let us finish with style.', 'The last cube. Let us see what it brings.'],
    tasteGoal: ['A prime number: only 1 and itself fit into it. Hoo!', 'Primes are the wisest numbers.', 'A prime Goal. How elegant.'],
    tasteMove: ['A prime number cube. Delightful.', 'Two, three, five, seven… the primes. Hoo!', 'I do enjoy a prime.'],
    tasteSol: ['A prime made it work. Hoo-hoo!', 'Primes, the building blocks of numbers!', 'Done, with a prime touch.'],
    reply: {
      friendly: ['Thank you, owlet. A kind gesture.', 'Hoo-hoo! Good sportsmanship.', 'Well said! I share the sentiment.', 'You do honor to the game.'],
      cheeky: ['Hoo-hoo! You have spirit, owlet.', 'Cheeky! I shall allow it.', 'Ah, confidence. Let\'s see it.', 'Hoo? A challenge? Delightful.'],
      think: ['Ah, you are thinking. Good.', 'Hoo-hoo. Take your time.', 'A thoughtful pause. I approve.']
    }
  },
  wizard: {
    gloat: ['Abraca-BEATEN!', 'Ninety-nine problems, all solved!', 'Magic and math win again!', 'A spell well cast!', 'Behold! The captain scores!', 'By my beard, that was magnificent!', 'Poof! And the shake is mine!', 'The crowd gasps! And so do I. At me.'],
    sore: ['My wand must be broken!', 'Bah! A counter-spell!', 'You out-wizarded me… this once.', 'Ha! A worthy opponent!', 'A glorious defeat. I shall write a poem.', 'Magnificent! Bravo, apprentice!', 'My crystal ball did NOT show that!', 'Well cast, young one. Well cast.'],
    trash: ['My beard has solved harder Goals.', 'I foresee… trouble for you.', 'Presto! Watch and learn.', 'Number 99 does not lose. Number 99 rests.', 'Ooh, a dramatic moment! I love those.', 'I have cast a spell. It\'s called confidence.', 'This Goal bends to my will.', 'Even my hat is grinning.'],
    bluff: ['My crystal ball says Impossible…', 'I already wrote my Solution. With magic.', 'One wave of my wand and it\'s Now!', 'Beware! The stars say challenge me not.', 'I sense a Solution. A glittering one.', 'The spirits whisper "Impossible!"', 'I could speak the word. But dramatic pause.', 'My wand is tingling. Something is coming.'],
    greet: ['Welcome, apprentice! Let the match begin!', 'Behold! A new challenger!', 'By my beard, this will be epic!', 'Kick-off! May the best wizard win!', 'Number 99 salutes you! Let\'s play!'],
    kidGoodMove: ['By my beard! A splendid move!', 'Magnificent! Truly magical!', 'Ooh! My hat is off to you!', 'Behold! A master in the making!', 'Bravo! Even my wand sparkled.'],
    kidChallenge: ['Gasp! A challenge! How dramatic!', 'By my beard! You dare?', 'Oho! The plot thickens!', 'Gulp! My wand trembles!', 'A bold call! I admire it!'],
    kidWrong: ['A small stumble, apprentice! Try again!', 'Even great wizards miss a spell. Onward!', 'Fear not! The next one will sparkle.', 'Dust yourself off! You\'ve got this!', 'No worries! Every wizard fizzles sometimes.'],
    close: ['By my beard, what a match!', 'The tension! I can taste the sparkles!', 'A thrilling duel!', 'Neck and neck! The crowd holds its breath!', 'The stars are watching this one!'],
    lastCube: ['The LAST cube! Drumroll, please!', 'Behold! The final cube!', 'The last cube! The moment of destiny!', 'One cube left! My heart is a drum!', 'Final cube! Let the magic happen!'],
    tasteGoal: ['Behold! A Goal with POWER!', 'A power spell for a Goal!', 'Powers! My favourite magic.'],
    tasteMove: ['Powers and roots, the strongest magic!', 'Ooh, a magic cube. Sparkle!', 'Roots and powers, come to me!'],
    tasteSol: ['Abracadabra, powers and roots!', 'A spell of powers. Done!', 'The magic of ^ and √!'],
    reply: {
      friendly: ['Thank you, kind apprentice!', 'A noble gesture! My beard bows.', 'Splendid sportsmanship! I am touched.', 'Hurrah! A friend indeed!'],
      cheeky: ['Ha! A spirited apprentice!', 'Ooh, sassy! I adore it!', 'By my beard! Confidence! Bravo!', 'You have the flair of a wizard!'],
      think: ['Ah! The apprentice ponders. Wise.', 'Take your time. Great magic needs thought.', 'Hmm! A deep ponder. I approve.']
    }
  },
  grub: {
    gloat: ['Hmph. I win. Told you.', 'Snort! Grumpy AND ahead!', 'That almost made me smile. Almost.', 'Number 2 scores! Hmph.'],
    sore: ['Hmph! I wasn\'t ready.', 'Grumble… good one, I suppose.', 'Snort. Lucky cubes.', 'Fine. FINE. Nice play.'],
    trash: ['Hmph. Hurry up, I\'m hungry.', 'I play fast. Thinking is boring.', 'Snort! Is that your move?', 'Grumble grumble. My turn yet?'],
    bluff: ['Hmph. I see a Now! coming.', 'This Goal looks impossible. Probably.', 'I have a plan. A grumpy plan.', 'Snort. One more cube and I\'ve got it.'],
    greet: ['Hmph. You again. Let\'s play.', 'Snort. Kick-off already?', 'I\'m grumpy AND ready.', 'Fine. One game. Maybe two.'],
    kidGoodMove: ['Hmph. That was good.', 'Snort! Clever. I don\'t like it.', 'Okay, that was smart.', 'Grumble… nice move.'],
    kidChallenge: ['Uh oh. Snort.', 'Hmph?! Wait, wait!', 'Gulp. I rushed that one.', 'Oh no. Did I leave that?'],
    kidWrong: ['Hmph. Happens to me all the time.', 'Don\'t worry. Try again.', 'Close! Have another go.', 'That\'s okay. Even grumps miss.'],
    close: ['Hmph! This is close.', 'Snort. Too close for me.', 'Neck and neck. I\'m nervous AND grumpy.', 'Tight game! Grumble.'],
    lastCube: ['Last cube. Hmph. Here we go.', 'Final cube! Snort!', 'One cube left. Don\'t blink.', 'The last one. I\'m almost excited.'],
    tasteGoal: ['A BIG Goal. Hmph. I like big.', 'Big number. Big Goal. Snort.', 'Here. A large one.'],
    tasteMove: ['Big cubes. Smash them together.', 'Plus and times. Squish!', 'Hmph. A big one. Good.'],
    tasteSol: ['Smashed it together. Done. Hmph.', 'Times and plus. SMASH!', 'Big numbers, big squish. Done.'],
    reply: { friendly: ['Hmph. Thanks. You\'re okay.', 'Snort. That was nice of you.', 'Fine. High five. Quick one.'], cheeky: ['Hmph! Cheeky!', 'Snort! Oh, it\'s ON.', 'Ha. I almost laughed.'], think: ['Hmph. Take your time. I won\'t.', 'Thinking? Good idea. I should try it.', 'Snort. Thinking face.'] }
  },
  splosh: {
    gloat: ['Oh! I won! I checked twice!', 'Careful wins! Hooray!', 'I didn\'t make a single splash. Well, one.', 'Number 5 is alive!'],
    sore: ['Oh dear! I was so careful!', 'Oh my. You were quicker than me.', 'I should have looked for a Now!', 'Well played! I\'ll check three times next time.'],
    trash: ['Careful now… are you sure about that?', 'I check everything twice. Do you?', 'Slow and safe, that\'s my game.', 'Oh, I wouldn\'t put that there!'],
    bluff: ['Oh! I think this Goal can\'t be made…', 'Careful, I\'m about to shout something!', 'I checked. It\'s impossible. I think.', 'I see a Solution! Or a puddle.'],
    greet: ['Oh, hello! Let\'s play carefully!', 'Hi! I brought my lucky scarf.', 'Good luck! Mind the puddles.', 'Ready? I\'ve checked the cubes twice.'],
    kidGoodMove: ['Oh! That was lovely!', 'Ooh, clever! I didn\'t check for that.', 'Wonderful move!', 'Oh my, you\'re good!'],
    kidChallenge: ['Oh no, oh no, oh no!', 'Eek! Did I miss one?', 'Oh dear. Let me check…', 'Gulp! I only checked twice!'],
    kidWrong: ['Oh, so close! Try again!', 'Don\'t worry, I miss those all the time.', 'Good try! You\'ll get the next one.', 'That\'s okay! Take a breath.'],
    close: ['Oh my, it\'s so close!', 'I can\'t look! It\'s too tight!', 'Neck and neck! How exciting!', 'Careful, careful… it\'s nearly tied!'],
    lastCube: ['The last cube! Oh my!', 'Final cube! I\'m checking it twice!', 'One left! Carefully now…', 'Last cube! Hold on to your scarf!'],
    tasteGoal: ['An even Goal! So neat and tidy!', 'Even numbers split in half perfectly!', 'Oh, a lovely even number.'],
    tasteMove: ['An even cube! Neat!', 'Two, four, six, eight, even is great!', 'Tidy, tidy, even!'],
    tasteSol: ['Done! Nice and tidy.', 'All neat and even. Lovely!', 'A tidy little Solution!'],
    reply: { friendly: ['Oh, thank you! You\'re so kind!', 'Aww! High hoof!', 'You\'re a lovely opponent!'], cheeky: ['Oh! Cheeky! Hee hee!', 'Ooh, you rascal!', 'Splish splash, I\'ll get you back!'], think: ['Take your time! I always do.', 'Good thinking! Check it twice.', 'Thinking is my favourite part too!'] }
  },
  blaze: {
    gloat: ['Sizzle! Too fast for you!', 'Goal! Red-hot number 11!', 'Blink and I score!', 'That one was on FIRE!'],
    sore: ['Whoa! Who turned on the sprinklers?', 'Okay, okay. You cooled me down.', 'Too fast! I tripped on my own tail.', 'Hot play. Yours, not mine.'],
    trash: ['Quick, quick! I\'m heating up!', 'Don\'t leave me a Now! I WILL take it.', 'Fast feet, fast cubes!', 'Is it hot in here, or is it me?'],
    bluff: ['I can smell a Now! from here…', 'One more cube and POW!', 'This Goal is toast. Maybe.', 'I\'m about to pounce. Or not!'],
    greet: ['Let\'s go, let\'s go, let\'s GO!', 'Kick-off! Try to keep up!', 'Ready to feel the heat?', 'Blaze is in the building!'],
    kidGoodMove: ['Whoa! Smoking move!', 'Hey! That was fast AND smart!', 'Ooh, that one burned.', 'Nice! You\'ve got fire too.'],
    kidChallenge: ['Yikes! Too fast, too fast!', 'Uh oh. Did I rush that?', 'Gulp. My tail is sweating.', 'Wait! I wasn\'t looking!'],
    kidWrong: ['No sweat! Go again.', 'So close! Fire up the next one.', 'Happens when you play fast. Trust me.', 'Shake it off! You\'ve got this.'],
    close: ['This match is HOT!', 'Neck and neck! I love it!', 'So close I can feel the sparks!', 'Tight game! Turn up the heat!'],
    lastCube: ['Last cube! Here comes the heat!', 'Final cube! Three, two, one…', 'One left! Ready to pounce!', 'The last cube is sizzling!'],
    tasteGoal: ['A square number! Zoom!', 'Double it, square it, hot hot hot!', 'Squares and doubles, my favourite!'],
    tasteMove: ['Doubles, here I come!', 'Times two! Fast!', 'Squares are super hot!'],
    tasteSol: ['Doubled it! Zoom!', 'Squared! Sizzle!', 'Double, done, faster than fire!'],
    reply: { friendly: ['Ha! Thanks, champ!', 'Fist bump! Careful, it\'s warm.', 'You\'re alright, number 7!'], cheeky: ['Ooh! Spicy!', 'Ha! Bring the heat!', 'Big talk! I like it!'], think: ['Thinking? No time! Okay, a little time.', 'Go on, I\'ll wait. Tapping my foot.', 'Slow and smart. Not my style, but okay!'] }
  },
  hex: {
    gloat: ['Hee hee! Tricked you!', 'You walked right into it!', 'Sneaky number 13 strikes!', 'That was my best trick yet.'],
    sore: ['Hmm! You saw through my trick.', 'Out-sneaked! That never happens.', 'Clever. Too clever. Hee… hmm.', 'I\'ll need a new trick for you.'],
    trash: ['Hee hee. Do you see what I see?', 'Careful. Nothing here is what it seems.', 'I have three tricks ready. Maybe four.', 'Look closely. Closer. Too late!'],
    bluff: ['Hee hee… I already have the Solution.', 'This Goal? Impossible. Or is it?', 'I\'m one cube from a Now! Probably.', 'Trust me. Hee hee. Don\'t trust me.'],
    greet: ['Hee hee. Welcome to my game.', 'Ready for some tricks?', 'Look sharp. I\'m sneaky today.', 'Kick-off! Watch the cubes, not me.'],
    kidGoodMove: ['Ooh. THAT was sneaky. I approve.', 'Hmm! You\'re learning my tricks.', 'Clever, clever, clever.', 'A fine trick. Did I teach you that?'],
    kidChallenge: ['Hmm?! You noticed?', 'Uh oh. The trick is on me.', 'Gulp. Hee… heh.', 'Wait. Let me count again.'],
    kidWrong: ['Tricky one, wasn\'t it? Try again.', 'So close! Look for the long way round.', 'No shame. That one fooled me too.', 'Good try. The next one is yours.'],
    close: ['Hee hee, this is tight!', 'Too close to trick anyone now.', 'Neck and neck. Delicious.', 'One slip decides it. Not mine, I hope.'],
    lastCube: ['The last cube. The final trick.', 'One cube left. Hee hee.', 'Final cube! Watch closely.', 'Last one. No more hiding.'],
    tasteGoal: ['A Goal to share and divide. Hee hee.', 'Divide and conquer!', 'A sharing Goal for you.'],
    tasteMove: ['A ÷ cube. My favourite trick.', 'Share and divide. Hee hee.', 'Divide! Sneaky.'],
    tasteSol: ['Divide and done. Hee hee!', 'Shared out fair and square!', 'A dividing trick!'],
    tasteFrac: ['Hee hee! I went through a fraction to get there!', 'A sneaky fraction did the trick!', 'Fractions make the best tricks.'],
    reply: { friendly: ['Hee! How kind. Suspiciously kind.', 'Thank you. No trick this time.', 'A friend! How unexpected.'], cheeky: ['Hee hee! Cheeky like me!', 'Ooh, sassy. I like you.', 'Bold! Let\'s see if it lasts.'], think: ['Yes, think. Thinking beats tricks.', 'Take your time. I\'m plotting anyway.', 'Hmm. A thinker. Dangerous.'] }
  },
  zog: {
    gloat: ['The King scores! Bow!', 'Long live King Messy!', 'Messy hair, tidy win!', 'A royal goal. Naturally.', 'My crown stays on my head.'],
    sore: ['What?! Who beats a king?', 'Hmph. A royal slip.', 'Well played. The King admits it.', 'You may keep that point. This once.'],
    trash: ['The King sees every cube.', 'Choose wisely. I am watching.', 'A throne is not won with easy moves.', 'Number 10 never tidies up. Or blinks.', 'My room is a mess. My math is not.'],
    bluff: ['The King already knows the answer.', 'I declare this Goal impossible. Perhaps.', 'A Now! is very near. I can feel it.', 'My royal nose smells a Solution.'],
    greet: ['Welcome to my court, challenger.', 'So. You wish to face the King.', 'Kneel! Just joking. Let\'s play.', 'The Monster League final! Begin!'],
    kidGoodMove: ['Hmm. A move worthy of a prince.', 'Impressive, challenger.', 'The King did not expect that.', 'Royal applause for that one.'],
    kidChallenge: ['You challenge the KING?', 'Hmm. Bold. Very bold.', 'Gulp. I mean… proceed.', 'The court holds its breath.'],
    kidWrong: ['Even kings miss. Try again.', 'Close, challenger. Go once more.', 'No shame in that. It was a hard one.', 'Chin up. A champion keeps going.'],
    close: ['The crown wobbles! So close!', 'A match fit for a king!', 'Neck and neck. The court is silent.', 'One point decides the throne.'],
    lastCube: ['The last cube! All rise!', 'Final cube. The throne is at stake.', 'One cube left, challenger.', 'The last cube! Trumpets, please!'],
    tasteGoal: ['A long Goal, fit for a king!', 'The King likes his Goals long.', 'Behold, the royal Goal!'],
    tasteMove: ['The King uses every kind of cube.', 'A royal cube for the royal mat.', 'Every operation serves the King!'],
    tasteSol: ['A bit of everything. Royal math!', 'Many operations, one King!', 'The King mixed them all. Done!'],
    reply: { friendly: ['The King thanks you.', 'A noble gesture. I approve.', 'You have royal manners.'], cheeky: ['Ha! Cheek! To a KING!', 'Bold words, challenger!', 'Ooh. The court gasps.'], think: ['Think well. The King can wait.', 'A wise ruler thinks first.', 'Take your time. I shall polish my crown.'] }
  },
  // ---- CAREER: Legend League ----
  bleep: {
    gloat: ['Bleep! Win detected.', 'Calculation correct. Point to Bleep!', 'Number 3 scores. Beep beep!', 'My gears are doing a happy dance.', 'Task: win the shake. Status: done!'],
    sore: ['Bleep… unexpected result.', 'Does not compute! Well played.', 'My circuits say: you were better.', 'Error! Error! Nice move, though.', 'Saving your move to my memory. Bleep.'],
    trash: ['Bleep. I have checked this move 1,000 times.', 'My battery is full. Is yours?', 'Repeat after me: Bleep wins.', 'Processing… processing… still winning.', 'I never guess. I compute.'],
    bluff: ['Bleep. My scanner sees a Now! coming.', 'Calculating… this Goal may be impossible.', 'I have a Solution stored. Maybe.', 'Warning: Bleep is about to say something.'],
    greet: ['Bleep bloop! Hello, human friend!', 'System ready. Let\'s play!', 'Welcome to the Legend League! Bleep!', 'Number 3, powered up. Kick-off!', 'Hello! I brought spare batteries.'],
    kidGoodMove: ['Bleep! That was a clever move.', 'Impressive. Adding you to my hero list.', 'Whoa. My lights just blinked.', 'Excellent move. Very efficient!', 'Bleep! I did not predict that.'],
    kidChallenge: ['Bleep?! Checking… checking…', 'Uh oh. My fan is spinning fast.', 'A challenge! Running all my tests…', 'Gulp. Do robots gulp? I just did.', 'Recalculating!'],
    kidWrong: ['No problem! Even robots need updates.', 'Close! Try again, friend.', 'Good try. Retry button pressed!', 'That one was tricky. Have another go.', 'Mistakes are how we learn. Bleep says so.'],
    close: ['Bleep! The numbers are very close!', 'Score check: too close to call!', 'My lights are flashing. Exciting!', 'Neck and neck. Bleep bloop!', 'Tight game! My gears are warm.'],
    lastCube: ['Last cube! Final countdown: 3, 2, 1…', 'One cube left. Bleep!', 'The final cube. Saving the game…', 'Last one! All systems go!', 'Final cube! My antenna is tingling.'],
    tasteGoal: ['A Goal I can make again and again!', 'Repeat-friendly Goal. Bleep!', 'Plus, plus, plus. Bleep likes it.'],
    tasteMove: ['Another one! And another! Bleep!', 'Repeat cube, ready.', 'Plus and times: my favourite tools.'],
    tasteSol: ['Done, by doing it twice. Bleep!', 'Repeat, repeat, finished!', 'Same sign twice. Efficient!'],
    reply: { friendly: ['Bleep! Thank you, friend!', 'Friendship detected. Bleep bloop!', 'You make my lights glow.'], cheeky: ['Bleep! Sassy human!', 'Ha. Ha. Ha. That is robot laughing.', 'Challenge accepted. Bleep!'], think: ['Thinking is good. I do it all day.', 'Take your time. My battery is full.', 'Hmm. A human computing. Nice.'] }
  },
  flip: {
    gloat: ['Upside-down and on top!', 'Swoop! That shake is mine!', 'Number 6 scores! Or is it 9?', 'I saw that coming. From the ceiling.', 'Flap flap, point for the bat!'],
    sore: ['Whoa, you turned me the right way up!', 'Flap… nice one!', 'I didn\'t see that. And I see a lot.', 'You flipped it on me! Well played.', 'Okay, okay. You win that one.'],
    trash: ['Everything looks different from up here.', 'Try thinking upside-down. It helps!', 'A 6 is just a 9 standing on its head.', 'I hang around until the right move.', 'Flip it and see!'],
    bluff: ['From up here, I see a Now! coming.', 'Upside-down, this Goal looks impossible.', 'I have a Solution. It\'s hanging right there.', 'Careful… I\'m about to swoop.'],
    greet: ['Hi! Excuse me while I hang here.', 'Welcome! The world looks better upside-down.', 'Number 6 says hello! Or 9. Hello!', 'Let\'s play! Flap flap!', 'Ready? I\'ve been hanging around for ages.'],
    kidGoodMove: ['Whoa! A move worth flipping for!', 'Nice! I saw it from up here.', 'Clever! That turned things around.', 'Wow, smooth move!', 'Flap! That was a good one.'],
    kidChallenge: ['Eek! Let me turn around and check…', 'Uh oh! My wings are wobbly.', 'A challenge? Flap flap flap!', 'Gulp! Hang on…', 'Oh! Let me look again.'],
    kidWrong: ['No worries! Turn it around and try again.', 'Close! Have another go.', 'Upside-down numbers are tricky. You\'ve got this.', 'Good try! The next one is yours.', 'It happens! Even bats bump into things.'],
    close: ['So close! My ears are tingling!', 'Neck and neck! Flap flap!', 'This could flip either way!', 'What a match! I\'m all upside-down.', 'Too close! I can\'t look. I\'ll look upside-down.'],
    lastCube: ['Last cube! Flip it good!', 'One cube left. Hold on tight!', 'The last cube! Swoop time!', 'Final cube! Ears up!', 'Last one! Hanging on every move.'],
    tasteGoal: ['A Goal for taking away. Swoop!', 'Minus makes it upside-down. I love it.', 'Here is a Goal with a little minus in it.'],
    tasteMove: ['Minus! The upside-down sign!', 'A 6 or a 9? Both, if you flip it!', 'Take-away cube, my favourite.'],
    tasteSol: ['Took away, flipped around, done!', 'Minus magic!', 'Upside-down and correct!'],
    reply: { friendly: ['Aww! You\'re nice, the right way up.', 'Thanks! Flap flap!', 'You\'re a great player!'], cheeky: ['Ha! Cheeky! I like it!', 'Ooh, sassy from down there!', 'Bring it on!'], think: ['Take your time. I\'ll just hang here.', 'Thinking? Try it upside-down!', 'Good idea. Look from every side.'] }
  },
  squiggle: {
    gloat: ['Eight arms, one win! Blub!', 'Number 88 scores! Twice!', 'Wiggle wiggle, I win!', 'That shake was eight times fun!', 'Ink-credible! Point to me!'],
    sore: ['Blub… you got me!', 'Eight arms and I still missed it!', 'Wow! Well played, two-arms!', 'You out-wiggled me!', 'I\'m tied in a knot. Nice one!'],
    trash: ['I can hold eight cubes at once!', 'Count in eights. It\'s easy… for me.', 'Blub. Watch my arms, not the cubes.', 'In base 8, 10 means eight. Tricky, huh?', 'I\'ve got an arm on every cube.'],
    bluff: ['Blub! I see a Now! with all eight eyes. I have two eyes.', 'This Goal looks impossible. In base 8. Maybe.', 'One of my arms has a Solution.', 'Careful, I\'m about to squirt some ink!'],
    greet: ['Blub blub! Hello there!', 'Welcome! Shake my hand. Any of them.', 'Number 88 is ready to wiggle!', 'Let\'s count in eights today!', 'Hi! Eight hellos for you!'],
    kidGoodMove: ['Ooh! Eight thumbs up!', 'Blub! That was clever!', 'Whoa, smooth move!', 'Nice one! I\'m clapping eight times.', 'Wiggle-wow!'],
    kidChallenge: ['Blub?! Let me check with all my arms!', 'Uh oh! I\'m tangled!', 'Eek! A challenge!', 'Gulp! I might squirt ink!', 'Wait, wait, I\'m counting!'],
    kidWrong: ['That\'s okay! Base 8 is tricky.', 'Close! Try again, friend.', 'Good try! Count in eights and look again.', 'No worries! I mix up my arms all the time.', 'Have another go. You\'re learning fast!'],
    close: ['Blub! So close!', 'Neck and neck! Or tentacle and neck!', 'This is a wiggly one!', 'Too close! My arms are shaking!', 'What a match!'],
    lastCube: ['Last cube! All eight arms ready!', 'One cube left. Blub!', 'Final cube! Wiggle time!', 'The last one! Hold on tight!', 'Last cube! Here we go!'],
    tasteGoal: ['A Goal full of eights!', 'Eights are my favourite numbers.', 'Here is a wiggly eight-ish Goal.'],
    tasteMove: ['An 8! One for each arm!', 'Groups of eight. Blub!', 'Times! Like counting arms.'],
    tasteSol: ['Done, the octopus way!', 'Eights and times. Blub!', 'Counted it with my arms!'],
    reply: { friendly: ['Blub! Eight hugs for you!', 'You\'re very kind!', 'Thank you, friend!'], cheeky: ['Ha! Cheeky! Blub!', 'Ooh, you wiggler!', 'Bring it, two-arms!'], think: ['Take your time. I\'m tidying my arms.', 'Thinking is great. I think with all eight.', 'Blub. Good thinking.'] }
  },
  nugget: {
    gloat: ['ROAR! Another gold coin for me!', 'Number 12 scores! Shiny!', 'That shake goes in my treasure pile.', 'A dragon always wins. Usually.', 'Gold, gold, gold!'],
    sore: ['Hmm! You found my treasure.', 'Puff… well played!', 'A clever knight! Take a coin.', 'You beat a dragon! Nice one.', 'My fire went out. Good move!'],
    trash: ['My treasure is safe from you!', 'Dragons have been doing math for a thousand years.', 'Puff puff. Is that your best move?', 'I see gold in these cubes.', 'A dragon never rushes. Never.'],
    bluff: ['I smell a Now! Like smoke.', 'This Goal is impossible. Probably. Puff.', 'There is a golden Solution here somewhere.', 'Careful, I\'m warming up my fire.'],
    greet: ['Welcome to my cave, little knight!', 'ROAR! Just saying hello.', 'Number 12 guards the gold. Let\'s play!', 'I brought my treasure. Want to see?', 'Hello! Mind the smoke.'],
    kidGoodMove: ['Ooh! A golden move!', 'Clever! You\'d make a fine dragon.', 'Puff! That surprised me!', 'Shiny thinking!', 'That move is worth a gold coin.'],
    kidChallenge: ['A challenge? To a DRAGON?', 'Puff! Let me count my coins…', 'Uh oh! Hold on…', 'Gulp. Smoke is coming out of my ears.', 'Brave knight! Let\'s see!'],
    kidWrong: ['No worries! Even dragons drop coins.', 'Close! Try again.', 'Good try! The gold is still there.', 'That one was tricky. Have another go!', 'Chin up, knight! You\'ve got this.'],
    close: ['ROAR! This is so close!', 'My treasure is in danger!', 'Neck and neck! Puff puff!', 'What a match! My scales are tingling.', 'Too close to call!'],
    lastCube: ['Last cube! The final treasure!', 'One cube left. Roar!', 'The last cube! Shiny moment!', 'Final cube! Here comes the fire!', 'Last one! Guard the gold!'],
    tasteGoal: ['A Goal with POWER! Golden!', 'Powers are a dragon\'s treasure.', 'A shiny power Goal for you.'],
    tasteMove: ['Gold cube! Mine, mine, mine!', 'A power! Shiny!', 'Into the treasure pile it goes.'],
    tasteSol: ['A golden Solution!', 'Powered up, dragon style!', 'Done, with a shiny power!'],
    reply: { friendly: ['Puff! That\'s very kind.', 'You may hold one coin. One!', 'A friendly knight! Hello!'], cheeky: ['ROAR! Cheeky!', 'Ha! Brave words!', 'Ooh, spicy. Like my breath.'], think: ['Take your time. I\'ll polish my coins.', 'A thinking knight. Clever.', 'Hmm. Good. Think it through.'] }
  },
  chroma: {
    gloat: ['The Queen wins, in every colour!', 'Number 21 scores! Bow!', 'A royal shake. Naturally.', 'Green, blue, gold: all mine!', 'I changed the rules and still won!'],
    sore: ['What?! You saw through my colours!', 'Well played. The Queen admits it.', 'Hmm. My colours went pale.', 'You out-shuffled the Queen!', 'Bravo, challenger. Bravo.'],
    trash: ['New shake, new rule, new colour!', 'Can you keep up with the Queen?', 'I blend in. Then I win.', 'Every card is my favourite card.', 'The Queen changes. The Queen wins.'],
    bluff: ['The Queen already sees a Now!', 'This Goal is impossible. Or is it?', 'I have a Solution. In a secret colour.', 'Careful. I am about to change.'],
    greet: ['Welcome to my court, challenger!', 'The Legend League final! Begin!', 'Ready for a new rule every shake?', 'Number 21 greets you. Let\'s play!', 'So, you want to face the Queen.'],
    kidGoodMove: ['A move fit for a queen!', 'Impressive, challenger!', 'Hmm! My colours just changed.', 'Royal applause for that one!', 'The Queen did not expect that.'],
    kidChallenge: ['You challenge the QUEEN?', 'Oh! Bold. Very bold.', 'Hmm! Let me check… in every colour.', 'Gulp. I mean… proceed.', 'The court holds its breath!'],
    kidWrong: ['Even queens slip. Try again.', 'Close, challenger! Go once more.', 'New rules are tricky. You\'ve got this.', 'No shame in that. It was a hard one.', 'Chin up! A champion keeps going.'],
    close: ['So close! My colours keep changing!', 'A match fit for a queen!', 'Neck and neck. The court is silent.', 'One point decides the crown!', 'What a final!'],
    lastCube: ['The last cube! All rise!', 'Final cube. The crown is at stake.', 'One cube left, challenger.', 'The last cube! Trumpets, please!', 'Final cube! Watch my colours.'],
    tasteGoal: ['A long Goal, in many colours!', 'The Queen likes her Goals long.', 'Behold, a royal Goal!'],
    tasteMove: ['Every operation serves the Queen.', 'A royal cube for the royal mat.', 'This colour suits me.'],
    tasteSol: ['A bit of everything. Royal math!', 'Many operations, one Queen!', 'Mixed them all. Done!'],
    reply: { friendly: ['The Queen thanks you!', 'Lovely manners, challenger.', 'You are welcome at my court.'], cheeky: ['Ha! Cheek! To a QUEEN!', 'Bold words!', 'Ooh. The court gasps.'], think: ['Think well. The Queen can wait.', 'Take your time. I\'ll change colour meanwhile.', 'A wise player thinks first.'] }
  }
};
// (CAREER: the Legend League uses its own classic-built kinds, not the monster models)
OPPONENTS.forEach(function (o, i) { var lg = leagueOf(i); o.kind = lg < 2 ? CREATURE_KINDS[i % LEAGUE] : CAREER_KINDS[i % LEAGUE]; o.pack = lg === 1 ? 'monsters' : 'classic'; o.num = JERSEYS[i]; o.talk = TALK[o.id]; });
var DEFAULT_OPP_NAMES = OPPONENTS.map(function (o) { return o.name; });
function applyOppNames() { OPPONENTS.forEach(function (o, i) { var n = (S.oppNames && S.oppNames[i] || '').trim(); o.name = n || DEFAULT_OPP_NAMES[i]; }); }
var PIP = { id: 'pip', kind: 'pip', name: 'Pip', title: 'the Cube', emoji: '🟨', color: '#ffe066', stars: 0, maxDigits: 5, timeMs: 400, think: ['My turn!'] };

var SKINS = [{ id: 'classic', name: 'Classic', lvl: 1 }, { id: 'candy', name: 'Candy', lvl: 3 }, { id: 'lava', name: 'Lava', lvl: 5 }, { id: 'galaxy', name: 'Galaxy', lvl: 7 }, { id: 'gold', name: 'Gold', lvl: 10 }];
var MATS = [{ id: 'felt', name: 'Classic Felt', lvl: 1, sw: 'linear-gradient(#3fb27f,#1d6a46)' }, { id: 'stadium', name: 'Stadium', lvl: 1, sw: 'linear-gradient(#37b24d,#1b5e20)' }, { id: 'space', name: 'Outer Space', lvl: 2, sw: 'linear-gradient(#3a2f8b,#0b0d24)' }, { id: 'jungle', name: 'Jungle', lvl: 4, sw: 'linear-gradient(#3a8f3c,#174d1c)' }, { id: 'ocean', name: 'Underwater', lvl: 6, sw: 'linear-gradient(#36c2f0,#0b4f8a)' }, { id: 'night', name: 'Night Match', lvl: 3, sw: 'linear-gradient(#1f3a6b,#050a1e)' }, { id: 'beach', name: 'Beach Soccer', lvl: 5, sw: 'linear-gradient(#5fd6d0,#ecd3a0)' }, { id: 'volcano', name: 'Volcano Crater', lvl: 7, sw: 'linear-gradient(#ff8a1f,#4f3a9a)' }];
var VICTORIES = [{ id: 'confetti', name: 'Confetti', lvl: 1, icon: '🎊' }, { id: 'fireworks', name: 'Fireworks', lvl: 4, icon: '🎆' }, { id: 'stars', name: 'Star Shower', lvl: 8, icon: '🌟' }];

// ----- Helpers -----
function $(s, el) { return (el || document).querySelector(s); }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function shuffle(a, rand) { rand = rand || Math.random; for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function show(sym) { return Eq.SHOW[sym] || sym; }
function fmtMs(ms) { var s = Math.round(ms / 1000); return s < 60 ? s + ' sec' : Math.floor(s / 60) + ' min ' + (s % 60) + ' sec'; }

// ----- Saving (works even if storage is blocked) -----
function defaults() {
  return {
    v: 1, name: 'Champ', backName: 'TYSON W.', xp: 0, badges: {},
    stats: { correct: 0, attempts: 0, nowWins: 0, impWins: 0, goalsSet: 0, pvpShakes: 0, daily: 0, fractionSolutions: 0, streak: 0, noHint: 0, lastWrong: false, bestMatch: 0, shakes: 0, challenges: 0, challengeWins: 0 },
    history: [], best: { fastMs: 0, hardGoal: null, hardGoalText: '', mostCubes: 0 }, opsUsed: {},
    ladder: { stage: 1, stars: 0 }, unlockAll: false, opsManual: null, beaten: OPPONENTS.map(function () { return false; }),
    cos: { skin: 'classic', mat: 'stadium', victory: 'confetti' },
    set: { music: 0.35, sfx: 0.8, mute: false, shakes: 3, three: true, voice: false, gloat: true, trash: true, bluff: false, titleFx: true, variOff: {}, avatar: true, variations: true },
    cups: { run: null, won: {}, list: [] }, ways: { lvl: 1, row: 0, miss: 0, done: 0, total: 0, best: {} }, gift: { made: [], solved: {} }, tour: { v: 0, seen: {}, opened: {} }, tips: { seen: 0, kinds: {}, last: [] }, trios: {}, vari: { base: null, seen: 0 }, bonus: { base: null, seen: {}, force: {}, off: {}, opOff: {}, opsSeen: {} }, team: { mate: 'Tata', mjersey: '17', boss: null }, teamWins: {},
    lastDedication: '', tutorialDone: false, dailyDone: {}, jersey: '7', oppNames: OPPONENTS.map(function () { return ''; }),
    kit: { shirt: '#c9342c', pattern: 'waves', trim: '#2f8f7c', shorts: '#1f6b5a', hair: '#3b2314', hairStyle: 'swept', celebrate: 'jump' },
    kits: { away: {}, third: {} }, kitUse: 'home'
  };
}
function merge(d, s) {
  if (!s || typeof s !== 'object') return d;
  Object.keys(s).forEach(function (k) {
    if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k]) && s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) d[k] = merge(d[k], s[k]);
    else if (s[k] !== undefined) d[k] = s[k];
  });
  return d;
}
var storageOK = true;
function loadSave() { try { var raw = window.localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { storageOK = false; return null; } }
function persist() { try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { storageOK = false; } }
var S = merge(defaults(), loadSave());
// Times and divide are available from the start now, so saves still on the first stage move up one.
function normalizeSave() {
  if (!S.ladder || S.ladder.stage < 1) S.ladder = { stage: 1, stars: 0 };
  // older saves only know five opponents
  if (!Array.isArray(S.beaten)) S.beaten = []; if (!Array.isArray(S.oppNames)) S.oppNames = [];
  for (var i = 0; i < OPPONENTS.length; i++) { S.beaten[i] = !!S.beaten[i]; S.oppNames[i] = S.oppNames[i] || ''; }
}
normalizeSave();

function checksum(str) { var h = 0; for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; } return (h % 65536).toString(16).padStart(4, '0'); }
function exportCode() { var json = JSON.stringify(S); var b = btoa(unescape(encodeURIComponent(json))); return 'TATA-' + b + '-' + checksum(b); }
function importCode(code) {
  code = String(code || '').trim().replace(/\s+/g, '');
  var m = code.match(/^TATA-(.+)-([0-9a-f]{4})$/);
  if (!m || checksum(m[1]) !== m[2]) return false;
  try { var data = JSON.parse(decodeURIComponent(escape(atob(m[1])))); S = merge(defaults(), data); normalizeSave(); persist(); return true; } catch (e) { return false; }
}

// The 3D table loads as a module (js/three/table.js). Until it does, this stand-in says "not ready",
// and the game uses the flat 2D mat. The module fills in the real functions on this same object.
var T3 = { supported: false, handlers: {}, active: function () { return T3.supported && S.set.three !== false; } };

// The name printed on the back of the kid's shirt (Settings can change it; separate from the name Pip greets).
function backName() { return (typeof S !== 'undefined' && S && S.backName != null) ? String(S.backName) : 'TYSON W.'; }
