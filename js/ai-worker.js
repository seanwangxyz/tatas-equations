'use strict';
// The computer player's background thinker (a Web Worker). It loads the math engine and the
// computer player's decisions (js/ai.js), then answers {id, task, args} with {id, v, result}.
// The page side is AIThink in js/ai.js; if this worker can't start or fails, the page thinks itself.
importScripts('engine.js' + self.location.search, 'ai.js' + self.location.search);

self.onmessage = function (e) {
  var m = e.data || {};
  try {
    if (AI.TASKS.indexOf(m.task) < 0) throw new Error('unknown task ' + m.task);
    self.postMessage({ id: m.id, v: AI.VERSION, result: AI[m.task].apply(null, m.args || []) });
  } catch (err) {
    self.postMessage({ id: m.id, v: AI.VERSION, err: String((err && err.message) || err) });
  }
};
