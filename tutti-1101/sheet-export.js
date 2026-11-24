/* ===== 譜例導出（v.96）=====
   把解答頁的正解譜例存成 PNG，方便做講義或存進手機相簿。

   作法：各練習頁用 VexFlow 把譜畫成 SVG → 轉成 Image → 畫進 Canvas → 加題號與答案 → 輸出 PNG。

   ⚠ 為什麼不用 VexFlow 的 Canvas 後端直接畫：實測 SVG 這條路更可靠，
     而且 VexFlow 的 SVG 完全是向量路徑（沒有任何 font-family），
     轉檔不會缺字、也不會污染 Canvas。

   ⚠ iOS 不能直接寫入相簿。走系統分享面板之後，使用者再選「儲存影像」才會進相簿。 */
(function (global) {
  'use strict';

  var SCALE = 4;              // v.104：4 倍解析度（畫質優先）
  var BG = '#ffffff';         // 純白背景（不是 App 的米白，印刷比較正常）
  var INK = '#262420';
  var SOFT = '#75705f';
  var PER_ROW = 5;            // 並排時每一列幾題
  var PAD = 16;               // 外框留白
  var NUM_H = 22;             // 題號那一行的高度
  var ANS_H = 24;             // 答案那一行的高度
  var TITLE_H = 24;           // 譜例上方標題那一行的高度（v.98，找錯音的「題目：共 N 個錯音」）
  /* v.104：iPhone／iPad 的 Canvas 面積上限約 16,777,216 像素，超過會變成空白圖，
     所以上限改成 1,600 萬；題目很多時自動降倍數（版面不變，只是像素較少）。 */
  var MAX_PIXELS = 16e6;
  /* v.102：拿掉右下角的來源浮水印（贊助者版才有導出，沒有外流的理由） */
  var PDF_SCALE = 4;          // v.104：PDF 也是 4 倍
  var PDF_MAX_RATIO = 1.414;  // 頁面高度超過「寬 × A4 比例」就換頁（只在兩排之間換）

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
      /* v.104：直接用最終解析度轉檔。
         只給原尺寸的話，有些瀏覽器（iOS Safari）會先以原尺寸點陣化、再被畫布放大而變糊。
         用 viewBox 固定座標系，寬高乘上 k，內容就以 k 倍重新繪製，座標完全不變。 */
      var k = opt.scale || 1;
      if (!(vb.length === 4 && vb[2] > 0 && vb[3] > 0)) clone.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      clone.setAttribute('width', w * k); clone.setAttribute('height', h * k);
      clone.style.width = (w * k) + 'px'; clone.style.height = (h * k) + 'px';

      /* 量出 SVG 裡「實際有內容」的垂直範圍與符頭的水平中心。
         VexFlow 畫大譜表時上方會空 70px 左右、下方 45px，
         不裁掉的話題號與答案會離譜例很遠；而符頭不在 SVG 正中央
         （有臨時記號時還會右移），答案要對齊它才不會看起來歪掉。 */
      /* v.111：音程、和絃的頁面把整個音符群組用 translate 置中，path 裡的座標沒有算到這段位移，
         答案文字因此偏左（實測 41.5）。量水平位置時要把祖先元素的 translate 一起加上。 */
      var txOf = function (el) {
        var t = 0;
        for (var e = el.parentNode; e && e.nodeName && e.nodeName.toLowerCase() !== 'svg'; e = e.parentNode) {
          var m = ((e.getAttribute && e.getAttribute('transform')) || '').match(/translate\(\s*(-?[0-9.]+)/);
          if (m) t += parseFloat(m[1]);
        }
        return t;
      };
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
            var x = parseFloat(m[1]) + txOf(pth);
            if (x < hMin) hMin = x;
            if (x > hMax) hMax = x;
          });
        } catch (e) {}
        /* v.104.1：上面只讀直線端點，曲線（例如高音譜號往下彎的尾巴）量不到，
           單行譜例的譜號會被切掉一角。另外用瀏覽器算的實際外框（含曲線）量一次，
           只在實際內容超出原本的裁切範圍時才放寬（見 buildCanvas）。
           getBBox 要元素有排版，所以放一份副本到畫面外量，量完就移除。 */
        var inkTop = Infinity, inkBot = -Infinity;
        try {
          var probe = svgEl.cloneNode(true);
          probe.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;display:block';
          document.body.appendChild(probe);
          probe.querySelectorAll('path').forEach(function (pth) {
            var bb = pth.getBBox();
            if (!bb.width && !bb.height) return;
            if (bb.y < inkTop) inkTop = bb.y;
            if (bb.y + bb.height > inkBot) inkBot = bb.y + bb.height;
          });
          probe.parentNode.removeChild(probe);
        } catch (e) {}
        return {
          top: isFinite(minY) ? minY : 0,
          bottom: isFinite(maxY) ? maxY : 0,
          inkTop: isFinite(inkTop) ? inkTop : null,
          inkBottom: isFinite(inkBot) ? inkBot : null,
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
            var x = parseFloat(m[1]) + txOf(pth);
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
      img.onload = function () { URL.revokeObjectURL(url); resolve({ img: img, w: w, h: h, k: k, box: box }); };
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
    var wantScale = opts.scale || SCALE;
    for (var i = 0; i < items.length; i++) {
      shots.push(await svgToImage(items[i].svg, { centre: items[i].centre, scale: wantScale }));
    }

    /* 裁掉 SVG 上下的空白，題號與答案才不會離譜例太遠。
       上下各留 PEEK 的餘裕，避免切到加線或臨時記號的邊緣。
       有 overlays 的頁面（四部和聲的級數畫在 SVG 下緣之外）不裁下緣。 */
    var PEEK = 8;
    var anyOverlay = items.some(function (it) { return it.overlays && it.overlays.length; });
    /* ⚠ 所有格子必須用「同一個」裁切範圍。
       逐格依自己的內容裁，各格裁掉的量不同，譜例在格子裡的垂直位置就會參差不齊。
       取全部的最小上緣與最大下緣，換來的是每一排都對齊。 */
    var allTop = Infinity, allBottom = -Infinity, inkTop = Infinity, inkBot = -Infinity;
    shots.forEach(function (sh) {
      var b = sh.box || {};
      if ((b.top != null) && b.top < allTop) allTop = b.top;
      if ((b.bottom != null) && b.bottom > allBottom) allBottom = b.bottom;
      if ((b.inkTop != null) && b.inkTop < inkTop) inkTop = b.inkTop;
      if ((b.inkBottom != null) && b.inkBottom > inkBot) inkBot = b.inkBottom;
    });
    var cutTop = (anyOverlay || !isFinite(allTop)) ? 0 : Math.max(0, Math.floor(allTop - PEEK));
    /* v.104.1：實際內容超出裁切範圍（超過 1 單位，排除反鋸齒等級的誤差）才往外放到包住內容再留 2；
       沒超出的題目裁切完全不變。 */
    if (cutTop > 0 && isFinite(inkTop) && inkTop < cutTop - 1) cutTop = Math.max(0, Math.floor(inkTop - 2));
    shots.forEach(function (sh) {
      sh.cutTop = cutTop;
      var bottomEdge = (anyOverlay || !isFinite(allBottom))
        ? sh.h : Math.min(sh.h, Math.ceil(allBottom + PEEK));
      if (bottomEdge < sh.h && isFinite(inkBot) && inkBot > bottomEdge + 1) bottomEdge = Math.min(sh.h, Math.ceil(inkBot + 2));
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
    var H = PAD * 2 + rows * blockH - ((rows > 1) ? ROW_GAP : 0);

    /* 題目很多時自動降解析度，避免 Canvas 爆掉 */
    var scale = opts.scale || SCALE;
    while (W * scale * H * scale > MAX_PIXELS && scale > 1) scale -= 0.25;

    var canvas = document.createElement('canvas');
    canvas.width = Math.ceil(W * scale);
    canvas.height = Math.ceil(H * scale);
    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    var cellPos = [];

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
      cellPos[i] = { ox: ox, sy: sy, cutTop: s.cutTop, cutH: s.cutH, w: s.w };   // v.112：跟隨影片要知道每一格在畫布上的位置
      /* 標題寫在譜例上方，第一個字對齊譜號（titleX 是譜例座標系裡譜號的左緣） */
      if (it.title) {
        ctx.fillStyle = INK;
        ctx.font = 'bold 15px -apple-system, "PingFang TC", "Noto Sans TC", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(it.title, ox + (it.titleX || 0), sy - 7);
      }
      ctx.drawImage(s.img, 0, s.cutTop * s.k, s.w * s.k, s.cutH * s.k, ox, sy, s.w, s.cutH);

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

    /* v.112：跟隨影片。頁面在 items[i].follow 給「每一拍的時間與 x（譜例座標）」，換算成畫布座標交給 VideoExport */
    if (items.some(function (it) { return it.follow; })) {
      var fl = { clicks: [], lines: [] };
      items.forEach(function (it, i) {
        var f = it.follow, c = cellPos[i];
        if (!f || !c) return;
        if (f.clicks && f.clicks.length) fl.clicks = f.clicks;
        fl.lines.push({ y0: c.sy, y1: c.sy + c.cutH, x0: c.ox, x1: c.ox + c.w,
          pts: f.pts.map(function (p) { return { t: p.t, x: c.ox + p.x }; }) });
      });
      canvas.__follow = fl;
    } else {
      var sc = [];
      items.forEach(function (it, i) {
        var c = cellPos[i], sh = shots[i], f = null;
        try { f = followScore(it.svg); } catch (e) {}
        sc.push({ y0: c.sy, y1: c.sy + c.cutH, x0: c.ox, x1: c.ox + c.w, ox: c.ox,
                  headX: (sh && sh.box && sh.box.headCentre != null) ? c.ox + sh.box.headCentre : null,
                  onsets: f ? f.onsets.map(function (o) { return { tick: o.tick, x: c.ox + o.x, sound: o.sound }; }) : [],
                  measures: f ? f.measures.map(function (m) { return { s: m.s, e: m.e, x0: c.ox + m.x0, x1: c.ox + m.x1, beat: m.beat }; }) : [] });
      });
      canvas.__score = sc;
    }
    /* 每一格的上下改成「那一排」的範圍（含下方的答案文字），換頁時才不會切到字 */
    var bandOf = function (y) { for (var r = 0; r < rows; r++) { var top = PAD + r * blockH; if (y >= top - 1 && y < top + blockH) return { top: top, bottom: top + blockH - ((rows > 1) ? ROW_GAP : 0) }; } return null; };
    if (rows > 1) {
      (canvas.__score || []).forEach(function (c) { var b = bandOf(c.y0); if (b) { c.y0 = b.top; c.y1 = b.bottom; } });
      if (canvas.__follow) canvas.__follow.lines.forEach(function (l) { var b = bandOf(l.y0); if (b) { l.y0 = b.top; l.y1 = b.bottom; } });
    }

    /* 版面資訊給 PDF 換頁用：每一排的上下緣（畫布座標，未乘解析度） */
    canvas.__layout = { W: W, H: H, scale: scale, rows: rows, bands: (function () {
      var out = [];
      for (var r = 0; r < rows; r++) {
        var top = PAD + r * blockH;
        out.push({ top: top, bottom: top + blockH - ((rows > 1) ? ROW_GAP : 0) });
      }
      return out;
    })() };
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

  /* v.102 檔名：主檔名（題型＋時間）在前，「譜例」放最後，與音檔同一個主檔名：
       四部和聲_20261030-2258.mp3、四部和聲_20261030-2258_譜例.png
     prefix 帶底線時（找錯音_題目、找錯音_正確），底線後面的字併進後綴：…_題目譜例、…_正確譜例。
     「全部下載」時用同一個時間（ExportMenu 放在 __expCollect.date），不會差一分鐘。 */
  function fileName(prefix, ext) {
    var col = global.__expCollect;
    var d = (col && col.date) || new Date();
    var p = function (x) { return String(x).padStart(2, '0'); };
    var parts = String(prefix).split('_');
    var base = parts.shift();
    var tag = parts.join('');
    return base + '_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
         + '-' + p(d.getHours()) + p(d.getMinutes()) + '_' + tag + '譜例.' + (ext || 'png');
  }

  /* ---- PDF（v.102）：不用外部套件，自己組一個只有圖片的 PDF ----
     每頁寬度＝譜例圖片寬度；高度一般＝圖片高度。多排（連續聽寫、錯題本多題）時，
     超過「寬 × 1.414」（A4 比例）就在兩排之間換頁，排版和 PNG 完全一樣。
     圖片無損嵌入（v.104，FlateDecode；舊瀏覽器退回 JPEG 品質 1.0），版面 1 單位＝0.75 點。 */
  function pageSlices(canvas) {
    var L = canvas.__layout;
    if (!L || L.H <= L.W * PDF_MAX_RATIO || L.bands.length < 2) return [{ y0: 0, y1: L ? L.H : canvas.height }];
    var maxH = L.W * PDF_MAX_RATIO, slices = [], start = 0, i = 0;
    while (i < L.bands.length) {
      var y0 = (start === 0) ? 0 : L.bands[start].top - PAD;
      var j = start;
      // 能塞就塞：下一排的下緣＋底部留白不超過一頁高度
      while (j + 1 < L.bands.length && (L.bands[j + 1].bottom + PAD - y0) <= maxH) j++;
      var y1 = (j === L.bands.length - 1) ? L.H : L.bands[j].bottom + PAD;
      slices.push({ y0: y0, y1: y1 });
      start = j + 1; i = start;
    }
    return slices;
  }
  function jpegBytes(cv) {
    var d = cv.toDataURL('image/jpeg', 1.0).split(',')[1];
    var bin = atob(d), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  /* v.104：無損。取出 RGB 原始像素，用瀏覽器內建的 deflate 壓縮（PDF 的 FlateDecode）。
     不支援 CompressionStream 的舊瀏覽器（Safari 16.4 以前）改用最高品質 JPEG。 */
  async function flateBytes(cv) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      var d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      var rgb = new Uint8Array(cv.width * cv.height * 3);
      for (var i = 0, j = 0; i < d.length; i += 4) { rgb[j++] = d[i]; rgb[j++] = d[i + 1]; rgb[j++] = d[i + 2]; }
      var st = new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'));
      return new Uint8Array(await new Response(st).arrayBuffer());
    } catch (e) { return null; }
  }
  async function canvasToPdf(canvas) {
    var L = canvas.__layout || { W: canvas.width, H: canvas.height, scale: 1 };
    var sc = L.scale || 1;
    var slices = pageSlices(canvas), pages = [];
    for (var si = 0; si < slices.length; si++) { var sl = slices[si];
      var hPx = Math.round((sl.y1 - sl.y0) * sc);
      var cv = document.createElement('canvas');
      cv.width = canvas.width; cv.height = hPx;
      var c = cv.getContext('2d');
      c.fillStyle = BG; c.fillRect(0, 0, cv.width, cv.height);
      c.drawImage(canvas, 0, Math.round(sl.y0 * sc), canvas.width, hPx, 0, 0, canvas.width, hPx);
      var fl = await flateBytes(cv);
      pages.push({ data: fl || jpegBytes(cv), filter: fl ? 'FlateDecode' : 'DCTDecode',
                   pw: cv.width, ph: cv.height, w: L.W * 0.75, h: (sl.y1 - sl.y0) * 0.75 });
    }
    var enc = function (str) { var a = new Uint8Array(str.length); for (var i = 0; i < str.length; i++) a[i] = str.charCodeAt(i) & 255; return a; };
    var chunks = [], size = 0, offsets = [];
    var push = function (u8) { chunks.push(u8); size += u8.length; };
    var obj = function (n, body) { offsets[n] = size; push(enc(n + ' 0 obj\n')); body.forEach(push); push(enc('\nendobj\n')); };
    push(enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
    var n = pages.length, kids = [];
    for (var k = 0; k < n; k++) kids.push((3 + k * 3) + ' 0 R');
    obj(1, [enc('<< /Type /Catalog /Pages 2 0 R >>')]);
    obj(2, [enc('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>')]);
    pages.forEach(function (pg, k) {
      var po = 3 + k * 3, io = po + 1, co = po + 2;
      var w = pg.w.toFixed(2), h = pg.h.toFixed(2);
      obj(po, [enc('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + w + ' ' + h + '] /Resources << /XObject << /Im0 ' + io + ' 0 R >> >> /Contents ' + co + ' 0 R >>')]);
      obj(io, [enc('<< /Type /XObject /Subtype /Image /Width ' + pg.pw + ' /Height ' + pg.ph +
                   ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /' + pg.filter + ' /Length ' + pg.data.length + ' >>\nstream\n'),
               pg.data, enc('\nendstream')]);
      var cs = 'q ' + w + ' 0 0 ' + h + ' 0 0 cm /Im0 Do Q';
      obj(co, [enc('<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream')]);
    });
    var total = 3 + n * 3, xref = size;
    var x = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (var m = 1; m < total; m++) x += String(offsets[m]).padStart(10, '0') + ' 00000 n \n';
    push(enc(x + 'trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n'));
    return new Blob(chunks, { type: 'application/pdf' });
  }

  /* 交付與音檔同一套：iOS 走分享面板（才能存進相簿），安卓與桌機走下載。
     v.98：安卓改成直接下載（存到 Download，相簿看得到）。安卓的分享面板沒有「存到相簿」，
     只會列出 LINE、Gmail 等 App；iOS 仍走分享面板，選「儲存影像」才進得了相簿。 */
  async function deliver(blob, name) {
    var ua = '';
    try { ua = navigator.userAgent || ''; } catch (e) {}
    var isIOS = /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && (function () { try { return (navigator.maxTouchPoints || 0) > 1; } catch (e) { return false; } })());
    /* 「全部下載」時先收起來，由選單一次交付（v.102） */
    if (global.__expCollect) { global.__expCollect.files.push({ blob: blob, name: name }); return { ok: true, collected: true }; }
    var file = new File([blob], name, { type: blob.type || 'image/png' });
    /* v.106：iOS 的分享面板不一定認得 MusicXML 的檔案類型，認不得就換成一般 XML／純文字（檔名不變） */
    if (isIOS && navigator.canShare && !navigator.canShare({ files: [file] })) {
      ['application/xml', 'text/xml', 'text/plain'].some(function (t) {
        var f2 = new File([blob], name, { type: t });
        if (navigator.canShare({ files: [f2] })) { file = f2; return true; }
        return false;
      });
    }

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
    if (download()) {
      if (global.ExportMenu && global.ExportMenu.notifyDownloaded) global.ExportMenu.notifyDownloaded();
      return { ok: true };
    }
    return { ok: false, reason: 'download' };
  }

  /* ==== MusicXML（v.106）====
     不轉換圖片，而是記錄 VexFlow 實際畫出來的東西（譜表、音符、臨時記號、連結線、符槓、三連音），
     再寫成 MusicXML。所以音高、拼寫、小節、記號都和 PNG／PDF 那張一模一樣。
     做法：在 Stave／StaveNote／StaveTie／Beam 的 draw 外面包一層，依「畫在哪一個 <svg>」分類記下來（WeakMap，不留記憶體）。
     各頁不必改：導出時本來就會在畫面外另外畫一份乾淨的譜，拿那一份的 svg 去查就好。
     ⚠ 音高：有些頁面的 key 只寫字母（c/4），升降靠臨時記號＋小節內規則＋調號，這裡照讀譜規則還原；
       key 本身帶升降的（c#/4）直接用。跨小節的連結線，後一個音沿用前一個音的升降。 */
  var MX_REG = new WeakMap();
  var mxHooked = false;
  function mxRec(ctx) {
    var svg = ctx && ctx.svg; if (!svg) return null;
    var r = MX_REG.get(svg);
    if (!r) { r = { staves: [], notes: [], ties: [], beams: [] }; MX_REG.set(svg, r); }
    return r;
  }
  function mxInstall() {
    if (mxHooked) return true;
    var VF = global.Vex && global.Vex.Flow;
    if (!VF || !VF.Stave || !VF.StaveNote) return false;
    mxHooked = true;
    function wrap(proto, name, fn) {
      if (!proto || typeof proto[name] !== 'function') return;
      var orig = proto[name];
      proto[name] = function () { var out = orig.apply(this, arguments); try { fn.call(this, arguments); } catch (e) {} return out; };
    }
    wrap(VF.Stave.prototype, 'addTimeSignature', function (a) { this.__mxTime = a[0]; });
    wrap(VF.Stave.prototype, 'draw', function () { var r = mxRec(this.context); if (r && r.staves.indexOf(this) < 0) r.staves.push(this); });
    wrap(VF.StaveNote.prototype, 'draw', function () { var r = mxRec(this.context); if (r && r.notes.indexOf(this) < 0) r.notes.push(this); });
    wrap(VF.StaveTie && VF.StaveTie.prototype, 'draw', function () { var r = mxRec(this.context); if (r) r.ties.push(this); });
    wrap(VF.Beam && VF.Beam.prototype, 'draw', function () { var r = mxRec(this.context); if (r) r.beams.push(this); });
    wrap(VF.SVGContext && VF.SVGContext.prototype, 'clear', function () { if (this.svg) MX_REG.delete(this.svg); });
    return true;
  }
  /* vexflow 載入後才能掛；本機檔載入失敗會改用 CDN，所以多試幾次 */
  (function tryInstall(n) { if (!mxInstall() && n < 60) setTimeout(function () { tryInstall(n + 1); }, 250); })(0);

  var MX_DIV = 24;   // 每個四分音符 24 單位：十六分＝6、附點十六分＝9、三連音八分＝8、三連音十六分＝4
  var MX_BASE = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25, '32': 0.125 };
  var MX_TYPE = { w: 'whole', h: 'half', q: 'quarter', '8': 'eighth', '16': '16th', '32': '32nd' };
  var MX_FLAGS = { '8': 1, '16': 2, '32': 3 };
  var MX_ACC = { '#': 1, 'b': -1, 'n': 0, '##': 2, 'bb': -2 };
  var MX_ACC_NAME = { '#': 'sharp', 'b': 'flat', 'n': 'natural', '##': 'double-sharp', 'bb': 'flat-flat' };
  var MX_MAJ = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
  var MX_MIN = { A: 0, E: 1, B: 2, 'F#': 3, 'C#': 4, 'G#': 5, 'D#': 6, 'A#': 7, D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6, Ab: -7 };

  function mxEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function mxKey(spec) {
    if (!spec) return null;
    var m = String(spec).match(/^([A-G][#b]?)(m?)$/);
    if (!m) return null;
    var f = m[2] ? MX_MIN[m[1]] : MX_MAJ[m[1]];
    return (f == null) ? null : { fifths: f, minor: !!m[2] };
  }
  function mxKeyAlter(key, letter) {
    if (!key || !key.fifths) return 0;
    var order = key.fifths > 0 ? 'FCGDAEB' : 'BEADGCF';
    return order.indexOf(letter) < Math.abs(key.fifths) ? (key.fifths > 0 ? 1 : -1) : 0;
  }
  function mxNoteX(n) { try { return n.getAbsoluteX(); } catch (e) { return 0; } }
  function mxDur(n) {
    var d = String(n.getDuration ? n.getDuration() : n.duration || 'q').replace(/r$/, '');
    var q = MX_BASE[d] || 1;
    var dots = n.dots || 0;
    q = q * (2 - 1 / Math.pow(2, dots));
    var t = n.tuplet;
    if (t && t.num_notes) q = q * (t.notes_occupied || 2) / t.num_notes;
    return { div: Math.round(q * MX_DIV), type: MX_TYPE[d] || 'quarter', dots: dots, flags: MX_FLAGS[d] || 0, tuplet: t };
  }
  function mxShownAcc(n, i) {
    var mods = (n.getModifiers ? n.getModifiers() : n.modifiers) || [];
    for (var k = 0; k < mods.length; k++) {
      var m = mods[k];
      if (m && m.getCategory && m.getCategory() === 'accidentals' && m.index === i) return m.type;
    }
    return null;
  }

  /* 一張 svg → 若干小節（每個小節：各譜表、各聲部的音符） */
  function mxItemModel(svg) {
    var r = svg && MX_REG.get(svg);
    if (!r || !r.staves.length) return null;
    var staves = r.staves.filter(function (s) { return true; });
    var ys = [], xs = [];
    staves.forEach(function (s) {
      var y = Math.round(s.y), x = Math.round(s.x);
      if (ys.indexOf(y) < 0) ys.push(y);
      if (xs.indexOf(x) < 0) xs.push(x);
    });
    ys.sort(function (a, b) { return a - b; }); xs.sort(function (a, b) { return a - b; });
    var grand = ys.length === 2 && xs.every(function (x) {
      return ys.every(function (y) { return staves.some(function (s) { return Math.round(s.x) === x && Math.round(s.y) === y; }); });
    });
    var cols = [];   // 每一欄＝一個小節：{ staves: [stave(1), stave(2)] }
    if (grand) {
      xs.forEach(function (x) {
        cols.push({ staves: ys.map(function (y) { return staves.filter(function (s) { return Math.round(s.x) === x && Math.round(s.y) === y; })[0]; }) });
      });
    } else {
      staves.slice().sort(function (a, b) { return (Math.round(a.y) - Math.round(b.y)) || (a.x - b.x); })
            .forEach(function (s) { cols.push({ staves: [s] }); });
    }
    var nStaff = grand ? 2 : 1;
    /* 音符分到欄與譜表 */
    var where = new Map();
    cols.forEach(function (c, ci) { c.staves.forEach(function (s, si) { where.set(s, { ci: ci, si: si }); }); c.notes = [[], []]; });
    r.notes.forEach(function (n) {
      var st = n.getStave ? n.getStave() : n.stave; var w = st && where.get(st);
      if (w) cols[w.ci].notes[w.si].push(n);
    });
    /* 連結線 */
    var tieInfo = new Map();
    function tmark(n, i, kind) { if (!n) return; var t = tieInfo.get(n) || { start: {}, stop: {} }; t[kind][i] = true; tieInfo.set(n, t); }
    r.ties.forEach(function (t) {
      var o = t.notes || t;
      var f = o.first_note, l = o.last_note, fi = o.first_indices || [0], li = o.last_indices || [0];
      fi.forEach(function (i) { tmark(f, i, 'start'); });
      li.forEach(function (i) { tmark(l, i, 'stop'); });
    });
    /* 符槓 */
    var beamInfo = new Map();
    r.beams.forEach(function (b) {
      var ns = b.notes || [];
      ns.forEach(function (n, k) {
        var out = [], fl = mxDur(n).flags;
        for (var L = 1; L <= fl; L++) {
          var p = k > 0 && mxDur(ns[k - 1]).flags >= L, q = k < ns.length - 1 && mxDur(ns[k + 1]).flags >= L;
          out.push(p && q ? 'continue' : (q ? 'begin' : (p ? 'end' : (k < ns.length - 1 ? 'forward hook' : 'backward hook'))));
        }
        beamInfo.set(n, out);
      });
    });
    /* 音高：照讀譜規則還原（每欄、每譜表一份小節內臨時記號狀態） */
    var curKey = [null, null], curClef = ['treble', 'bass'], alterOf = new Map();
    if (!grand) curClef = ['treble'];
    cols.forEach(function (c) {
      c.key = []; c.time = null; c.clef = [];
      c.staves.forEach(function (s, si) {
        (s.getModifiers ? s.getModifiers() : []).forEach(function (m) {
          var cat = m.getCategory && m.getCategory();
          if (cat === 'keysignatures') { var k = mxKey(m.keySpec); if (k) curKey[si] = k; }
          /* ⚠ 沒畫譜號的譜表，stave.clef 仍是預設的 treble，只能看譜表上真的有沒有譜號 */
          if (cat === 'clefs' && (m.type === 'treble' || m.type === 'bass')) curClef[si] = m.type;
        });
        c.key[si] = curKey[si]; c.clef[si] = curClef[si];
        if (s.__mxTime && !c.time) c.time = s.__mxTime;
      });
      for (var si = 0; si < nStaff; si++) {
        var state = {};
        c.notes[si].slice().sort(function (a, b) { return mxNoteX(a) - mxNoteX(b); }).forEach(function (n) {
          var alts = [];
          (n.keys || []).forEach(function (k, i) {
            var m = String(k).toLowerCase().match(/^([a-g])(bb|##|b|#|n)?\/(-?\d+)/);
            if (!m) { alts.push(0); return; }
            var L = m[1].toUpperCase(), oct = parseInt(m[3], 10), id = L + oct;
            var shown = mxShownAcc(n, i), a;
            if (shown != null && MX_ACC[shown] != null) a = MX_ACC[shown];
            else if (m[2]) a = MX_ACC[m[2]];
            else if (state[id] != null) a = state[id];
            else {
              var carried = null;
              r.ties.forEach(function (t) { var o = t.notes || t; if (o.last_note === n && o.first_note && alterOf.has(o.first_note)) carried = alterOf.get(o.first_note)[(o.first_indices || [0])[0]]; });
              a = (carried != null) ? carried : mxKeyAlter(c.key[si], L);
            }
            if (shown != null) state[id] = a;
            alts.push(a);
          });
          alterOf.set(n, alts);
        });
      }
    });
    return { cols: cols, nStaff: nStaff,
             tieInfo: tieInfo, beamInfo: beamInfo, alterOf: alterOf };
  }

  /* ===== v.112：跟隨影片用的譜面資訊 =====
     從記下來的 VexFlow 音符算出：每個起音的 tick（四分音符＝MX_DIV）與 x、每個小節的範圍與拍長。
     時間不在這裡算——由影片端拿「實際的發聲事件」逐一對應（各頁不必另外提供速度）。 */
  function fTx(el) {
    var t = 0;
    for (var e = el && el.parentNode; e && e.nodeName && e.nodeName.toLowerCase() !== 'svg'; e = e.parentNode) {
      var m = ((e.getAttribute && e.getAttribute('transform')) || '').match(/translate\(\s*(-?[0-9.]+)/);
      if (m) t += parseFloat(m[1]);
    }
    return t;
  }
  function fNoteX(svg, n) {
    try {
      var id = n.attrs && n.attrs.id, g = id && svg.querySelector('[id="vf-' + id + '"]');
      if (g) {
        var xs = [];
        g.querySelectorAll('.vf-notehead path').forEach(function (p) {
          var m = (p.getAttribute('d') || '').match(/M\s*(-?[0-9.]+)/); if (m) xs.push(parseFloat(m[1]) + fTx(p));
        });
        if (xs.length) return Math.min.apply(null, xs) + 6;
      }
    } catch (e) {}
    return mxNoteX(n) + 6;
  }
  function followScore(svg) {
    var md = mxItemModel(svg);
    if (!md || !md.cols.length) return null;
    var onsets = [], measures = [], tick0 = 0;
    md.cols.forEach(function (c) {
      var len = 0, beat = MX_DIV;
      var tm = String(c.time === 'C' ? '4/4' : (c.time || '')).match(/^(\d+)\/(\d+)$/);   // C 拍號＝4/4
      if (tm) { var num = +tm[1], den = +tm[2]; len = num * MX_DIV * 4 / den;
        beat = (den === 8 && num % 3 === 0) ? MX_DIV * 1.5 : MX_DIV * 4 / den; }
      var byTick = {};
      for (var si = 0; si < md.nStaff; si++) {
        var groups = {}, order = [];
        var gi = new Map();
        c.notes[si].forEach(function (n) {
          var v = n.voice || n.getVoice && (function () { try { return n.getVoice(); } catch (e) { return null; } })() || 'v';   // 同 MusicXML 的分聲部方式
          if (!gi.has(v)) { gi.set(v, order.length); order.push(order.length); groups[gi.get(v)] = []; }
          groups[gi.get(v)].push(n);
        });
        order.forEach(function (v) {
          var g = groups[v].slice().sort(function (a, b) { return mxNoteX(a) - mxNoteX(b); }), t = 0;
          g.forEach(function (n) {
            var rest = n.isRest ? n.isRest() : /r$/.test(String(n.getDuration ? n.getDuration() : ''));
            var ti = md.tieInfo.get(n), tied = ti && Object.keys(ti.stop).length >= (n.keys || [1]).length;
            var x = fNoteX(svg, n), o = byTick[t];
            if (!o) o = byTick[t] = { tick: tick0 + t, x: x, sound: false };
            else o.x = Math.min(o.x, x);
            if (!rest && !tied) o.sound = true;
            t += mxDur(n).div;
          });
          if (t > len) len = t;
        });
      }
      var st = c.staves[0], x0 = st.getNoteStartX ? st.getNoteStartX() : st.x, x1 = st.x + (st.width || 0);
      measures.push({ s: tick0, e: tick0 + len, x0: x0, x1: x1 - 6, beat: beat });
      Object.keys(byTick).forEach(function (k) { onsets.push(byTick[k]); });
      tick0 += len;
    });
    onsets.sort(function (a, b) { return a.tick - b.tick; });
    return { onsets: onsets, measures: measures };
  }

  function buildMusicXML(items, ui) {
    var models = items.map(function (it) { return mxItemModel(it.svg); });
    if (!models.length || models.some(function (m) { return !m || !m.cols.length; })) throw new Error('沒有樂譜資料');
    var nStaff = Math.max.apply(null, models.map(function (m) { return m.nStaff; }));
    var perRow = ui.perRow || PER_ROW;
    var X = [], mno = 0, lastKey = null, lastTime = null, lastClefs = null;
    function words(text, place, staff, bold) {
      return '<direction placement="' + place + '"><direction-type><words' + (bold ? ' font-weight="bold"' : '') + '>' + mxEsc(text) +
             '</words></direction-type><staff>' + staff + '</staff></direction>';
    }
    models.forEach(function (md, ii) {
      var it = items[ii];
      /* 文字：題號、標題、答案、四部和聲的級數與調名 */
      var lyricAt = {}, wordsAt = {};
      function addWords(ci, s) { (wordsAt[ci] = wordsAt[ci] || []).push(s); }
      (it.overlays || []).forEach(function (o) {
        if (!o || !o.text || o.noXml) return;   // v.109：四部和聲數字低音的分段文字不寫進 MusicXML（由 xmlText 寫一行）
        o = o.xmlText ? Object.assign({}, o, { text: o.xmlText }) : o;
        var ci = 0, best = Infinity;
        md.cols.forEach(function (c, k) {
          var s = c.staves[0], x0 = s.x, x1 = s.x + (s.width || 0);
          var d = (o.x >= x0 && o.x <= x1) ? 0 : Math.min(Math.abs(o.x - x0), Math.abs(o.x - x1));
          if (d < best) { best = d; ci = k; }
        });
        var lowY = Math.max.apply(null, md.cols[ci].staves.map(function (s) { return s.y; }));
        var below = o.y > lowY + 40;
        if (below && !/：$/.test(o.text)) (lyricAt[ci] = lyricAt[ci] || []).push(o.text);
        else addWords(ci, words(o.text, below ? 'below' : 'above', below ? md.nStaff : 1, !!o.bold));
      });
      if (it.title) addWords(0, words(it.title, 'above', 1, true));
      if (it.num != null) addWords(0, words(it.num + '.', 'above', 1, true));
      if (it.answer) addWords(0, words(it.answer, 'below', md.nStaff, false));

      md.cols.forEach(function (c, ci) {
        mno++;
        var body = [];
        var newSys = (ii > 0 && ci === 0 && items.length > 1 && ii % perRow === 0);
        if (newSys) body.push('<print new-system="yes"/>');
        /* 小節長度：有拍號照拍號，沒有就取最長的聲部 */
        var voices = [];   // { si, notes }
        for (var si = 0; si < md.nStaff; si++) {
          var groups = [], keyOf = new Map();
          c.notes[si].forEach(function (n) {
            var v = n.voice || n.getVoice && (function () { try { return n.getVoice(); } catch (e) { return null; } })() || 'v';
            if (!keyOf.has(v)) { keyOf.set(v, groups.length); groups.push([]); }
            groups[keyOf.get(v)].push(n);
          });
          groups.forEach(function (g) { g.sort(function (a, b) { return mxNoteX(a) - mxNoteX(b); }); });
          groups.sort(function (a, b) {
            var sa = a[0].getStemDirection ? a[0].getStemDirection() : 1, sb = b[0].getStemDirection ? b[0].getStemDirection() : 1;
            return sb - sa;
          });
          groups.forEach(function (g, gi) { voices.push({ si: si, vn: si * 4 + gi + 1, notes: g }); });
          if (!groups.length) voices.push({ si: si, vn: si * 4 + 1, notes: [] });
        }
        var tm = c.time || lastTime, mlen;
        if (tm === 'C') tm = '4/4';   // C 拍號＝4/4
        if (tm && /^\d+\/\d+$/.test(tm)) { var p = tm.split('/'); mlen = Math.round(parseInt(p[0], 10) * 4 / parseInt(p[1], 10) * MX_DIV); }
        else mlen = Math.max.apply(null, voices.map(function (v) { return v.notes.reduce(function (s, n) { return s + mxDur(n).div; }, 0); }).concat([MX_DIV * 4]));
        /* 屬性：第一小節或有改變時才寫 */
        var keyNow = c.key[0] || null;
        var clefs = c.clef;
        var attr = [];
        if (mno === 1) attr.push('<divisions>' + MX_DIV + '</divisions>');
        var kStr = keyNow ? JSON.stringify(keyNow) : 'none';
        if (mno === 1 || kStr !== lastKey) attr.push('<key><fifths>' + (keyNow ? keyNow.fifths : 0) + '</fifths>' + (keyNow && keyNow.minor ? '<mode>minor</mode>' : '') + '</key>');
        var tShow = c.time || null, tStr = tShow || ('hidden:' + mlen);
        if (mno === 1 || (tShow && tShow !== lastTime)) {
          if (tShow === 'C') attr.push('<time symbol="common"><beats>4</beats><beat-type>4</beat-type></time>');
          else if (tShow && /^\d+\/\d+$/.test(tShow)) { var tp = tShow.split('/'); attr.push('<time><beats>' + tp[0] + '</beats><beat-type>' + tp[1] + '</beat-type></time>'); }
          else attr.push('<time print-object="no"><beats>' + (mlen / MX_DIV) + '</beats><beat-type>4</beat-type></time>');
        }
        if (mno === 1) attr.push('<staves>' + nStaff + '</staves>');
        var cStr = clefs.join(',');
        if (mno === 1 || cStr !== lastClefs) clefs.forEach(function (cl, k) {
          attr.push('<clef number="' + (k + 1) + '">' + (cl === 'bass' ? '<sign>F</sign><line>4</line>' : '<sign>G</sign><line>2</line>') + '</clef>');
        });
        if (attr.length) body.push('<attributes>' + attr.join('') + '</attributes>');
        lastKey = kStr; if (tShow) lastTime = tShow; lastClefs = cStr;
        (wordsAt[ci] || []).forEach(function (w) { body.push(w); });

        var lyrics = (lyricAt[ci] || []).slice(), lyricDone = false;
        var lowestVoice = voices.filter(function (v) { return v.si === md.nStaff - 1 && v.notes.length; });
        lowestVoice = lowestVoice.length ? lowestVoice[lowestVoice.length - 1] : null;
        var pos = 0;
        voices.forEach(function (v, vi) {
          if (vi > 0 && pos > 0) { body.push('<backup><duration>' + pos + '</duration></backup>'); pos = 0; }
          if (!v.notes.length) {
            body.push('<note print-object="no"><rest measure="yes"/><duration>' + mlen + '</duration><voice>' + v.vn + '</voice><staff>' + (v.si + 1) + '</staff></note>');
            pos += mlen; return;
          }
          v.notes.forEach(function (n) {
            var d = mxDur(n), rest = n.isRest && n.isRest();
            var ti = md.tieInfo.get(n), bi = md.beamInfo.get(n), alts = md.alterOf.get(n) || [];
            var keys = rest ? [null] : (n.keys || []);
            var tuplet = d.tuplet, tFirst = tuplet && tuplet.notes && tuplet.notes[0] === n, tLast = tuplet && tuplet.notes && tuplet.notes[tuplet.notes.length - 1] === n;
            keys.forEach(function (k, i) {
              var x = ['<note>'];
              if (i > 0) x.push('<chord/>');
              if (rest) x.push('<rest/>');
              else {
                var m = String(k).toLowerCase().match(/^([a-g])(bb|##|b|#|n)?\/(-?\d+)/) || [0, 'c', '', '4'];
                x.push('<pitch><step>' + m[1].toUpperCase() + '</step>' + (alts[i] ? '<alter>' + alts[i] + '</alter>' : '') + '<octave>' + m[3] + '</octave></pitch>');
              }
              x.push('<duration>' + d.div + '</duration>');
              var tStart = ti && ti.start[i], tStop = ti && ti.stop[i];
              if (tStop) x.push('<tie type="stop"/>');
              if (tStart) x.push('<tie type="start"/>');
              x.push('<voice>' + v.vn + '</voice><type>' + d.type + '</type>');
              for (var q = 0; q < d.dots; q++) x.push('<dot/>');
              var shown = !rest && mxShownAcc(n, i);
              if (shown && MX_ACC_NAME[shown]) x.push('<accidental>' + MX_ACC_NAME[shown] + '</accidental>');
              if (tuplet && tuplet.num_notes) x.push('<time-modification><actual-notes>' + tuplet.num_notes + '</actual-notes><normal-notes>' + (tuplet.notes_occupied || 2) + '</normal-notes></time-modification>');
              if (d.type !== 'whole' && !rest && n.getStemDirection) { try { x.push('<stem>' + (n.getStemDirection() > 0 ? 'up' : 'down') + '</stem>'); } catch (e) {} }
              x.push('<staff>' + (v.si + 1) + '</staff>');
              if (i === 0 && bi) bi.forEach(function (b, L) { x.push('<beam number="' + (L + 1) + '">' + b + '</beam>'); });
              var nt = [];
              if (tStop) nt.push('<tied type="stop"/>');
              if (tStart) nt.push('<tied type="start"/>');
              if (i === 0 && tFirst) nt.push('<tuplet type="start" bracket="yes" placement="above"/>');   // 和 PNG 一樣有括弧
              if (i === 0 && !rest) {   // v.111：延長記號（聖詠和聲：女高音上方 a@a、男低音下方 a@u）
                var fmods = (n.getModifiers ? n.getModifiers() : n.modifiers) || [];
                fmods.forEach(function (md2) { if (md2 && (md2.type === 'a@a' || md2.type === 'a@u')) nt.push('<fermata type="' + (md2.type === 'a@u' ? 'inverted' : 'upright') + '"/>'); });
              }
              if (i === 0 && tLast) nt.push('<tuplet type="stop"/>');
              if (nt.length) x.push('<notations>' + nt.join('') + '</notations>');
              if (i === 0 && !lyricDone && v === lowestVoice && lyrics.length) {
                lyrics.forEach(function (t, li) { x.push('<lyric number="' + (li + 1) + '"><syllabic>single</syllabic><text>' + mxEsc(t) + '</text></lyric>'); });
                lyricDone = true;
              }
              x.push('</note>');
              body.push(x.join(''));
            });
            pos += d.div;
          });
        });
        if (ci === md.cols.length - 1) body.push('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
        X.push('<measure number="' + mno + '">' + body.join('') + '</measure>');
      });
    });
    var dt = new Date(), p2 = function (x) { return String(x).padStart(2, '0'); };
    return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
      '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n' +
      '<score-partwise version="4.0">' +
      '<identification><encoding><software>音樂聽力練習</software><encoding-date>' + dt.getFullYear() + '-' + p2(dt.getMonth() + 1) + '-' + p2(dt.getDate()) + '</encoding-date></encoding></identification>' +
      '<part-list><score-part id="P1"><part-name print-object="no">Piano</part-name></score-part></part-list>' +
      '<part id="P1">' + X.join('') + '</part></score-partwise>\n';
  }

  /* v.102：依選單的「譜例格式」輸出 PNG 或 PDF；「全部下載」時兩種都產生。
     v.106：多一種 MusicXML；「全部下載」時三種都產生（MusicXML 失敗不影響另外兩種）。 */
  async function exportSheets(items, prefix, ui) {
    ui = ui || {};
    var col = global.__expCollect;
    try {
      if (!items || !items.length) throw new Error('沒有可以導出的譜例');
      var fmt = col ? 'both' : ((global.ExportMenu && global.ExportMenu.sheetFormat) ? global.ExportMenu.sheetFormat() : 'png');
      if (ui.onStage) ui.onStage('render');
      var r = null;
      /* v.111：只做影片時，畫好 PNG 用的圖就交給選單，不產生任何檔案 */
      if (col && col.videoOnly) {
        col.raw.canvases.push(await buildCanvas(items, ui));
        r = { ok: true, collected: true };
        if (ui.onStage) ui.onStage('done', r);
        return r;
      }
      if (fmt === 'png' || fmt === 'both') {
        var canvas = await buildCanvas(items, ui);
        if (col && col.raw) col.raw.canvases.push(canvas);   // 「全部下載」最後要做影片
        if (ui.onStage) ui.onStage('encode');
        var blob = await canvasToBlob(canvas);
        if (ui.onStage) ui.onStage('deliver');
        r = await deliver(blob, fileName(prefix, 'png'));
      }
      if (fmt === 'pdf' || fmt === 'both') {
        var pc = await buildCanvas(items, Object.assign({}, ui, { scale: PDF_SCALE }));
        if (ui.onStage) ui.onStage('encode');
        var pdf = await canvasToPdf(pc);
        if (ui.onStage) ui.onStage('deliver');
        r = await deliver(pdf, fileName(prefix, 'pdf'));
      }
      if (fmt === 'musicxml' || fmt === 'both') {
        try {
          var xml = buildMusicXML(items, ui);
          if (ui.onStage) ui.onStage('deliver');
          r = await deliver(new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' }), fileName(prefix, 'musicxml'));
        } catch (e) {
          if (!col) throw e;
          col.failed = (col.failed || 0) + 1;
        }
      }
      if (ui.onStage) ui.onStage('done', r);
      return r;
    } catch (e) {
      if (col) col.failed = (col.failed || 0) + (col.expectNow || 1);   // 讓選單不必等到逾時
      throw e;
    }
  }

  /* v.112.3：出考卷的影片——請練習頁照「下載譜例」的畫法畫正解譜，只拿畫布、不產生檔案。
     run(btn)：呼叫該頁原本的導出譜例函式（btn 是假的按鈕，避免動到畫面上的按鈕）。 */
  async function collectCanvas(run) {
    var col = { date: new Date(), files: [], failed: 0, videoOnly: true, expectNow: 1, raw: { audio: null, canvases: [] } };
    var btn = { disabled: false, textContent: '' };
    global.__expCollect = col; global.__expBtn = btn;
    try {
      await run(btn);
      var t0 = Date.now();
      while (!col.raw.canvases.length && Date.now() - t0 < 60000) await new Promise(function (r) { setTimeout(r, 60); });
      return col.raw.canvases[0] || null;
    } finally { global.__expCollect = null; global.__expBtn = null; }
  }
  global.SheetExport = {
    collectCanvas: collectCanvas,
    exportSheets: exportSheets,
    buildCanvas: buildCanvas,
    svgToImage: svgToImage,
    fileName: fileName,
    canvasToPdf: canvasToPdf,
    buildMusicXML: buildMusicXML,
    PER_ROW: PER_ROW
  };
})(window);
