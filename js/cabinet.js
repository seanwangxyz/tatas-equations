'use strict';
// ======================= TROPHY CABINET =======================
// A screen (#cabinet) that shows everything he has won as real 3D objects in a little trophy room:
//   top shelf: the 4 Cup trophies (js/cup.js, in their own metal and ribbon colours)
//   middle shelf: a crown for each Trio (js/trio.js)
//   bottom shelf: a plaque for each creature he has beaten (gold for the two league bosses)
//   left wall: every badge as a medal (js/progress.js BADGES), one row per tier
//   right wall: season pennants (js/season.js), newest first, plus an empty place for the next one of each league
// Things not won yet stand in their place as see-through outlines (a quiet "this could be yours"), never a nag.
// Drag to look around, scroll / pinch to zoom, tap an item for its story; the tapped item turns once, slowly, and stops.
//
// 3D runs in its own small WebGL renderer (js/three/cabinet.js, loaded on demand) that is created when the screen
// opens and fully disposed when it closes; the match renderer (T3) is left alone. When 3D is off (S.set.three ===
// false), unsupported (T3.supported false), or the module cannot load, the same items are shown as a 2D shelf.
//
// API: Cabinet.open() · Cabinet.close() · Cabinet.items() (the item list) · Cabinet.buttonHTML(cls) · Cabinet.counts()
// Tap handlers added: ACT.cabinet, ACT.cabinetBack, ACT.cabItem (2D), ACT.cabStoryClose, ACT.cab2d, ACT.cab3d.
var Cabinet = (function () {
  var PEN_KIND_NAME = { gold: 'Champions pennant', silver: 'Runners-up pennant', bronze: 'Third place pennant', blue: 'Season finisher pennant' };
  var TIER_RIBBON = { bronze: '#2f8cff', silver: '#22b573', gold: '#ef4565', special: '#7a3cf0' };
  var view = null, loading = false, backTo = 'trophies', force2d = false, gen = 0;

  function E(s) { return typeof esc === 'function' ? esc(s) : String(s); }
  function I(n) { return typeof ico === 'function' ? ico(n) : ''; }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function snd(n) { try { if (typeof Snd !== 'undefined' && Snd && typeof Snd[n] === 'function') Snd[n](); } catch (e) {} }
  function opp(i) { return (typeof OPPONENTS !== 'undefined' && OPPONENTS[i]) || { name: '?', emoji: '?', color: '#eee', title: '' }; }

  // ---------- what goes in the cabinet ----------
  function items() {
    var out = [];
    // cups
    if (typeof Cup !== 'undefined' && Cup.CUPS) {
      var cs = (typeof S !== 'undefined' && S.cups) || { won: {}, list: [] };
      Cup.CUPS.forEach(function (c) {
        var n = (cs.won && cs.won[c.id]) || 0, firstWin = (cs.list || []).filter(function (x) { return x.id === c.id; })[0];
        var nl = (c.opps || []).map(function (i) { return opp(i).name; }), names = nl.length > 1 ? nl.slice(0, -1).join(', ') + ' and ' + nl[nl.length - 1] : nl.join('');
        out.push({ id: 'cup-' + c.id, type: 'cup', won: n > 0, count: n, title: c.name, metal: c.metal, ribbon: c.ribbon, icon: '🏆',
          story: n > 0 ? 'You lifted the ' + c.name + (n > 1 ? ' ' + n + ' times' : '') + '! ' + (firstWin && firstWin.date ? 'The first time was on ' + firstWin.date + '. ' : '') + 'You beat ' + names + ' in a row to win it.'
            : c.blurb + ' Win the quarter-final, semi-final and final (against ' + names + ') to put this cup on the shelf.' + (Cup.isOpen && !Cup.isOpen(c) && c.lockText ? ' ' + c.lockText : '') });
      });
    }
    // crowns
    if (typeof Trio !== 'undefined' && Trio.list) {
      Trio.list().forEach(function (p) {
        var a = opp(p[0]), b = opp(p[1]), won = Trio.won(p[0], p[1]), boss = p[0] === 4 && p[1] === 9, mon = p[0] >= 5;
        out.push({ id: 'crown-' + p[0] + '-' + p[1], type: 'crown', won: won, title: 'Crown: ' + a.name + ' + ' + b.name, icon: '👑',
          color: boss ? '#e8f0ff' : '#ffc83d', cushion: boss ? '#1f2a66' : mon ? '#5f3dc4' : '#c92a4a', gems: boss ? ['#74c0fc', '#e599f7', '#ffffff'] : null,
          story: won ? 'You beat ' + a.name + ' and ' + b.name + ' together, at one table, finishing first on your own!' : 'Play ' + a.name + ' and ' + b.name + ' together in Three at the table, and finish first, to win this crown.' });
      });
    }
    // plaques: each creature beaten
    (typeof OPPONENTS !== 'undefined' ? OPPONENTS : []).forEach(function (o, i) {
      var won = !!(S.beaten && S.beaten[i]), boss = i === 4 || i === 9;
      out.push({ id: 'plaque-' + i, type: 'plaque', won: won, boss: boss, title: (boss ? 'Boss beaten: ' : 'Beaten: ') + o.name, name: o.name, icon: o.emoji, color: o.color,
        portrait: won && window.T3 && typeof T3.portrait === 'function' && T3.active && T3.active() ? function () { try { return T3.portrait(o.kind, o.pack || 'classic', 256); } catch (e) { return null; } } : null,
        story: won ? 'You won a match against ' + o.name + ' ' + o.title + '!' + (boss ? ' The boss of the ' + (i < 5 ? 'Classic League' : 'Monster League') + '!' : '') + (o.tip ? ' (' + o.tip + ')' : '')
          : 'Win a match against ' + o.name + ' ' + o.title + ' to hang this plaque.' + (typeof oppOpen === 'function' && !oppOpen(i) ? ' Unlock ' + o.name + ' first by beating the creature before.' : '') });
    });
    // medals: badges
    (typeof BADGES !== 'undefined' ? BADGES : []).forEach(function (b) {
      var d = S.badges && S.badges[b.id];
      out.push({ id: 'medal-' + b.id, type: 'medal', won: !!d, tier: b.tier, icon: b.icon, ribbon: TIER_RIBBON[b.tier], title: d ? b.name : 'A ' + b.tier + ' badge',
        story: d ? b.name + ': ' + b.hint + ' You earned it on ' + d + '.' : 'How to earn it: ' + b.hint });
    });
    // pennants: finished seasons, newest first, then one empty place per league for the season in progress
    if (typeof Season !== 'undefined' && Season.pennants) {
      var st = Season.state();
      Season.pennants().forEach(function (p, k) {
        out.push({ id: 'pen-' + p.lg + '-' + p.n + '-' + k, type: 'pennant', won: true, kind: p.kind, big: ord(p.place), small: (p.lg === 'c' ? 'Classic' : 'Monster') + ' S' + p.n, icon: '🚩',
          title: (PEN_KIND_NAME[p.kind] || 'Pennant') + ', ' + p.league + ' season ' + p.n,
          story: p.league + ', season ' + p.n + ': you finished ' + ord(p.place) + ' with ' + p.pts + ' points' + (p.date ? ' (' + p.date + ')' : '') + '.' });
      });
      ['c', 'm'].forEach(function (lg) {
        var L = st[lg], name = Season.LEAGUES[lg].name;
        out.push({ id: 'pen-next-' + lg, type: 'pennant', won: false, kind: 'blue', icon: '🚩', title: name + ' season ' + L.n,
          story: 'Finish season ' + L.n + ' of the ' + name + ' (' + (Season.MY_GAMES - L.k) + ' fixture' + (Season.MY_GAMES - L.k === 1 ? '' : 's') + ' to go) and a pennant goes here. Every place wins one!' });
      });
    }
    return out;
  }
  function counts() {
    var it = items(), won = it.filter(function (x) { return x.won; }).length, total = it.filter(function (x) { return x.id.indexOf('pen-next') !== 0; }).length;
    return { won: won, total: total };
  }
  var cache = null;
  function byId(id) { for (var i = 0; i < (cache || []).length; i++) if (cache[i].id === id) return cache[i]; return null; }

  // ---------- story card ----------
  var TYPE_EMOJI = { cup: '🏆', crown: '👑', plaque: '🖼️', medal: '🏅', pennant: '🚩' };
  function story(it) {
    var el = document.getElementById('cabStory'); if (!el || !it) return;
    el.innerHTML = '<div class="cab-sic">' + (it.type === 'medal' || it.type === 'plaque' ? (it.won ? it.icon : '❔') : TYPE_EMOJI[it.type]) + '</div><div class="cab-stx"><b>' + E(it.title) + '</b><p>' + E(it.story) + '</p></div>' +
      '<button class="btn small" data-act="cabStoryClose" aria-label="Close">OK</button>';
    el.className = 'cab-story on' + (it.won ? ' cab-won' : ' cab-empty');
    snd(it.won ? 'chime' : 'click');
  }
  // ---------- the screen ----------
  function use3d() { return !force2d && typeof S !== 'undefined' && S.set && S.set.three !== false && window.T3 && T3.supported; }
  function shelf2d(list) {
    var groups = [['cup', 'Cups'], ['crown', 'Crowns'], ['plaque', 'Creatures beaten'], ['medal', 'Badges'], ['pennant', 'Season pennants']];
    return groups.map(function (g) {
      var l = list.filter(function (x) { return x.type === g[0]; }); if (!l.length) return '';
      return '<h3 class="cab-h">' + TYPE_EMOJI[g[0]] + ' ' + g[1] + ' <small>' + l.filter(function (x) { return x.won; }).length + ' / ' + l.filter(function (x) { return x.id.indexOf('pen-next') !== 0; }).length + '</small></h3><div class="cab-shelf">' +
        l.map(function (x) {
          var pic = x.type === 'cup' ? (typeof Cup !== 'undefined' && Cup.trophySVG ? Cup.trophySVG(x.id.slice(4), 64) : '🏆') : x.type === 'pennant' && x.won && typeof Season !== 'undefined' ? Season.pennantSVG(x.kind, x.big, 64) : '<span class="cab-emo">' + (x.type === 'medal' || x.type === 'plaque' ? x.icon : TYPE_EMOJI[x.type]) + '</span>';
          return '<div class="cab-it ' + (x.won ? 'cab-won' : 'cab-empty') + ' t-' + x.type + (x.tier ? ' tier-' + x.tier : '') + '" data-act="cabItem" data-arg="' + E(x.id) + '"><div class="cab-pic">' + pic + '</div><small>' + E(x.won ? x.title : x.type === 'medal' ? '???' : x.title) + '</small></div>';
        }).join('') + '</div>';
    }).join('');
  }
  function render() {
    cache = items();
    var c = counts(), three = use3d();
    var html = '<div class="hdr"><button class="btn small" data-act="cabinetBack">' + I('back') + ' Back</button><h2>' + I('trophy') + ' Trophy Cabinet</h2>' +
      '<span class="cab-count">' + c.won + ' / ' + c.total + '</span></div>' +
      '<div class="cab-stage' + (three ? ' three' : ' flat') + '" id="cabStage">' +
      (three ? '<div class="cab-hint" id="cabHint">Drag to look around · tap a trophy for its story</div><div class="cab-loading" id="cabLoading">Polishing the trophies…</div>' : '<div class="cab-flat">' + shelf2d(cache) + '</div>') +
      '<div class="cab-story" id="cabStory"></div></div>' +
      '<div class="cab-foot">' + (window.T3 && T3.supported && S.set.three !== false ? '<button class="btn small ghost" data-act="' + (three ? 'cab2d' : 'cab3d') + '">' + (three ? 'Show as a list' : 'Show in 3D') + '</button>' : '') +
      (typeof Fans !== 'undefined' ? Fans.buttonHTML('small ghost') : '') + (typeof Season !== 'undefined' ? '<button class="btn small ghost" data-act="season">' + I('chart') + ' Season Table</button>' : '') + '</div>';
    document.getElementById('cabinet').innerHTML = html;
    if (three) start3d();
  }
  function start3d() {
    var my = ++gen, host = document.getElementById('cabStage');
    if (!host || loading) return;
    loading = true;
    var url; try { url = new URL('js/three/cabinet.js', document.baseURI).href; } catch (e) { url = 'js/three/cabinet.js'; }
    import(url).then(function (mod) {
      loading = false;
      if (my !== gen || typeof current !== 'undefined' && current !== 'cabinet' || !document.getElementById('cabStage')) return;
      try {
        view = mod.mount(document.getElementById('cabStage'), cache, { onTap: function (it) { story(it); hideHint(); }, quality: window.T3 && T3.quality && T3.quality() === 'low' ? 'low' : 'high' });
      } catch (e) { view = null; force2d = true; render(); return; }
      var ld = document.getElementById('cabLoading'); if (ld) ld.remove();
    }, function () { loading = false; if (my !== gen) return; force2d = true; if (typeof current === 'undefined' || current === 'cabinet') render(); });
  }
  function hideHint() { var h = document.getElementById('cabHint'); if (h) h.classList.add('off'); }
  function close() {
    gen++;
    if (view) { try { view.dispose(); } catch (e) {} view = null; }
  }
  function open() {
    if (typeof current !== 'undefined' && current && current !== 'cabinet') backTo = current;
    close();
    if (typeof go === 'function') go('cabinet');
    render();
    watch();
  }
  // leaving the screen any way at all (Back, or another screen opened by go()) disposes the 3D view
  var watching = false;
  function watch() {
    if (watching || typeof MutationObserver === 'undefined') return;
    var sec = document.getElementById('cabinet'); if (!sec) return;
    watching = true;
    new MutationObserver(function () { if (!sec.classList.contains('on') && view) close(); }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  }
  function buttonHTML(cls) { return '<button class="btn ' + (cls || 'purple') + '" data-act="cabinet">' + I('trophy') + ' Trophy Cabinet</button>'; }
  if (typeof ACT !== 'undefined') {
    ACT.cabinet = function () { snd('click'); open(); };
    ACT.cabinetBack = function () { close(); if (backTo === 'trophies' && ACT.trophies) ACT.trophies(); else if (typeof gotoTitle === 'function') gotoTitle(); };
    ACT.cabItem = function (el) { story(byId(el.dataset.arg)); };
    ACT.cabStoryClose = function () { var el = document.getElementById('cabStory'); if (el) el.className = 'cab-story'; snd('click'); };
    ACT.cab2d = function () { close(); force2d = true; render(); };
    ACT.cab3d = function () { close(); force2d = false; render(); };
  }
  return { open: open, close: close, items: items, counts: counts, buttonHTML: buttonHTML, view: function () { return view; } };
})();
