/* ===== 導出選單（v.96）=====
   點 ⬇️ 之後跳出的小彈窗，讓使用者選要下載音檔還是譜例。
   七個練習頁共用這一支，彈窗的 DOM 第一次用到時才建立。 */
(function (global) {
  'use strict';

  var EL_ID = 'exportMenuModal';
  var current = null;    // { onAudio, onSheet, onSheet2, audioLabel, sheetLabel, sheet2Label }
  var LABEL = { audio: '🎵 下載音檔', sheet: '🖼️ 下載譜例' };

  function ensureDom() {
    if (document.getElementById(EL_ID)) return;

    var style = document.createElement('style');
    style.textContent =
      '#' + EL_ID + '{ display:none; position:fixed; inset:0; z-index:1400;' +
      ' background:rgba(38,36,32,0.55); padding:24px 16px; overflow-y:auto; }' +
      '#' + EL_ID + '.open{ display:flex; align-items:center; justify-content:center; }' +
      '#' + EL_ID + ' .em-box{ background:var(--paper,#efeee6); border:1px solid var(--panel-border,#ddd8c9);' +
      ' border-radius:16px; width:100%; max-width:320px; padding:24px 22px; text-align:center;' +
      ' box-shadow:0 20px 50px rgba(0,0,0,0.28); }' +
      '#' + EL_ID + ' h3{ font-size:19px; font-weight:600; margin:0 0 4px; color:var(--ink,#262420); }' +
      '#' + EL_ID + ' .em-sub{ font-size:12.5px; color:var(--ink-soft,#75705f); margin:0 0 18px; line-height:1.7; }' +
      '#' + EL_ID + ' .em-btn{ display:block; width:100%; margin:0 0 10px; padding:13px 12px; font:inherit;' +
      ' font-size:14.5px; border-radius:11px; cursor:pointer; border:1px solid var(--accent,#33415c);' +
      ' background:var(--accent,#33415c); color:#fff; }' +
      '#' + EL_ID + ' .em-btn.ghost{ background:transparent; color:var(--accent,#33415c); }' +
      '#' + EL_ID + ' .em-btn[disabled]{ opacity:0.5; cursor:not-allowed; }' +
      '#' + EL_ID + ' .em-cancel{ background:none; border:none; font:inherit; font-size:13.5px;' +
      ' color:var(--ink-soft,#75705f); text-decoration:underline; cursor:pointer; padding:6px 10px; margin-top:2px; }';
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.id = EL_ID;
    wrap.innerHTML =
      '<div class="em-box">' +
        '<h3>導出</h3>' +
        '<p class="em-sub" id="em-sub">選擇要下載的內容</p>' +
        '<button type="button" class="em-btn" id="em-audio">🎵 下載音檔</button>' +
        '<button type="button" class="em-btn ghost" id="em-sheet">🖼️ 下載譜例</button>' +
        /* 第三顆（v.98）：只有傳入 onSheet2 的頁面才顯示，例如找錯音的「正確譜例」 */
        '<button type="button" class="em-btn ghost" id="em-sheet2" style="display:none;"></button>' +
        '<button type="button" class="em-cancel" id="em-cancel">取消</button>' +
      '</div>';
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    document.body.appendChild(wrap);

    document.getElementById('em-cancel').onclick = close;
    document.getElementById('em-audio').onclick = function () {
      var fn = current && current.onAudio; close(); if (fn) fn();
    };
    document.getElementById('em-sheet').onclick = function () {
      var fn = current && current.onSheet; close(); if (fn) fn();
    };
    document.getElementById('em-sheet2').onclick = function () {
      var fn = current && current.onSheet2; close(); if (fn) fn();
    };
  }

  function lock(on) {
    /* 各頁有自己的 syncBodyLock，沒有的話就直接處理 */
    if (typeof global.syncBodyLock === 'function') { global.syncBodyLock(); return; }
    try { document.body.style.overflow = on ? 'hidden' : ''; } catch (e) {}
  }

  function open(opts) {
    ensureDom();
    current = opts || {};
    var sub = document.getElementById('em-sub');
    if (sub) sub.textContent = current.subtitle || '選擇要下載的內容';
    var bA = document.getElementById('em-audio'), bS = document.getElementById('em-sheet'), bS2 = document.getElementById('em-sheet2');
    /* 沒給文字就用原本的，其他七頁的選單完全不變 */
    bA.textContent = current.audioLabel || LABEL.audio;
    bS.textContent = current.sheetLabel || LABEL.sheet;
    bA.disabled = !current.onAudio;
    bS.disabled = !current.onSheet;
    bS2.style.display = current.onSheet2 ? '' : 'none';
    bS2.textContent = current.sheet2Label || '';
    document.getElementById(EL_ID).classList.add('open');
    lock(true);
  }
  function close() {
    var el = document.getElementById(EL_ID);
    if (el) el.classList.remove('open');
    current = null;
    lock(false);
  }

  global.ExportMenu = { open: open, close: close };
})(window);
