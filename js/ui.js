'use strict';
// ======================= ICONS =======================
// Small line icons so key buttons don't depend on emoji. ico(name) -> inline SVG using currentColor.
var ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  bolt: '<path d="M13.5 2L4.5 13.5H11L10 22l9-11.5h-6.5z"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.7 5.7l12.6 12.6"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0012 3z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  play: '<path d="M7 4.5v15l13-7.5z"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 01-10 0zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M12 14v4M8 21h8M9 18h6"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5zM6 11.5V16c3 2.4 9 2.4 12 0v-4.5"/>',
  chart: '<path d="M4 20V11M10 20V4M16 20v-6M22 20H2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="8.5" cy="15.5" r="1"/><circle cx="15.5" cy="15.5" r="1"/>',
  pencil: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7.6 4.3 4.3 0 0119.5 10c0 5.4-7.5 10-7.5 10z"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5M15.5 14.8c3 0 5.5 1.6 5.5 5"/>',
  sound: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>',
  paw: '<circle cx="7" cy="10" r="1.8"/><circle cx="17" cy="10" r="1.8"/><circle cx="10" cy="6.5" r="1.8"/><circle cx="14" cy="6.5" r="1.8"/><path d="M12 12c-3 0-5 3-5 5 0 1.6 1.5 2 3 1.5 1.4-.5 2.6-.5 4 0 1.5.5 3-.1 3-1.5 0-2-2-5-5-5z"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  home: '<path d="M4 11l8-7 8 7M6 10v10h12V10"/>',
  disk: '<path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/>'
};
var ICON_FILL = { bolt: 'f', play: 'f', star: 'fs' };
function ico(name, extra) { return '<svg class="ico ' + (ICON_FILL[name] || '') + (extra ? ' ' + extra : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>'; }

// ======================= ART =======================
// Pip: a friendly yellow cube. Calm and still; the mood only changes the face and arms.
var pipUid = 0;
function pipSVG(mood) {
  mood = mood || 'happy';
  var id = 'pg' + (++pipUid), ink = '#1d2340';
  var brows = '', eyes, mouth, arms, extra = '';
  var armStyle = 'stroke="#e8590c" stroke-width="8" stroke-linecap="round" fill="none"';
  if (mood === 'cheer') {
    eyes = '<path d="M33 62 Q42 50 51 62" stroke="' + ink + '" stroke-width="5.5" fill="none" stroke-linecap="round"/><path d="M69 62 Q78 50 87 62" stroke="' + ink + '" stroke-width="5.5" fill="none" stroke-linecap="round"/>';
    mouth = '<path d="M41 76 Q60 106 79 76 Z" fill="#c92a2a" stroke="' + ink + '" stroke-width="4" stroke-linejoin="round"/><path d="M48 90 Q60 98 72 90 Q60 84 48 90Z" fill="#ff8787"/>';
    arms = '<path d="M17 70 Q4 56 6 36" ' + armStyle + '/><path d="M103 70 Q116 56 114 36" ' + armStyle + '/><circle cx="6" cy="32" r="7" fill="#fff" stroke="#e8590c" stroke-width="3"/><circle cx="114" cy="32" r="7" fill="#fff" stroke="#e8590c" stroke-width="3"/>';
    extra = '<path d="M104 12 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" fill="#ffd43b" stroke="#e8590c" stroke-width="1.5"/><path d="M16 6 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8z" fill="#ffd43b" stroke="#e8590c" stroke-width="1.5"/>';
  } else {
    var dy = mood === 'think' ? -3 : 0, dx = mood === 'think' ? 3 : 0;
    eyes = '<ellipse cx="42" cy="' + (60 + dy) + '" rx="10.5" ry="12.5" fill="#fff" stroke="' + ink + '" stroke-width="2"/><ellipse cx="78" cy="' + (60 + dy) + '" rx="10.5" ry="12.5" fill="#fff" stroke="' + ink + '" stroke-width="2"/>' +
      '<circle cx="' + (44 + dx) + '" cy="' + (62 + dy * 1.6) + '" r="6" fill="' + ink + '"/><circle cx="' + (80 + dx) + '" cy="' + (62 + dy * 1.6) + '" r="6" fill="' + ink + '"/>' +
      '<circle cx="' + (46.5 + dx) + '" cy="' + (59 + dy * 1.6) + '" r="2" fill="#fff"/><circle cx="' + (82.5 + dx) + '" cy="' + (59 + dy * 1.6) + '" r="2" fill="#fff"/>';
    arms = '<path d="M17 74 Q6 82 5 92" ' + armStyle + '/><path d="M103 74 Q114 82 115 92" ' + armStyle + '/>';
    if (mood === 'think') {
      mouth = '<path d="M50 88 Q60 84 70 87" stroke="' + ink + '" stroke-width="5" fill="none" stroke-linecap="round"/>';
      brows = '<path d="M31 44 Q42 38 52 43" stroke="' + ink + '" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M68 40 Q78 34 90 40" stroke="' + ink + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
      arms = '<path d="M17 74 Q6 82 5 92" ' + armStyle + '/><path d="M103 74 Q94 92 80 94" ' + armStyle + '/>';
      extra = '<circle cx="108" cy="24" r="3" fill="#fff" stroke="#e8590c" stroke-width="1.5"/><circle cx="114" cy="12" r="4.5" fill="#fff" stroke="#e8590c" stroke-width="1.5"/>';
    } else if (mood === 'oops') {
      mouth = '<path d="M46 90 Q53 82 60 90 Q67 98 74 90" stroke="' + ink + '" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
      brows = '<path d="M30 46 L52 38" stroke="' + ink + '" stroke-width="4" stroke-linecap="round"/><path d="M90 46 L68 38" stroke="' + ink + '" stroke-width="4" stroke-linecap="round"/>';
      extra = '<path d="M98 34 Q105 45 98 50 Q91 45 98 34z" fill="#74c0fc" stroke="#1c7ed6" stroke-width="1.5"/>';
    } else {
      mouth = '<path d="M44 82 Q60 98 76 82" stroke="' + ink + '" stroke-width="5" fill="#ff8787" stroke-linecap="round" stroke-linejoin="round"/>';
    }
  }
  return '<svg viewBox="0 0 120 135" aria-label="Pip the cube">' +
    '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset="1" stop-color="#ffc21f"/></linearGradient></defs>' +
    '<ellipse cx="60" cy="130" rx="34" ry="5" fill="rgba(0,0,0,.22)"/>' + arms +
    '<path d="M44 116 v10 M76 116 v10" stroke="#e8590c" stroke-width="8" stroke-linecap="round"/><ellipse cx="42" cy="127" rx="10" ry="4.5" fill="#fff" stroke="#e8590c" stroke-width="2.5"/><ellipse cx="78" cy="127" rx="10" ry="4.5" fill="#fff" stroke="#e8590c" stroke-width="2.5"/>' +
    '<line x1="60" y1="22" x2="60" y2="8" stroke="#e8590c" stroke-width="4" stroke-linecap="round"/><circle cx="60" cy="7" r="6" fill="#ff6b6b" stroke="#c92a2a" stroke-width="2"/>' +
    '<rect x="16" y="22" width="88" height="96" rx="26" fill="url(#' + id + ')" stroke="#e8590c" stroke-width="5"/>' +
    '<path d="M26 106 Q60 119 94 106" stroke="rgba(232,89,12,.28)" stroke-width="8" fill="none" stroke-linecap="round"/>' +
    '<rect x="26" y="29" width="46" height="11" rx="5.5" fill="rgba(255,255,255,.6)"/>' +
    eyes + brows +
    '<circle cx="28" cy="80" r="6.5" fill="#ff8787" opacity=".55"/><circle cx="92" cy="80" r="6.5" fill="#ff8787" opacity=".55"/>' + mouth + extra + '</svg>';
}
function pipHTML(mood, size, cls) { return '<div class="pip ' + (cls || '') + '" style="width:' + size + 'px;height:' + Math.round(size * 1.12) + 'px">' + pipSVG(mood) + '</div>'; }
function avatarHTML(o, cls) { if (o.id === 'pip') return pipHTML('happy', cls === 'sm' ? 32 : 54, ''); return '<span class="avatar ' + (cls || '') + '" style="background:' + o.color + '">' + o.emoji + '</span>'; }
function medalHTML(b, earned) { return '<div class="medal tier-' + b.tier + (earned ? '' : ' locked') + '"><span>' + (earned ? b.icon : '?') + '</span></div>'; }

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

// Scoreboard numbers count up when a player scores (called from renderGame).
var scoreAnim = {}, scoreSeen = null, scoreSeenG = null;
function hudCountUp() {
  if (!G) return;
  if (scoreSeenG !== G) { scoreSeenG = G; scoreSeen = {}; }
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('#gTop .pl[data-pi]').forEach(function (pl) {
    var i = pl.dataset.pi, el = pl.querySelector('.pts'), to = +el.dataset.v, from = scoreSeen[i];
    scoreSeen[i] = to;
    if (from !== undefined && to > from && !reduce) { scoreAnim[i] = { from: from, to: to, t0: performance.now() }; el.textContent = from; }
  });
  if (Object.keys(scoreAnim).length) requestAnimationFrame(tickScores);
}
function tickScores(now) {
  var left = false;
  Object.keys(scoreAnim).forEach(function (i) {
    var a = scoreAnim[i], k = Math.min(1, (now - a.t0 - 350) / 700), el = document.querySelector('#gTop .pl[data-pi="' + i + '"] .pts');
    if (!el) { delete scoreAnim[i]; return; }
    if (k < 0) { left = true; return; }
    el.textContent = Math.round(a.from + (a.to - a.from) * (1 - Math.pow(1 - k, 3)));
    if (k >= 1) delete scoreAnim[i]; else left = true;
  });
  if (left) requestAnimationFrame(tickScores);
}

// ======================= SCREENS =======================
var current = 'splash';
function go(id) {
  document.querySelectorAll('.screen').forEach(function (s) {
    var on = s.id === id;
    if (on && !s.classList.contains('on')) s.scrollTop = 0;
    s.classList.toggle('on', on);
  });
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
  el.innerHTML = '<div class="dedi pop-in"><span class="heart">' + ico('heart', 'f') + '</span>Tata played this game when he was a kid, 40 years ago. Now it\'s your turn.</div><div class="skiphint">Tap to continue</div>';
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
  var greets = ['Hi, ' + esc(S.name) + '! Ready to make some equations?', 'Welcome back, ' + esc(S.name) + '! Let\'s roll some cubes!', 'Math time! I\'ve been practicing my moves.', 'Hi ' + esc(S.name) + '! Every Solution makes your brain stronger!'];
  var st = STAGES[stageIdx()];
  $('#title').innerHTML =
    '<div class="title-top"><div class="logo">Tata\'s<span class="eq">Equations</span></div></div>' +
    '<div class="row" style="margin:4px 0 10px;flex-wrap:nowrap">' + pipHTML('happy', 100, '') + '<div class="bubble">' + greets[Math.floor(Math.random() * greets.length)] + '</div></div>' +
    '<div class="playercard"><span class="jersey">' + esc(S.jersey || '7') + '</span><div class="pc-main"><div class="pc-name">' + esc(S.name) + '</div>' + xpBarHTML() + '</div></div>' +
    '<div class="stagechip">' + st.icon + ' Playing with: ' + st.name + (S.unlockAll || stageIdx() === STAGES.length - 1 ? '' : ' · ' + ico('star') + ' ' + S.ladder.stars + '/' + STAGES[S.ladder.stage].need + ' to unlock the next one') + '</div>' +
    '<div class="menu">' +
    '<button class="btn big green hero" data-act="setup">' + ico('play') + ' Play</button>' +
    '<button class="btn big yellow" data-act="camp">' + ico('star') + ' Training Camp</button>' +
    '<button class="btn big purple" data-act="trophies">' + ico('trophy') + ' Trophy Room</button>' +
    '<button class="btn big blue" data-act="settings">' + ico('gear') + ' Settings</button>' +
    '<button class="btn big orange" data-act="tutorial">' + ico('cap') + ' How to Play</button>' +
    '</div>' +
    '<div class="menu-sub"><button class="btn ghost" data-act="stats">' + ico('chart') + ' My Stats</button></div>' +
    (storageOK ? '' : '<p class="white" style="font-size:14px">(Saving is turned off in this browser, so progress lasts until you close the page. Use Settings → Export to keep it.)</p>');
  go('title');
  Snd.setMood('menu');
}
