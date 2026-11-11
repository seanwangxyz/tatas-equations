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

// Skill settings per creature (checked with tests/playtest.js):
//   seeNow / seeImp = chance per turn that it notices a Now! or Impossible! chance;
//   smart = chance it checks its move is safe; maxDigits = how long a Solution it can find;
//   fumble = chance it fails to write a Solution it should have found (sleepy!).
var OPPONENTS = [
  { id: 'snoozy', name: 'Snoozy', title: 'the Sleepy Sloth', emoji: '🦥', color: '#d3f9d8', stars: 1, maxDigits: 3, timeMs: 150, seeNow: 0.1, seeImp: 0.08, smart: 0.2, fumble: 0.3, goalCubes: 1, goalMax: 12,
    think: ['Zzz… oh! Is it my turn?', 'Slooowly thinking…', '*yawn* Let me see…'], now: '*yawn*… NOW!', imp: 'Zzz… IMPOSSIBLE!', goal: 'Here is a Goal… *yawn*', lose: 'Zzz… you got me! Good game!', win: 'I won? While napping?' },
  { id: 'penny', name: 'Penny', title: 'the Puzzle Penguin', emoji: '🐧', color: '#d0ebff', stars: 2, maxDigits: 3, timeMs: 250, seeNow: 0.28, seeImp: 0.22, smart: 0.45, fumble: 0.12, goalCubes: 2, goalMax: 25,
    think: ['Waddle, waddle… thinking!', 'Hmm, chilly choices…', 'Let me slide this over…'], now: 'Flippers up: NOW!', imp: 'Brrr… IMPOSSIBLE!', goal: 'Try this Goal on for size!', lose: 'Great waddling! You win!', win: 'Penguin power!' },
  { id: 'fox', name: 'Rusty', title: 'the Clever Fox', emoji: '🦊', color: '#ffd8a8', stars: 3, maxDigits: 4, timeMs: 350, seeNow: 0.55, seeImp: 0.5, smart: 0.7, goalCubes: 3, goalMax: 40,
    think: ['Hmm… a sly move…', 'Let me sniff this out…', 'Foxy thinking…'], now: 'Gotcha! NOW!', imp: 'Sneaky… IMPOSSIBLE!', goal: 'A clever Goal for you!', lose: 'Outfoxed! Well played!', win: 'Too clever for you this time!' },
  { id: 'owl', name: 'Ollie', title: 'the Wise Owl', emoji: '🦉', color: '#e5dbff', stars: 4, maxDigits: 5, timeMs: 500, seeNow: 0.8, seeImp: 0.75, smart: 0.9, goalCubes: 3, goalMax: 60,
    think: ['Hoo-hoo… let me think…', 'Wise moves only…', 'Hmm, hoo…'], now: 'Hoo! NOW!', imp: 'Hoo-hoo… IMPOSSIBLE!', goal: 'A wise Goal…', lose: 'Hoo! You are wise indeed!', win: 'Wisdom wins today!' },
  { id: 'wizard', name: 'Mondo', title: 'the Math Wizard', emoji: '🧙', color: '#fff3bf', stars: 5, maxDigits: 5, timeMs: 700, seeNow: 1, seeImp: 0.95, smart: 1, goalCubes: 3, goalMax: 99,
    think: ['By my beard… let me think…', 'Abraca-math…', 'The cubes whisper to me…'], now: 'Abracadabra… NOW!', imp: 'By my beard… IMPOSSIBLE!', goal: 'Behold, a Goal!', lose: 'You have out-wizarded the Wizard!', win: 'Magic and math win again!' }
];
var CREATURE_KINDS = ['sloth', 'penguin', 'fox', 'owl', 'wizard'], JERSEYS = ['1', '4', '9', '8', '99'];
// Creature attitude. All of it is playful teasing between friends: never about being bad at math.
// Match flow: gloat / sore = after a shake; trash = while playing (Settings switch); bluff = claims that may or may
// not be true (Settings switch, off by default).
// Situational: greet = match start; kidGoodMove = grudging respect after the kid does well; kidChallenge = nervous when
// the kid calls Now!/Impossible!; kidWrong = kind and encouraging after the kid's mistake (never gloating);
// close = tight match; lastCube = the last cube is about to be played.
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
    reply: {
      friendly: ['Thank you, kind apprentice!', 'A noble gesture! My beard bows.', 'Splendid sportsmanship! I am touched.', 'Hurrah! A friend indeed!'],
      cheeky: ['Ha! A spirited apprentice!', 'Ooh, sassy! I adore it!', 'By my beard! Confidence! Bravo!', 'You have the flair of a wizard!'],
      think: ['Ah! The apprentice ponders. Wise.', 'Take your time. Great magic needs thought.', 'Hmm! A deep ponder. I approve.']
    }
  }
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
