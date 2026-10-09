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
  var NUM_H = 22;             // 題號那一行的高度
  var ANS_H = 24;             // 答案那一行的高度
  var TITLE_H = 24;           // 譜例上方標題那一行的高度（v.98，找錯音的「題目：共 N 個錯音」）
  var MAX_PIXELS = 40e6;      // Canvas 上限，避免手機記憶體爆掉
  var CREDIT_H = 22;          // 右下角來源標註的高度
  var CREDIT = '音樂聽力練習 · andywu1101.github.io/ear-training · Heng-Heng Wu';

  /* SVG 元素 → Image。
     先序列化成 blob URL，讓瀏覽器自己解碼，避免跨來源污染。 */
  function svgToImage(svgEl, opt) {
    opt = opt || {};
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

      /* 量出 SVG 裡「實際有內容」的垂直範圍與符頭的水平中心。
         VexFlow 畫大譜表時上方會空 70px 左右、下方 45px，
         不裁掉的話題號與答案會離譜例很遠；而符頭不在 SVG 正中央
         （有臨時記號時還會右移），答案要對齊它才不會看起來歪掉。 */
      var box = (function () {
        var minY = Infinity, maxY = -Infinity, hMin = Infinity, hMax = -Infinity;
        try {
          svgEl.querySelectorAll('path').forEach(function (pth) {
            var d = pth.getAttribute('d') || '';
            var re = /[ML]\s*(-?[0-9.]+)[ ,]+(-?[0-9.]+)/g, m;
            while ((m = re.exec(d))) {
              var y = parseFloat(m[2]);
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          });
          svgEl.querySelectorAll('.vf-notehead path').forEach(function (pth) {
            var m = (pth.getAttribute('d') || '').match(/M\s*(-?[0-9.]+)/);
            if (!m) return;
            var x = parseFloat(m[1]);
            if (x < hMin) hMin = x;
            if (x > hMax) hMax = x;
          });
        } catch (e) {}
        return {
          top: isFinite(minY) ? minY : 0,
          bottom: isFinite(maxY) ? maxY : 0,
          headCentre: isFinite(hMin) ? (hMin + hMax + 13) / 2 : null
        };
      })();

      /* 導出專用：把符頭移到音符原本置中的位置。
         App 的 alignAndCentreGrand 是以「含臨時記號的外框」置中（避免記號撞到譜號），
         所以有記號的題目符頭會偏右。這裡只把那段偏移補回來——
         dx = 外框中心 − 符頭中心，無記號時為 0（不動），不需要知道譜表的絕對位置。
         ⚠ 只動這份 clone，不影響畫面上的譜例。 */
      (function () {
        try {
          /* 整段旋律（找錯音）不需要：它是給單一和絃置中用的，
             平移後音符會和頁面另外疊上去的色框錯開。 */
          if (opt.centre === false) return;
          if (box.headCentre == null) return;
          var HEAD_W = 13;
          var bMin = Infinity, bMax = -Infinity;
          clone.querySelectorAll('.vf-stavenote path').forEach(function (pth) {
            var m = (pth.getAttribute('d') || '').match(/M\s*(-?[0-9.]+)/);
            if (!m) return;
            var x = parseFloat(m[1]);
            if (x < bMin) bMin = x;
            if (x > bMax) bMax = x;
          });
          if (!isFinite(bMin)) return;
          var dx = (bMin + bMax + HEAD_W) / 2 - box.headCentre;
          if (Math.abs(dx) < 0.05) return;

          var shift = function (el) {
            var cur = el.getAttribute('transform') || '';
            var m = cur.match(/translate\(\s*(-?[0-9.]+)/);
            el.setAttribute('transform', 'translate(' + ((m ? parseFloat(m[1]) : 0) + dx).toFixed(2) + ',0)');
          };
          clone.querySelectorAll('.vf-stavenote').forEach(shift);
          /* 加線不在群組裡，要跟著走（短的水平線段） */
          clone.querySelectorAll('path').forEach(function (pth) {
            if (pth.closest && pth.closest('.vf-stavenote')) return;
            var m = (pth.getAttribute('d') || '')
              .match(/^M\s*(-?[0-9.]+)\s+(-?[0-9.]+)\s*L\s*(-?[0-9.]+)\s+(-?[0-9.]+)\s*$/);
            if (!m) return;
            if (Math.abs(parseFloat(m[2]) - parseFloat(m[4])) > 0.5) return;
            var len = parseFloat(m[3]) - parseFloat(m[1]);
            if (len > 40 || len < 4) return;
            shift(pth);
          });
          box.headCentre += dx;        // 答案文字要跟著移到新的符頭位置
        } catch (e) {}
      })();

      var xml = new XMLSerializer().serializeToString(clone);
      var blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve({ img: img, w: w, h: h, box: box }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('譜例轉檔失敗')); };
      img.src = url;
    });
  }

  /* items: [{ svg, num, answer }]
     num 是題號（可省略），answer 是答案文字（沒有的頁面就不給）。 */
  function rowsCount(items, perRow) { return Math.ceil(items.length / perRow); }

  async function buildCanvas(items, opts) {
    opts = opts || {};
    var perRow = opts.perRow || PER_ROW;
    var shots = [];
    for (var i = 0; i < items.length; i++) {
      shots.push(await svgToImage(items[i].svg, { centre: items[i].centre }));
    }

    /* 裁掉 SVG 上下的空白，題號與答案才不會離譜例太遠。
       上下各留 PEEK 的餘裕，避免切到加線或臨時記號的邊緣。
       有 overlays 的頁面（四部和聲的級數畫在 SVG 下緣之外）不裁下緣。 */
    var PEEK = 8;
    var anyOverlay = items.some(function (it) { return it.overlays && it.overlays.length; });
    /* ⚠ 所有格子必須用「同一個」裁切範圍。
       逐格依自己的內容裁，各格裁掉的量不同，譜例在格子裡的垂直位置就會參差不齊。
       取全部的最小上緣與最大下緣，換來的是每一排都對齊。 */
    var allTop = Infinity, allBottom = -Infinity;
    shots.forEach(function (sh) {
      var b = sh.box || {};
      if ((b.top != null) && b.top < allTop) allTop = b.top;
      if ((b.bottom != null) && b.bottom > allBottom) allBottom = b.bottom;
    });
    var cutTop = (anyOverlay || !isFinite(allTop)) ? 0 : Math.max(0, Math.floor(allTop - PEEK));
    shots.forEach(function (sh) {
      sh.cutTop = cutTop;
      var bottomEdge = (anyOverlay || !isFinite(allBottom))
        ? sh.h : Math.min(sh.h, Math.ceil(allBottom + PEEK));
      sh.cutH = Math.max(10, bottomEdge - cutTop);
    });

    var cellW = Math.max.apply(null, shots.map(function (s) { return s.w; }));
    var cellH = Math.max.apply(null, shots.map(function (s) { return s.cutH; }));
    var hasNum = items.some(function (it) { return it.num != null; });
    var hasAns = items.some(function (it) { return it.answer; });
    var hasTitle = items.some(function (it) { return it.title; });
    /* overlays 是畫在譜例座標系上的標註（例如四部和聲的級數，
       它在 HTML overlay 裡、不在 SVG 中，而且位置在 SVG 下緣之外），
       所以要多留 extraH 的高度。 */
    var extraH = Math.max.apply(null, items.map(function (it) { return it.extraH || 0; }));
    var ROW_GAP = 40;           // 每排之間的間隔
    var blockH = cellH + extraH + (hasNum ? NUM_H : 0) + (hasAns ? ANS_H : 0) + (hasTitle ? TITLE_H : 0)
               + ((rowsCount(items, perRow) > 1) ? ROW_GAP : 0);

    var cols = Math.min(perRow, items.length);
    var rows = Math.ceil(items.length / perRow);
    var W = PAD * 2 + cols * cellW;
    var H = PAD * 2 + rows * blockH + CREDIT_H - ((rows > 1) ? ROW_GAP : 0);

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
        ctx.fillText(it.num + '.', x + 4, y + NUM_H - 4);
      }
      var sy = y + (hasNum ? NUM_H : 0) + (hasTitle ? TITLE_H : 0);
      /* 譜例在格子裡置中（各頁的譜例寬度不一樣），並裁掉上下的空白 */
      var ox = x + (cellW - s.w) / 2;
      /* 標題寫在譜例上方，第一個字對齊譜號（titleX 是譜例座標系裡譜號的左緣） */
      if (it.title) {
        ctx.fillStyle = INK;
        ctx.font = 'bold 15px -apple-system, "PingFang TC", "Noto Sans TC", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(it.title, ox + (it.titleX || 0), sy - 7);
      }
      ctx.drawImage(s.img, 0, s.cutTop, s.w, s.cutH, ox, sy, s.w, s.cutH);

      /* 標註用的是譜例自己的座標系，平移到圖片上對應的位置即可 */
      if (it.overlays && it.overlays.length) {
        it.overlays.forEach(function (o) {
          ctx.fillStyle = o.color || INK;
          ctx.font = (o.bold ? 'bold ' : '') + (o.size || 15) + 'px ' +
                     (o.font || '-apple-system, "PingFang TC", "Noto Sans TC", sans-serif');
          ctx.textAlign = o.align || 'center';
          ctx.fillText(o.text, ox + o.x, sy + o.y - s.cutTop);
        });
      }

      if (hasAns && it.answer) {
        /* 顏色與譜例一致（VexFlow 畫的是純黑），灰字在白底上看不清楚 */
        ctx.fillStyle = INK;
        ctx.textAlign = 'center';
        /* 答案可能很長（例如四部和聲的整串羅馬級數），
           量一下寬度，放不下就逐步縮字級，避免超出圖片邊界。 */
        var size = 15, maxW = cellW - 12;
        do {
          ctx.font = size + 'px -apple-system, "PingFang TC", "Noto Sans TC", sans-serif';
          if (ctx.measureText(it.answer).width <= maxW) break;
          size -= 1;
        } while (size > 9);
        /* 對齊符頭的水平中心——符頭不在 SVG 正中央，
           有臨時記號時還會右移，置中在格子會看起來歪掉。 */
        var ax = (s.box && s.box.headCentre != null) ? (ox + s.box.headCentre) : (x + cellW / 2);
        ctx.fillText(it.answer, ax, sy + cellH + extraH + 16);
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

  /* 交付與音檔同一套：iOS 走分享面板（才能存進相簿），安卓與桌機走下載。
     v.98：安卓改成直接下載（存到 Download，相簿看得到）。安卓的分享面板沒有「存到相簿」，
     只會列出 LINE、Gmail 等 App；iOS 仍走分享面板，選「儲存影像」才進得了相簿。 */
  async function deliver(blob, name) {
    var ua = '';
    try { ua = navigator.userAgent || ''; } catch (e) {}
    var isIOS = /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && (function () { try { return (navigator.maxTouchPoints || 0) > 1; } catch (e) { return false; } })());
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
