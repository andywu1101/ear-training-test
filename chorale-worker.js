/* 聖詠和聲：在背景出題，畫面不會卡住（v111） */
importScripts('chorale-engine.js', 'chorale-gen.js');
var E = self.ChoraleEngine;
var G = self.ChoraleGen.make({ HE: E.HARMONY_ENGINE, KEYS: E.ALL_KEYS, letterIndexOfTone: E.letterIndexOfTone, displayChord: E.displayChord });
self.onmessage = function (e) {
  var d = e.data || {};
  var q = null;
  try { q = G.generate(d.cfg); } catch (err) { q = null; }
  self.postMessage({ id: d.id, q: q });
};
