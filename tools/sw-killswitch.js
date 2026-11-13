// EMERGENCY ONLY. If the offline app ever goes wrong for everyone, copy this file over sw.js and publish:
//   cp tools/sw-killswitch.js sw.js   (then git commit + push)
// Every device that opens the game (or is still open) picks it up on its next update check, deletes the game's
// caches, removes the service worker and reloads the page fresh from the internet. Saves (localStorage) are not touched.
// js/pwa.js can stay: it sees the marker TATA_SW_OFF, stops registering, and checks sw.js again once a day.
// To turn offline play back on later: restore the real sw.js (git checkout <commit> -- sw.js) and run tools/build-precache.js.
'use strict';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('tata-')) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) {
      try { c.postMessage({ type: 'TATA_SW_OFF' }); } catch (e) {}
      // ?swoff=1 tells js/pwa.js not to register again (no reload loop); it re-checks sw.js once a day.
      try { const u = new URL(c.url); u.searchParams.set('swoff', '1'); c.navigate(u.href); } catch (e) {}
    }
  })());
});
// No fetch handler: from now on every request goes straight to the network.
