/* ===== 音檔導出（v.94）=====
   把解答頁的正解算成 MP3，讓使用者可以帶著聽、做教材。

   流程：各練習頁提供一串「發聲事件」→ PianoEngine 離線算成音訊 → 編成 MP3 → 交給使用者。

   ⚠ 音色、速度、加工全部依使用者當下的設定，所以導出的檔案
     跟他在 App 裡聽到的完全一樣。

   ⚠ iOS 在「加到主畫面」的 standalone 模式下，傳統的 <a download> 會被靜默忽略
     （不報錯、沒反應、檔案不存在），必須走系統分享面板。這裡沿用導出備份檔那一套。 */
(function (global) {
  'use strict';

  var MP3_KBPS = 128;
  var lameReady = null;

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('載入失敗：' + url)); };
      document.head.appendChild(s);
    });
  }
  async function ensureLame() {
    if (global.lamejs && global.lamejs.Mp3Encoder) return global.lamejs;
    if (!lameReady) lameReady = loadScript('lame.min.js');
    await lameReady;
    if (!global.lamejs || !global.lamejs.Mp3Encoder) throw new Error('MP3 編碼器載入失敗');
    return global.lamejs;
  }

  /* AudioBuffer（float -1～1）→ MP3。
     編碼是純 JS，20 秒的音大約要跑幾秒，所以中間回報進度，畫面才不會像當掉。 */
  async function encodeMp3(buffer, onProgress) {
    var lame = await ensureLame();
    var ch = Math.min(2, buffer.numberOfChannels);
    var enc = new lame.Mp3Encoder(ch, buffer.sampleRate, MP3_KBPS);
    var L = buffer.getChannelData(0);
    var R = (ch > 1) ? buffer.getChannelData(1) : L;
    var n = buffer.length;

    var li = new Int16Array(n), ri = new Int16Array(n);
    for (var i = 0; i < n; i++) {
      var a = L[i], b = R[i];
      li[i] = Math.max(-32768, Math.min(32767, Math.round((a < 0 ? a * 32768 : a * 32767))));
      ri[i] = Math.max(-32768, Math.min(32767, Math.round((b < 0 ? b * 32768 : b * 32767))));
    }

    var chunks = [], BLOCK = 1152 * 20;
    for (var p = 0; p < n; p += BLOCK) {
      var end = Math.min(n, p + BLOCK);
      for (var q = p; q < end; q += 1152) {
        var e2 = Math.min(end, q + 1152);
        var out = (ch > 1)
          ? enc.encodeBuffer(li.subarray(q, e2), ri.subarray(q, e2))
          : enc.encodeBuffer(li.subarray(q, e2));
        if (out.length) chunks.push(new Int8Array(out));
      }
      if (onProgress) onProgress(Math.min(1, end / n));
      /* 讓出主執行緒，畫面才不會凍住 */
      await new Promise(function (r) { setTimeout(r, 0); });
    }
    var last = enc.flush();
    if (last.length) chunks.push(new Int8Array(last));

    var total = chunks.reduce(function (s, c) { return s + c.length; }, 0);
    var merged = new Uint8Array(total), off = 0;
    chunks.forEach(function (c) { merged.set(new Uint8Array(c.buffer, c.byteOffset, c.length), off); off += c.length; });
    return new Blob([merged], { type: 'audio/mpeg' });
  }

  function fileName(prefix) {
    var d = new Date();
    var p = function (x) { return String(x).padStart(2, '0'); };
    return prefix + '_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
         + '-' + p(d.getHours()) + p(d.getMinutes()) + '.mp3';
  }

  /* 交付檔案：iOS 走系統分享面板，安卓與桌機走一般下載。
     v.98：安卓改成直接下載（存到 Download，相簿看得到）。安卓的分享面板沒有「存到相簿」，
     只會列出 LINE、Gmail 等 App；iOS 仍走分享面板，選「儲存影像」才進得了相簿。
     ⚠ iOS 不能退回下載——它會靜默失敗，使用者會以為存好了。 */
  async function deliver(blob, name) {
    var ua = '';
    try { ua = navigator.userAgent || ''; } catch (e) {}
    var isIOS = /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && (function () { try { return (navigator.maxTouchPoints || 0) > 1; } catch (e) { return false; } })());
    var file = new File([blob], name, { type: 'audio/mpeg' });

    function download() {
      try {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        return true;
      } catch (e) { return false; }
    }

    if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return { ok: true };
      } catch (err) {
        if (err && err.name === 'AbortError') return { ok: true, cancelled: true };
        if (!isIOS && download()) return { ok: true };
        return { ok: false, reason: 'share' };
      }
    }
    if (isIOS) return { ok: false, reason: 'ios-no-share' };
    return download() ? { ok: true } : { ok: false, reason: 'download' };
  }

  /* 對外唯一入口。
     events：[{ midi, time, duration, gain }]，由各練習頁組出來（含標準音 A 與預備拍）。 */
  async function exportEvents(events, prefix, ui) {
    ui = ui || {};
    if (!events || !events.length) throw new Error('沒有可以導出的內容');
    if (ui.onStage) ui.onStage('render');
    var audio = await global.PianoEngine.renderOffline(events);
    if (ui.onStage) ui.onStage('encode');
    var blob = await encodeMp3(audio, ui.onProgress);
    if (ui.onStage) ui.onStage('deliver');
    var name = fileName(prefix);
    var r = await deliver(blob, name);
    if (ui.onStage) ui.onStage('done', r);
    return r;
  }

  global.AudioExport = {
    exportEvents: exportEvents,
    encodeMp3: encodeMp3,
    deliver: deliver,
    fileName: fileName
  };
})(window);
