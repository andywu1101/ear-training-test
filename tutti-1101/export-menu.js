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
      ' color:var(--ink-soft,#75705f); text-decoration:underline; cursor:pointer; padding:6px 10px; margin-top:2px; }' +
      /* v.102：譜例格式切換（PNG／PDF）與「全部下載」 */
      '#' + EL_ID + ' .em-fmt{ display:flex; align-items:center; justify-content:center; gap:8px; margin:0 0 14px; font-size:13px; color:var(--ink-soft,#75705f); }' +
      '#' + EL_ID + ' .em-seg{ display:inline-flex; border:1px solid var(--accent,#33415c); border-radius:999px; overflow:hidden; }' +
      '#' + EL_ID + ' .em-seg button{ font:inherit; font-size:13px; padding:5px 14px; border:none; background:transparent; color:var(--accent,#33415c); cursor:pointer; }' +
      '#' + EL_ID + ' .em-seg button.on{ background:var(--accent,#33415c); color:#fff; }' +
      '#' + EL_ID + ' .em-all-title{ font-size:12.5px; color:var(--ink-soft,#75705f); margin:6px 0 8px; }' +
      '#' + EL_ID + ' .em-btn.all{ background:transparent; color:var(--accent,#33415c); border-style:dashed; }';
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.id = EL_ID;
    wrap.innerHTML =
      '<div class="em-box">' +
        '<h3>導出</h3>' +
        '<p class="em-sub" id="em-sub">選擇要下載的內容</p>' +
        '<div class="em-fmt">譜例格式 <span class="em-seg"><button type="button" data-fmt="png">PNG</button><button type="button" data-fmt="pdf">PDF</button></span></div>' +
        '<button type="button" class="em-btn" id="em-audio">🎵 下載音檔</button>' +
        '<button type="button" class="em-btn ghost" id="em-sheet">🖼️ 下載譜例</button>' +
        /* 第三顆（v.98）：只有傳入 onSheet2 的頁面才顯示，例如找錯音的「正確譜例」 */
        '<button type="button" class="em-btn ghost" id="em-sheet2" style="display:none;"></button>' +
        /* v.102：一次下載音檔＋譜例（PNG 與 PDF），全部同一個主檔名 */
        '<div id="em-all" style="display:none;">' +
          '<p class="em-all-title">全部下載（音檔＋譜例 PNG＋PDF）</p>' +
          '<button type="button" class="em-btn all" id="em-all-zip">📦 全部下載（壓縮檔）</button>' +
          '<button type="button" class="em-btn all" id="em-all-files">📂 全部下載（個別檔案）</button>' +
        '</div>' +
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
    Array.prototype.forEach.call(wrap.querySelectorAll('.em-seg button'), function (b) {
      b.onclick = function () { setFormat(b.getAttribute('data-fmt')); paintFormat(); };
    });
    document.getElementById('em-all-zip').onclick = function () { runAll('zip'); };
    document.getElementById('em-all-files').onclick = function () { runAll('files'); };
  }

  /* ---- 譜例格式（記住上次的選擇）---- */
  var FMT_KEY = 'earTrainer.export.sheetFormat';
  function sheetFormat() {
    try { var v = localStorage.getItem(FMT_KEY); if (v === 'pdf' || v === 'png') return v; } catch (e) {}
    return 'png';
  }
  function setFormat(v) { try { localStorage.setItem(FMT_KEY, v === 'pdf' ? 'pdf' : 'png'); } catch (e) {} }
  function paintFormat() {
    var f = sheetFormat(), el = document.getElementById(EL_ID);
    if (!el) return;
    Array.prototype.forEach.call(el.querySelectorAll('.em-seg button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-fmt') === f);
    });
  }

  /* ---- 全部下載（v.102）----
     依序呼叫這一頁原本的「音檔」「譜例」（「正確譜例」）導出，產生的檔案先收起來（__expCollect），
     全部用同一個時間命名，最後打包成一個 zip 或一次交付多個檔案。
     各頁的導出按鈕完成後會鎖 1.6～1.8 秒，所以每一項之間等 1.9 秒再叫下一項。 */
  var busy = false;
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function runAll(mode) {
    if (busy || !current) return;
    var steps = [];
    if (current.onAudio)  steps.push({ fn: current.onAudio,  n: 1 });   // 音檔 1 個
    if (current.onSheet)  steps.push({ fn: current.onSheet,  n: 2 });   // 譜例 PNG＋PDF
    if (current.onSheet2) steps.push({ fn: current.onSheet2, n: 2 });
    close();
    busy = true;
    var col = { date: new Date(), files: [], failed: 0 };
    global.__expCollect = col;
    toast('⏳ 準備中…', 0);
    try {
      for (var i = 0; i < steps.length; i++) {
        var target = col.files.length + col.failed + steps[i].n;
        col.expectNow = steps[i].n;
        toast('⏳ 準備中（' + (i + 1) + '／' + steps.length + '）…', 0);
        steps[i].fn();
        var t0 = Date.now();
        while (col.files.length + col.failed < target && Date.now() - t0 < 120000) await sleep(120);
        if (i < steps.length - 1) await sleep(1900);
      }
    } finally {
      global.__expCollect = null;
      busy = false;
    }
    if (!col.files.length) { toast('✗ 下載失敗，請再試一次', 2500); return; }
    for (var q = 0; q < col.files.length; q++) col.files[q].u8 = new Uint8Array(await col.files[q].blob.arrayBuffer());
    var base = col.files[0].name.replace(/\.[^.]+$/, '').replace(/_[^_]*譜例$/, '');
    var r = (mode === 'zip') ? await deliverZip(col.files, base) : await deliverFiles(col.files, base);
    if (r === 'fallback-zip') r = await deliverZip(col.files, base, '這個瀏覽器不支援一次下載多個檔案，已改用壓縮檔');
    if (col.failed) toast('⚠ 有部分檔案產生失敗，已下載其餘 ' + col.files.length + ' 個', 3500);
  }

  function isIOS() {
    var ua = ''; try { ua = navigator.userAgent || ''; } catch (e) {}
    return /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && (function () { try { return (navigator.maxTouchPoints || 0) > 1; } catch (e) { return false; } })());
  }
  function downloadOne(blob, name) {
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (e) { return false; }
  }
  async function shareFiles(files, title) {
    var fs = files.map(function (f) { return new File([f.blob], f.name, { type: f.blob.type || 'application/octet-stream' }); });
    if (!(navigator.canShare && navigator.canShare({ files: fs }))) return false;
    try { await navigator.share({ files: fs, title: title }); } catch (e) { /* 使用者取消也算處理完 */ }
    return true;
  }
  async function deliverZip(files, base, note) {
    var zip = makeZip(files, new Date());
    var name = base + '.zip';
    if (isIOS()) {
      toast('', 1);
      if (!(await shareFiles([{ blob: zip, name: name }], name))) toast('✗ 這個裝置無法分享壓縮檔', 3000);
      return 'ok';
    }
    downloadOne(zip, name);
    toast(note ? ('✓ ' + note) : '✓ 下載完成（' + files.length + ' 個檔案的壓縮檔）', note ? 3500 : 2200);
    return 'ok';
  }
  async function deliverFiles(files, base) {
    if (isIOS()) {
      toast('', 1);
      if (!(await shareFiles(files, base))) return 'fallback-zip';
      return 'ok';
    }
    /* 電腦 Safari 常擋下連續下載，直接改用壓縮檔 */
    var ua = ''; try { ua = navigator.userAgent || ''; } catch (e) {}
    if (/Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox|Android/.test(ua)) return 'fallback-zip';
    for (var i = 0; i < files.length; i++) { downloadOne(files[i].blob, files[i].name); await sleep(400); }
    toast('✓ 已下載 ' + files.length + ' 個檔案（只看到一個的話，請允許網站下載多個檔案，或改用壓縮檔）', 4000);
    return 'ok';
  }

  /* ---- 產生 zip（不壓縮，mp3／png／pdf 本身已經壓縮過）----
     檔名用 UTF-8 並設定旗標，Windows 解壓中文檔名才不會變亂碼。 */
  var CRC_T = null;
  function crc32(u8) {
    if (!CRC_T) { CRC_T = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); CRC_T[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) crc = CRC_T[(crc ^ u8[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function makeZip(files, date) {
    var enc = new TextEncoder();
    var dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    var dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    var parts = [], central = [], offset = 0;
    var datas = files.map(function (f) { return f.u8; });
    files.forEach(function (f, i) {
      var nameB = enc.encode(f.name), data = datas[i], crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nameB, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nameB.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nameB);
      offset += 30 + nameB.length + data.length;
    });
    var cdSize = central.reduce(function (s, u) { return s + u.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
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
    paintFormat();
    /* 有音檔也有譜例時才顯示「全部下載」 */
    document.getElementById('em-all').style.display = (current.onAudio && current.onSheet) ? '' : 'none';
    document.getElementById(EL_ID).classList.add('open');
    lock(true);
  }
  function close() {
    var el = document.getElementById(EL_ID);
    if (el) el.classList.remove('open');
    current = null;
    lock(false);
  }

  /* 下載完成的提示（v.98）：畫面下方的深色膠囊，顯示 1.5 秒後淡出。
     安卓與電腦直接下載時沒有任何回饋（vivo 實測），所以補這一句。
     iOS 走分享面板，有系統自己的畫面，不呼叫這裡。
     ⚠ 網頁只知道「已把檔案交給瀏覽器下載」，無法確認真的存好；譜例與音檔都很小，實際上沒有落差。 */
  var toastTimer = null;
  function notifyDownloaded() {
    var isAndroid = false;
    try { isAndroid = /Android/.test(navigator.userAgent || ''); } catch (e) {}
    var msg = isAndroid ? '✓ 下載完成，已存到 Download' : '✓ 下載完成';
    var el = document.getElementById('exportDoneToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'exportDoneToast';
      el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:2000;' +
        'background:rgba(38,36,32,0.92);color:#fff;font-size:13.5px;line-height:1.4;' +
        'padding:9px 16px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,0.3);' +
        'pointer-events:none;white-space:nowrap;transition:opacity .4s ease;';
      document.body.appendChild(el);
    }
    clearTimeout(toastTimer);
    el.textContent = msg;
    el.style.display = '';
    el.style.opacity = '1';
    toastTimer = setTimeout(function () {
      el.style.opacity = '0';                                   // 淡出 0.4 秒
      toastTimer = setTimeout(function () { el.style.display = 'none'; }, 400);
    }, 1500);
  }

  /* 通用提示（v.102）：ms=0 一直顯示，直到下一次呼叫；msg 空字串＝收起 */
  function toast(msg, ms) {
    var el = document.getElementById('exportDoneToast');
    if (!el) { notifyDownloaded(); el = document.getElementById('exportDoneToast'); }
    clearTimeout(toastTimer);
    if (!msg) { el.style.display = 'none'; return; }
    el.textContent = msg; el.style.display = ''; el.style.opacity = '1';
    el.style.whiteSpace = 'normal'; el.style.maxWidth = '92vw'; el.style.textAlign = 'center';
    if (ms > 0) toastTimer = setTimeout(function () {
      el.style.opacity = '0';
      toastTimer = setTimeout(function () { el.style.display = 'none'; }, 400);
    }, ms);
  }

  global.ExportMenu = { open: open, close: close, notifyDownloaded: notifyDownloaded,
                        sheetFormat: sheetFormat, makeZip: makeZip, toast: toast };
})(window);
