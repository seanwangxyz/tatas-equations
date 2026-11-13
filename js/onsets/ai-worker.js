'use strict';
// The On-Sets computer player's background thinker (a Web Worker). Loads the On-Sets engine and decisions
// (same folder), then answers {id, task, args} with {id, v, result}. The page side is OSThink in js/onsets/ai.js.
importScripts('engine.js' + self.location.search, 'ai.js' + self.location.search);
self.onmessage = function (e) {
  var m = e.data || {};
  try {
    if (OSAI.TASKS.indexOf(m.task) < 0) throw new Error('unknown task ' + m.task);
    self.postMessage({ id: m.id, v: OSAI.VERSION, result: OSAI[m.task].apply(null, m.args || []) });
  } catch (err) {
    self.postMessage({ id: m.id, v: OSAI.VERSION, err: String((err && err.message) || err) });
  }
};
