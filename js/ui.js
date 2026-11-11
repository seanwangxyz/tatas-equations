'use strict';
// ======================= ART =======================
function pipSVG(mood) {
  var mouth = { happy: '<path d="M44 82 Q60 98 76 82" stroke="#1d2340" stroke-width="5" fill="#ff8787" stroke-linecap="round"/>',
    cheer: '<path d="M40 78 Q60 104 80 78 Z" fill="#c92a2a" stroke="#1d2340" stroke-width="4" stroke-linejoin="round"/>',
    think: '<path d="M48 86 Q60 82 72 86" stroke="#1d2340" stroke-width="5" fill="none" stroke-linecap="round"/>',
    oops: '<ellipse cx="60" cy="86" rx="8" ry="6" fill="#1d2340"/>' }[mood || 'happy'];
  var arms = mood === 'cheer' ? '<path d="M18 62 L2 34" stroke="#e8590c" stroke-width="7" stroke-linecap="round"/><path d="M102 62 L118 34" stroke="#e8590c" stroke-width="7" stroke-linecap="round"/>'
    : '<path d="M18 70 L4 86" stroke="#e8590c" stroke-width="7" stroke-linecap="round"/><path d="M102 70 L116 86" stroke="#e8590c" stroke-width="7" stroke-linecap="round"/>';
  var eyeDy = mood === 'think' ? -4 : 0;
  return '<svg viewBox="0 0 120 135" aria-label="Pip the cube">' +
    '<ellipse cx="60" cy="130" rx="34" ry="5" fill="rgba(0,0,0,.2)"/>' + arms +
    '<path d="M44 116 v12 M76 116 v12" stroke="#e8590c" stroke-width="7" stroke-linecap="round"/>' +
    '<line x1="60" y1="22" x2="60" y2="6" stroke="#e8590c" stroke-width="4"/><circle cx="60" cy="6" r="6" fill="#ff6b6b"/>' +
    '<rect x="16" y="22" width="88" height="94" rx="24" fill="#ffd43b" stroke="#e8590c" stroke-width="5"/>' +
    '<rect x="24" y="28" width="60" height="14" rx="7" fill="rgba(255,255,255,.55)"/>' +
    '<ellipse cx="42" cy="' + (60 + eyeDy) + '" rx="10" ry="12" fill="#fff"/><ellipse cx="78" cy="' + (60 + eyeDy) + '" rx="10" ry="12" fill="#fff"/>' +
    '<circle cx="44" cy="' + (62 + eyeDy * 1.5) + '" r="5.5" fill="#1d2340"/><circle cx="80" cy="' + (62 + eyeDy * 1.5) + '" r="5.5" fill="#1d2340"/>' +
    '<circle cx="46" cy="' + (59 + eyeDy * 1.5) + '" r="1.8" fill="#fff"/><circle cx="82" cy="' + (59 + eyeDy * 1.5) + '" r="1.8" fill="#fff"/>' +
    '<circle cx="30" cy="80" r="6" fill="#ff8787" opacity=".6"/><circle cx="90" cy="80" r="6" fill="#ff8787" opacity=".6"/>' + mouth + '</svg>';
}
function pipHTML(mood, size, cls) { return '<div class="pip ' + (cls || '') + '" style="width:' + size + 'px;height:' + (size * 1.12) + 'px">' + pipSVG(mood) + '</div>'; }
function avatarHTML(o, cls) { if (o.id === 'pip') return pipHTML('happy', cls === 'sm' ? 32 : 54, ''); return '<span class="avatar ' + (cls || '') + '" style="background:' + o.color + '">' + o.emoji + '</span>'; }
function medalHTML(b, earned) { return '<div class="medal tier-' + b.tier + (earned ? '' : ' locked') + '"><span>' + b.icon + '</span></div>'; }

// Render tokens (cube objects, {s,id} tokens, or plain symbols) as mini cubes
function tokensHTML(tokens, cubes, cls) {
  return tokens.map(function (t, i) {
    var s = typeof t === 'string' ? t : t.s;
    if (s === '(' || s === ')') return '<span class="paren" data-bi="' + i + '">' + s + '</span>';
    var color = (typeof t === 'object' && t.id != null && cubes && cubes[t.id]) ? cubes[t.id].color : 'none';
    return '<span class="cube ' + (cls || 'mini') + ' c-' + color + '" data-bi="' + i + '"><span>' + show(s) + '</span></span>';
  }).join('');
}
function exprBox(tokens, cubes) { return '<div class="expr">' + tokensHTML(tokens, cubes) + '</div>'; }

// ======================= SCREENS =======================
var current = 'splash';
function go(id) {
  document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('on', s.id === id); });
  current = id;
}
var lastTheme = '';
function applyCosmetics() {
  document.body.className = 'mat-' + S.cos.mat + ' skin-' + S.cos.skin;
  var th = S.cos.mat + S.cos.skin; if (T3.supported && th !== lastTheme) { if (lastTheme) T3.retheme(); lastTheme = th; }
}

// ----- Intro -----
var introTimers = [];
function runIntro() {
  go('intro');
  var colors = ['red', 'blue', 'green', 'black'], k = 0;
  function row(word) {
    return '<div class="it-row">' + word.split('').map(function (ch, i) {
      var c = colors[k++ % 4], d = 150 + k * 140;
      return '<span class="cube it-cube c-' + c + '" style="--tx:' + Math.round((Math.random() - 0.5) * 500) + 'px;--rot:' + Math.round((Math.random() - 0.5) * 900) + 'deg;animation-delay:' + d + 'ms"><span>' + ch + '</span></span>';
    }).join('') + '</div>';
  }
  var el = $('#intro');
  el.innerHTML = '<div id="introTitle">' + row("TATA'S") + row('EQUATIONS') + '</div><div id="introPip" style="height:150px"></div><div class="skiphint">Tap to skip</div>';
  el.onclick = finishIntro;
  introTimers = [
    setTimeout(function () { Snd.clatter(); }, 250),
    setTimeout(function () { Snd.clatter(); }, 1100),
    setTimeout(function () { $('#introTitle').classList.add('intro-glow'); Snd.fanfare(); FX.burst(innerWidth / 2, innerHeight * 0.35, 90); }, 2650),
    setTimeout(function () { $('#introPip').innerHTML = '<div class="pop-in">' + pipHTML('cheer', 120, 'cheer') + '</div>'; }, 3400),
    setTimeout(finishIntro, 6400)
  ];
}
function finishIntro() {
  introTimers.forEach(clearTimeout); introTimers = [];
  $('#intro').onclick = null;
  if (S.lastDedication !== today()) { S.lastDedication = today(); persist(); showDedication(); }
  else gotoTitle();
}
var dediTimer = null;
function showDedication() {
  go('dedication');
  var el = $('#dedication');
  el.innerHTML = '<div class="dedi pop-in"><span class="heart">🎲❤️</span>Tata played this game when he was a kid, 40 years ago. Now it\'s your turn.</div><div class="skiphint">Tap to continue</div>';
  el.onclick = function () { clearTimeout(dediTimer); el.onclick = null; gotoTitle(); };
  dediTimer = setTimeout(function () { el.onclick = null; gotoTitle(); }, 3000);
}

// ----- Title -----
function levelFor(xp) { var L = 1; while (xp >= xpForLevel(L + 1)) L++; return L; }
function xpForLevel(L) { return 50 * (L - 1) * L; }
function level() { return levelFor(S.xp); }
function xpBarHTML() {
  var L = level(), a = xpForLevel(L), b = xpForLevel(L + 1), pct = Math.round(100 * (S.xp - a) / (b - a));
  return '<div class="xpbar"><i style="width:' + pct + '%"></i><span>Level ' + L + ' · ' + S.xp + ' / ' + b + ' XP</span></div>';
}
function gotoTitle() {
  applyCosmetics();
  var greets = ['Hi, ' + esc(S.name) + '! Ready to make some equations?', 'Welcome back, ' + esc(S.name) + '! Let\'s roll some cubes!', 'Math time! I\'ve been practicing my wiggles.', 'Hi ' + esc(S.name) + '! Every Solution makes your brain stronger!'];
  var st = STAGES[stageIdx()];
  $('#title').innerHTML =
    '<div class="logo" style="margin-top:10px">Tata\'s<span class="eq">Equations</span></div>' +
    '<div class="row" style="margin:10px 0">' + pipHTML('happy', 110, 'bob') + '<div class="bubble">' + greets[Math.floor(Math.random() * greets.length)] + '</div></div>' +
    xpBarHTML() +
    '<div style="color:#fff;font-weight:700;margin:6px 0 14px">' + st.icon + ' Now playing with: ' + st.name + (S.unlockAll || stageIdx() === STAGES.length - 1 ? '' : ' · ⭐ ' + S.ladder.stars + '/' + STAGES[S.ladder.stage].need + ' to unlock the next one') + '</div>' +
    '<div class="menu">' +
    '<button class="btn big green" data-act="setup">▶ Play</button>' +
    '<button class="btn big yellow" data-act="daily">📅 Daily Puzzle</button>' +
    '<button class="btn big purple" data-act="trophies">🏆 Trophy Room</button>' +
    '<button class="btn big blue" data-act="settings">⚙️ Settings</button>' +
    '</div>' +
    '<div class="row" style="margin-top:14px"><button class="btn ghost" data-act="tutorial">🎓 How to Play</button><button class="btn ghost" data-act="stats">📈 My Stats</button></div>' +
    (storageOK ? '' : '<p class="white" style="font-size:14px">(Saving is turned off in this browser, so progress lasts until you close the page. Use Settings → Export to keep it.)</p>');
  go('title');
  Snd.musicOn();
}
