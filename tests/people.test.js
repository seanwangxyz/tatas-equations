// Checks for js/people-data.js (the avatar shape and the players on a device) and its cloud-merge rules.
// Run: node tests/people.test.js
const fs = require('fs'), path = require('path');
const People = require('../js/people-data.js');
const mm = fs.readFileSync(path.join(__dirname, '../js/account.js'), 'utf8').match(/\/\*MERGE-START\*\/([\s\S]*?)\/\*MERGE-END\*\//);
const AccountMerge = mm ? new Function(mm[1] + ';return AccountMerge;')() : null;
let ok = 0, bad = 0;
function t(name, cond) { if (cond) ok++; else { bad++; console.log('FAIL: ' + name); } }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ----- clean -----
t('nothing gives the kid', same(People.clean(), People.clean(People.DEFAULT)) && People.clean().body === 'kid');
t('rubbish is thrown away', same(People.clean({ body: 'dragon', skin: 'red', hair: '<b>', hairStyle: 7, eyes: null, glasses: 'x', beard: {}, acc: [], height: 9 }), People.clean()));
t('an array is not an avatar', same(People.clean([1, 2]), People.clean()));
t('a grown-up body starts from the grown-up look', People.clean({ body: 'adult-a' }).hairStyle === People.GROWN.hairStyle);
t('hex is lower-cased', People.clean({ skin: '#8A5533' }).skin === '#8a5533');
t('height is -1, 0 or 1', People.clean({ height: -1 }).height === -1 && People.clean({ height: 1 }).height === 1 && People.clean({ height: 5 }).height === 0);
t('flags accept on / off', People.clean({ freckles: 'on', cheeks: 'off' }).freckles === true && People.clean({ cheeks: 'off' }).cheeks === false);
t('no extra keys survive', !('evil' in People.clean({ evil: 1 })));
t('isAdult', People.isAdult({ body: 'adult-a' }) && People.isAdult({ body: 'adult-b' }) && !People.isAdult({ body: 'teen' }) && !People.isAdult(null));
People.BODIES.forEach(b => People.HAIR_STYLES.forEach(h => { const a = People.clean({ body: b[0], hairStyle: h[0] }); t('clean keeps ' + b[0] + ' / ' + h[0], a.body === b[0] && a.hairStyle === h[0]); }));

// ----- pack / unpack -----
let rt = true, longest = 0;
People.BODIES.forEach(b => [-1, 0, 1].forEach(h => People.HAIR_STYLES.forEach(hs => People.GLASSES.forEach(g => People.BEARDS.forEach(be => People.ACCS.forEach(ac => {
  const a = People.clean({ body: b[0], height: h, hairStyle: hs[0], glasses: g[0], beard: be[0], acc: ac[0], gems: g[0] === 'round', streaks: be[0] === 'beard' ? '#e64980' : 'none', freckles: h > 0, lashes: h < 0, cheeks: h === 0, skin: People.SKINS[(hs[0].length + h + 1) % 10][0] });
  const s = People.pack(a); longest = Math.max(longest, s.length);
  if (!same(People.unpack(s), a) || !/^[a-zA-Z0-9.]+$/.test(s)) rt = false;
}))))));
t('pack / unpack round trip for every combination', rt);
t('packed text is short (' + longest + ')', longest <= 170);
t('unpack refuses junk', People.unpack('<script>') === null && People.unpack('a.b') === null && People.unpack(42) === null && People.unpack('x'.repeat(200)) === null);
t('unpack never returns something unclean', (() => { const u = People.unpack('zzz.9.zzzzzz.zzzzzz.zzz.zzzzzz.zzz.zzzzzz.zzz.7.7.7.zzz.zzzzzz.7.zzzzzz'); return u === null || same(u, People.clean(u)); })());

// ----- outfits and starters -----
t('outfit fields are cleaned', (() => { const a = People.clean({ outfit: 'tuxedo', bottom: 'kilt', shoes: 'clogs', fit1: 'red' }); return a.outfit === 'kit' && a.bottom === 'shorts' && a.shoes === 'sneakers' && a.fit1 === People.DEFAULT.fit1; })());
People.OUTFITS.forEach(o => People.BOTTOMS.forEach(b => People.SHOES.forEach(sh => { const a = People.clean({ outfit: o[0], bottom: b[0], shoes: sh[0], fit1: '#ffdeeb', fit3: '#b197fc' }); t('outfit round trip ' + o[0] + ' / ' + b[0] + ' / ' + sh[0], same(People.unpack(People.pack(a)), a)); })));
t('text from before the outfits is still read', (() => { const u = People.unpack('kids.1.efc19d.3b2314.spacebuns.3f2412.none.25262b.none.0.1.1.clips.e64980.1.e64980'); return u && u.hairStyle === 'spacebuns' && u.outfit === 'kit'; })());
t('every starter is clean and has a name', People.STARTERS.every(st => st.id && st.name && same(People.clean(st.avatar), People.clean(People.clean(st.avatar))) && People.starter(st.id) === st));
t('starters use only listed options', People.STARTERS.every(st => { const a = People.clean(st.avatar); return (st.avatar.outfit || 'kit') === a.outfit && (st.avatar.hairStyle || a.hairStyle) === a.hairStyle && (st.avatar.bottom || a.bottom) === a.bottom && (st.avatar.shoes || a.shoes) === a.shoes; }));
t('a brand-new save gets its own kit, not the red classic', (() => { const S2 = { name: 'Champ', xp: 0, kit: {} }; const st = People.freshStart(S2, 0.99); return st && st.id.indexOf('kit-') === 0 && S2.kit.shirt === st.kit.shirt && S2.kit.shirt !== '#c9342c' && S2.backName === 'PLAYER' && S2.freshDone === true && People.freshStart(S2) === null; })());
t('a save that was played or named is left alone', People.freshStart({ name: 'Tyson', xp: 0 }) === null && People.freshStart({ name: 'Champ', xp: 40 }) === null && People.freshStart({ name: 'Champ', avatar: {} }) === null && People.freshStart({ name: 'Champ', stats: { shakes: 3 } }) === null);

// ----- own -----
t('old kid save: hair from the kit', (() => { const a = People.own({ set: { me: 'kid' }, kit: { hair: '#d9a441', hairStyle: 'curly' } }); return a.body === 'kid' && a.hair === '#d9a441' && a.hairStyle === 'curly'; })());
t('old grown-up save', People.own({ set: { me: 'tata' }, kit: { hair: '#d9a441' } }).body === 'adult-b');
t('a saved avatar wins', People.own({ set: { me: 'tata' }, avatar: { body: 'kid-s', hairStyle: 'bun' } }).body === 'kid-s');

// ----- crew -----
const S1 = {};
const mia = People.saveMember({ name: 'Mia', jersey: '9', avatar: { body: 'kid', hairStyle: 'ponytail' } }, S1);
const zoe = People.saveMember({ name: '  Zoe <b> ', jersey: 'x6y', avatar: { body: 'kid-s' } }, S1);
t('two members', People.crew(S1).length === 2 && mia.id !== zoe.id && /^c\d{5}$/.test(mia.id));
t('names and numbers are cleaned', zoe.name === 'Zoe b' && zoe.jersey === '6');
t('member()', People.member(mia.id, S1).name === 'Mia' && People.member('c0', S1) === null);
t('backOf', People.backOf(mia) === 'MIA' && People.backOf(Object.assign({}, mia, { back: 'kk' })) === 'KK');
const k2 = People.saveMember(Object.assign({}, mia, { name: 'Mia W', kit: { shirt: '#1c7ed6' }, kits: { away: { shirt: '#ffffff' } }, kitUse: 'away' }), S1);
t('saving again replaces', People.crew(S1).length === 2 && People.member(mia.id, S1).name === 'Mia W' && k2.at > 0);
t('kitOf home / away', People.kitOf(Object.assign({}, k2, { kitUse: 'home' })).shirt === '#1c7ed6' && People.kitOf(k2).shirt === '#ffffff');
for (let i = 0; i < 10; i++) People.saveMember({ name: 'P' + i }, S1);
t('at most ' + People.MAX_CREW, People.crew(S1).length === People.MAX_CREW && People.saveMember({ name: 'extra' }, S1) === null);
People.removeMember(mia.id, S1);
t('remove', People.member(mia.id, S1) === null && S1.crewGone[mia.id] > 0 && People.crew(S1).length === People.MAX_CREW - 1);
t('a broken list is survived', People.crew({ crew: 'nope' }).length === 0 && People.crew({ crew: [null, 5, { id: 'bad id' }] }).length === 3);

// ----- cloud merge -----
if (AccountMerge) {
  const m = (id, name, at) => ({ id, name, jersey: '9', avatar: { v: 1, body: 'kid' }, kit: {}, kits: { away: {}, third: {} }, kitUse: 'home', at });
  const A = { crew: [m('c11111', 'Mia', 100), m('c22222', 'Zoe', 100)], crewGone: {}, avatar: { v: 1, body: 'kid', hairStyle: 'short', at: 500 } };
  const B = { crew: [m('c11111', 'Mia W', 300), m('c33333', 'Bob', 200)], crewGone: { c22222: 400 }, avatar: { v: 1, body: 'kid', hairStyle: 'bun', at: 900 } };
  const out = AccountMerge.combine(A, B, { aAt: 2, bAt: 1 });
  t('merge: everyone from both', out.crew.map(x => x.id).join() === 'c11111,c33333');
  t('merge: the copy changed last', out.crew[0].name === 'Mia W');
  t('merge: a removed player stays removed', !out.crew.some(x => x.id === 'c22222') && out.crewGone.c22222 === 400);
  t('merge: a player changed after being removed comes back', AccountMerge.combine({ crew: [m('c22222', 'Zoe', 999)] }, B, {}).crew.some(x => x.id === 'c22222'));
  t('merge: the avatar changed last wins', out.avatar.hairStyle === 'bun');
  t('merge: same both ways', same(AccountMerge.combine(B, A, { aAt: 1, bAt: 2 }).crew.map(x => x.id).sort(), out.crew.map(x => x.id).sort()));
  t('merge: at most 8', AccountMerge.combine({ crew: Array.from({ length: 8 }, (_, i) => m('c1000' + i, 'a', 1)) }, { crew: Array.from({ length: 8 }, (_, i) => m('c2000' + i, 'b', 1)) }, {}).crew.length === 8);
} else t('AccountMerge could not be loaded', false);

console.log(ok + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
