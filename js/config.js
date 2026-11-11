'use strict';

// ----- Settings Tata can change -----
// "Beat Tata's Record" badge: points needed in ONE match against the computer.
// (Each shake is worth 2, 4 or 6 points, so a 3-shake match tops out at 18.)
var TATA_RECORD = 16;

var SAVE_KEY = 'tatasEquations.v1';

// Difficulty ladder. "need" = skill stars (correct Solutions / correct challenges) to unlock the next stage.
var STAGES = [
  { id: 'addsub', name: 'Adding & Subtracting', icon: '➕', ops: ['+', '-'], fractions: false, need: 5, maxGoal: 20 },
  { id: 'muldiv', name: 'Times & Divide', icon: '✖️', ops: ['+', '-', '*', '/'], fractions: false, need: 6, maxGoal: 40 },
  { id: 'frac', name: 'Fractions', icon: '🍕', ops: ['+', '-', '*', '/'], fractions: true, need: 6, maxGoal: 50 },
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

var OPPONENTS = [
  { id: 'snoozy', name: 'Snoozy', title: 'the Sleepy Sloth', emoji: '🦥', color: '#d3f9d8', stars: 1, maxDigits: 3, timeMs: 150, seeNow: 0.3, seeImp: 0.25, smart: 0.25, goalCubes: 1, goalMax: 12,
    think: ['Zzz… oh! Is it my turn?', 'Slooowly thinking…', '*yawn* Let me see…'], now: '*yawn*… NOW!', imp: 'Zzz… IMPOSSIBLE!', goal: 'Here is a Goal… *yawn*', lose: 'Zzz… you got me! Good game!', win: 'I won? While napping?' },
  { id: 'penny', name: 'Penny', title: 'the Puzzle Penguin', emoji: '🐧', color: '#d0ebff', stars: 2, maxDigits: 3, timeMs: 250, seeNow: 0.5, seeImp: 0.45, smart: 0.5, goalCubes: 2, goalMax: 25,
    think: ['Waddle, waddle… thinking!', 'Hmm, chilly choices…', 'Let me slide this over…'], now: 'Flippers up: NOW!', imp: 'Brrr… IMPOSSIBLE!', goal: 'Try this Goal on for size!', lose: 'Great waddling! You win!', win: 'Penguin power!' },
  { id: 'fox', name: 'Rusty', title: 'the Clever Fox', emoji: '🦊', color: '#ffd8a8', stars: 3, maxDigits: 4, timeMs: 350, seeNow: 0.75, seeImp: 0.65, smart: 0.75, goalCubes: 3, goalMax: 40,
    think: ['Hmm… a sly move…', 'Let me sniff this out…', 'Foxy thinking…'], now: 'Gotcha! NOW!', imp: 'Sneaky… IMPOSSIBLE!', goal: 'A clever Goal for you!', lose: 'Outfoxed! Well played!', win: 'Too clever for you this time!' },
  { id: 'owl', name: 'Ollie', title: 'the Wise Owl', emoji: '🦉', color: '#e5dbff', stars: 4, maxDigits: 5, timeMs: 500, seeNow: 0.9, seeImp: 0.85, smart: 0.9, goalCubes: 3, goalMax: 60,
    think: ['Hoo-hoo… let me think…', 'Wise moves only…', 'Hmm, hoo…'], now: 'Hoo! NOW!', imp: 'Hoo-hoo… IMPOSSIBLE!', goal: 'A wise Goal…', lose: 'Hoo! You are wise indeed!', win: 'Wisdom wins today!' },
  { id: 'wizard', name: 'Mondo', title: 'the Math Wizard', emoji: '🧙', color: '#fff3bf', stars: 5, maxDigits: 5, timeMs: 700, seeNow: 1, seeImp: 0.95, smart: 1, goalCubes: 3, goalMax: 99,
    think: ['By my beard… let me think…', 'Abraca-math…', 'The cubes whisper to me…'], now: 'Abracadabra… NOW!', imp: 'By my beard… IMPOSSIBLE!', goal: 'Behold, a Goal!', lose: 'You have out-wizarded the Wizard!', win: 'Magic and math win again!' }
];
var CREATURE_KINDS = ['sloth', 'penguin', 'fox', 'owl', 'wizard'], JERSEYS = ['1', '4', '9', '8', '99'];
// Creature attitude. All of it is playful teasing: never about being bad at math.
// gloat = after they win; sore = after they lose; trash = while playing (Settings switch);
// bluff = claims that may or may not be true (Settings switch, off by default).
var TALK = {
  snoozy: { gloat: ['I won that one… in my sleep!', 'Zzz… oh, did I win? Nice.', 'Best nap AND a win!'],
    sore: ['Aww… I need a nap after that.', 'No fair, I was resting my eyes!', '*sniff* Good one.'],
    trash: ['*yawn* Wake me when it gets tricky.', 'I can play with my eyes closed. They ARE closed.', 'Slow and steady wins the shake…'],
    bluff: ['Careful… I\'m one cube away from Now!', 'Hmm, this Goal looks impossible to me…', 'I dreamed the Solution already.'] },
  penny: { gloat: ['Ice cold! That\'s how penguins play!', 'Slide, slide, WIN!', 'Flippers up for me!'],
    sore: ['My flippers slipped!', 'Brrr… you got me.', 'That was a fishy move. A good one!'],
    trash: ['Waddle you do now?', 'Your move gave me chills… of joy!', 'Stay cool. I know I will.'],
    bluff: ['I already see a Solution. Do you?', 'One more cube and I say Now!', 'This one can\'t be made. Probably.'] },
  fox: { gloat: ['Too quick for you!', 'Number 9 scores again!', 'Outfoxed!'],
    sore: ['Hmph! Lucky bounce.', 'I LET you have that one.', 'Grr… rematch!'],
    trash: ['My tail could find a better move! Just kidding… sort of.', 'I\'m three moves ahead, kid.', 'You sure about that one?'],
    bluff: ['Go on, challenge me. I dare you.', 'I could call Now any second…', 'This Goal? Can\'t be made. Trust me.'] },
  owl: { gloat: ['Wisdom wins, hoo-hoo!', 'Just as I predicted.', 'Hoo\'s the champion? Me.'],
    sore: ['Hoo… I did not see that coming.', 'A wise owl knows when it\'s beaten.', 'Well played, owlet.'],
    trash: ['Hoo taught you that move? Not me.', 'Think carefully, little owlet.', 'I have studied this position for years.'],
    bluff: ['I have read every Solution here.', 'It would be unwise to challenge me now.', 'There is no Solution. I checked. Hoo.'] },
  wizard: { gloat: ['Abraca-BEATEN!', 'Ninety-nine problems, all solved!', 'Magic and math win again!'],
    sore: ['My wand must be broken!', 'Bah! A counter-spell!', 'You out-wizarded me… this once.'],
    trash: ['My beard has solved harder Goals.', 'I foresee… trouble for you.', 'Presto! Watch and learn.'],
    bluff: ['My crystal ball says Impossible…', 'I already wrote my Solution. With magic.', 'One wave of my wand and it\'s Now!'] }
};
OPPONENTS.forEach(function (o, i) { o.kind = CREATURE_KINDS[i]; o.num = JERSEYS[i]; o.talk = TALK[o.id]; });
var DEFAULT_OPP_NAMES = OPPONENTS.map(function (o) { return o.name; });
function applyOppNames() { OPPONENTS.forEach(function (o, i) { var n = (S.oppNames && S.oppNames[i] || '').trim(); o.name = n || DEFAULT_OPP_NAMES[i]; }); }
var PIP = { id: 'pip', kind: 'pip', name: 'Pip', title: 'the Cube', emoji: '🟨', color: '#ffe066', stars: 0, maxDigits: 5, timeMs: 400, think: ['My turn!'] };

var SKINS = [{ id: 'classic', name: 'Classic', lvl: 1 }, { id: 'candy', name: 'Candy', lvl: 3 }, { id: 'lava', name: 'Lava', lvl: 5 }, { id: 'galaxy', name: 'Galaxy', lvl: 7 }, { id: 'gold', name: 'Gold', lvl: 10 }];
var MATS = [{ id: 'felt', name: 'Classic Felt', lvl: 1, sw: 'linear-gradient(#3fb27f,#1d6a46)' }, { id: 'space', name: 'Outer Space', lvl: 2, sw: 'linear-gradient(#3a2f8b,#0b0d24)' }, { id: 'jungle', name: 'Jungle', lvl: 4, sw: 'linear-gradient(#3a8f3c,#174d1c)' }, { id: 'ocean', name: 'Underwater', lvl: 6, sw: 'linear-gradient(#36c2f0,#0b4f8a)' }];
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
    v: 1, name: 'Champ', xp: 0, badges: {},
    stats: { correct: 0, attempts: 0, nowWins: 0, impWins: 0, goalsSet: 0, pvpShakes: 0, daily: 0, fractionSolutions: 0, streak: 0, noHint: 0, lastWrong: false, bestMatch: 0, shakes: 0, challenges: 0, challengeWins: 0 },
    history: [], best: { fastMs: 0, hardGoal: null, hardGoalText: '', mostCubes: 0 }, opsUsed: {},
    ladder: { stage: 0, stars: 0 }, unlockAll: false, beaten: [false, false, false, false, false],
    cos: { skin: 'classic', mat: 'felt', victory: 'confetti' },
    set: { music: 0.35, sfx: 0.8, mute: false, shakes: 3, three: true, voice: false, gloat: true, trash: true, bluff: false },
    lastDedication: '', tutorialDone: false, dailyDone: {}, jersey: '7', oppNames: ['', '', '', '', '']
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

function checksum(str) { var h = 0; for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; } return (h % 65536).toString(16).padStart(4, '0'); }
function exportCode() { var json = JSON.stringify(S); var b = btoa(unescape(encodeURIComponent(json))); return 'TATA-' + b + '-' + checksum(b); }
function importCode(code) {
  code = String(code || '').trim().replace(/\s+/g, '');
  var m = code.match(/^TATA-(.+)-([0-9a-f]{4})$/);
  if (!m || checksum(m[1]) !== m[2]) return false;
  try { var data = JSON.parse(decodeURIComponent(escape(atob(m[1])))); S = merge(defaults(), data); persist(); return true; } catch (e) { return false; }
}

// The 3D table loads as a module (js/three/table.js). Until it does, this stand-in says "not ready",
// and the game uses the flat 2D mat. The module fills in the real functions on this same object.
var T3 = { supported: false, handlers: {}, active: function () { return T3.supported && S.set.three !== false; } };
