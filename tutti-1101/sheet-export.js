/* ===== 譜例導出（v.96）=====
   把解答頁的正解譜例存成 PNG，方便做講義或存進手機相簿。

   作法：各練習頁用 VexFlow 把譜畫成 SVG → 轉成 Image → 畫進 Canvas → 加題號與答案 → 輸出 PNG。

   ⚠ 為什麼不用 VexFlow 的 Canvas 後端直接畫：實測 SVG 這條路更可靠，
     而且 VexFlow 的 SVG 完全是向量路徑（沒有任何 font-family），
     轉檔不會缺字、也不會污染 Canvas。

   ⚠ iOS 不能直接寫入相簿。走系統分享面板之後，使用者再選「儲存影像」才會進相簿。 */
(function (global) {
  'use strict';

  var SCALE = 2;              // 2 倍解析度，印出來才不會糊
  var BG = '#ffffff';         // 純白背景（不是 App 的米白，印刷比較正常）
  var INK = '#262420';
  var SOFT = '#75705f';
  var PER_ROW = 5;            // 並排時每一列幾題
  var PAD = 16;               // 外框留白
  var NUM_H = 26;             // 題號那一行的高度
  var ANS_H = 26;             // 答案那一行的高度
  var MAX_PIXELS = 40e6;      // Canvas 上限，避免手機記憶體爆掉
  var CREDIT_H = 22;          // 右下角來源標註的高度
  var CREDIT = '音樂聽力練習 · andywu1101.github.io/ear-training · Heng-Heng Wu';

  /* SVG 元素 → Image。
     先序列化成 blob URL，讓瀏覽器自己解碼，避免跨來源污染。 */
  function svgToImage(svgEl) {
    return new Promise(function (resolve, reject) {
      var clone = svgEl.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      /* 轉檔時要有明確的寬高，否則有些瀏覽器會畫不出來 */
      var vb = (clone.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
      var w = parseFloat(clone.getAttribute('width')) || (vb[2] || 0);
      var h = parseFloat(clone.getAttribute('height')) || (vb[3] || 0);
      if (!w || !h) {
        try { var r = svgEl.getBoundingClientRect(); w = w || r.width; h = h || r.height; } catch (e) {}
      }
      clone.setAttribute('width', w); clone.setAttribute('height', h);

      var xml = new XMLSerializer().serializeToString(clone);
      var blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve({ img: img, w: w, h: h }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('譜例轉檔失敗')); };
      img.src = url;
    });
  }

  /* items: [{ svg, num, answer }]
     num 是題號（可省略），answer 是答案文字（沒有的頁面就不給）。 */
  async function buildCanvas(items, opts) {
    opts = opts || {};
    var perRow = opts.perRow || PER_ROW;
    var shots = [];
    for (var i = 0; i < items.length; i++) {
      shots.push(await svgToImage(items[i].svg));
    }

    var cellW = Math.max.apply(null, shots.map(function (s) { return s.w; }));
    var cellH = Math.max.apply(null, shots.map(function (s) { return s.h; }));
    var hasNum = items.some(function (it) { return it.num != null; });
    var hasAns = items.some(function (it) { return it.answer; });
    /* overlays 是畫在譜例座標系上的標註（例如四部和聲的級數，
       它在 HTML overlay 裡、不在 SVG 中，而且位置在 SVG 下緣之外），
       所以要多留 extraH 的高度。 */
    var extraH = Math.max.apply(null, items.map(function (it) { return it.extraH || 0; }));
    var blockH = cellH + extraH + (hasNum ? NUM_H : 0) + (hasAns ? ANS_H : 0);

    var cols = Math.min(perRow, items.length);
    var rows = Math.ceil(items.length / perRow);
    var W = PAD * 2 + cols * cellW;
    var H = PAD * 2 + rows * blockH + CREDIT_H;

    /* 題目很多時自動降解析度，避免 Canvas 爆掉 */
    var scale = SCALE;
    while (W * scale * H * scale > MAX_PIXELS && scale > 1) scale -= 0.25;

    var canvas = document.createElement('canvas');
    canvas.width = Math.ceil(W * scale);
    canvas.height = Math.ceil(H * scale);
    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);

    items.forEach(function (it, i) {
      var r = Math.floor(i / perRow), c = i % perRow;
      var x = PAD + c * cellW, y = PAD + r * blockH;
      var s = shots[i];

      if (hasNum && it.num != null) {
        ctx.fillStyle = INK;
        ctx.font = 'bold 15px -apple-system, "PingFang TC", "Noto Sans TC", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(it.num + '.', x + 4, y + 18);
      }
      var sy = y + (hasNum ? NUM_H : 0);
      /* 譜例在格子裡置中（各頁的譜例寬度不一樣） */
      var ox = x + (cellW - s.w) / 2;
      ctx.drawImage(s.img, ox, sy, s.w, s.h);

      /* 標註用的是譜例自己的座標系，平移到圖片上對應的位置即可 */
      if (it.overlays && it.overlays.length) {
        it.overlays.forEach(function (o) {
          ctx.fillStyle = o.color || INK;
          ctx.font = (o.bold ? 'bold ' : '') + (o.size || 15) + 'px ' +
                     (o.font || '-apple-system, "PingFang TC", "Noto Sans TC", sans-serif');
          ctx.textAlign = o.align || 'center';
          ctx.fillText(o.text, ox + o.x, sy + o.y);
        });
      }

      if (hasAns && it.answer) {
        ctx.fillStyle = SOFT;
        ctx.textAlign = 'center';
        /* 答案可能很長（例如四部和聲的整串羅馬級數），
           量一下寬度，放不下就逐步縮字級，避免超出圖片邊界。 */
        var size = 14, maxW = cellW - 12;
        do {
          ctx.font = size + 'px -apple-system, "PingFang TC", "Noto Sans TC", sans-serif';
          if (ctx.measureText(it.answer).width <= maxW) break;
          size -= 1;
        } while (size > 9);
        ctx.fillText(it.answer, x + cellW / 2, sy + cellH + extraH + 18);
      }
    });

    /* 右下角的來源標註：淺灰小字，不干擾譜例，流傳出去也看得出來自哪裡 */
    ctx.fillStyle = '#b5b0a2';
    ctx.font = '11px -apple-system, "PingFang TC", "Noto Sans TC", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(CREDIT, W - PAD, H - 7);

    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) {
        canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('產生圖片失敗')); }, 'image/png');
      } else {
        try {
          var d = canvas.toDataURL('image/png').split(',')[1];
          var bin = atob(d), arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: 'image/png' }));
        } catch (e) { reject(e); }
      }
    });
  }

  function fileName(prefix) {
    var d = new Date();
    var p = function (x) { return String(x).padStart(2, '0'); };
    return prefix + '_譜例_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
         + '-' + p(d.getHours()) + p(d.getMinutes()) + '.png';
  }

  /* 交付與音檔同一套：手機走分享面板（才能存進相簿），桌機走下載。 */
  async function deliver(blob, name) {
    var ua = '';
    try { ua = navigator.userAgent || ''; } catch (e) {}
    var isIOS = /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && (function () { try { return (navigator.maxTouchPoints || 0) > 1; } catch (e) { return false; } })());
    var isAndroid = /Android/.test(ua);
    var file = new File([blob], name, { type: 'image/png' });

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

    if ((isIOS || isAndroid) && navigator.canShare && navigator.canShare({ files: [file] })) {
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

  async function exportSheets(items, prefix, ui) {
    ui = ui || {};
    if (!items || !items.length) throw new Error('沒有可以導出的譜例');
    if (ui.onStage) ui.onStage('render');
    var canvas = await buildCanvas(items, ui);
    if (ui.onStage) ui.onStage('encode');
    var blob = await canvasToBlob(canvas);
    if (ui.onStage) ui.onStage('deliver');
    var r = await deliver(blob, fileName(prefix));
    if (ui.onStage) ui.onStage('done', r);
    return r;
  }

  global.SheetExport = {
    exportSheets: exportSheets,
    buildCanvas: buildCanvas,
    svgToImage: svgToImage,
    fileName: fileName,
    PER_ROW: PER_ROW
  };
})(window);
