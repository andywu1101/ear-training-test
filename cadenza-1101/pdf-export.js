/* ===== 出題工具：A4 頁面 → PDF（v108，手機版一起加）=====
   把預覽用的 A4 頁面（SVG 樂譜＋HTML 文字）重畫到畫布，存成無損圖片 PDF。
   - 600dpi：A4 一頁約 4961×7016＝3,480 萬像素，超過 iPhone 畫布上限（約 1,670 萬），
     所以每頁切成 STRIPS 條橫帶分別畫（一條約 870 萬像素），畫完一條就釋放
   - 像素一小段一小段（ROWS 列）取出、轉 RGB／灰階、送進瀏覽器內建的 deflate（FlateDecode），尖峰記憶體小
   - SVG 先把 width／height 放大成實際要畫的像素大小再轉圖片：Safari 畫 SVG 圖片時用它本身的大小點陣化，
     不放大的話縮放後會糊
   - 文字用 Range 量出每段文字的位置，照同樣的字型、顏色用 fillText 畫（字型由系統提供，不必嵌入） */
(function (global) {
  'use strict';
  var STRIPS = 4, ROWS = 256;
  var PX_PER_IN = 96;

  function svgImage(svg, scale) {
    var c = svg.cloneNode(true);
    var w = parseFloat(svg.getAttribute('width')) || svg.getBoundingClientRect().width;
    var h = parseFloat(svg.getAttribute('height')) || svg.getBoundingClientRect().height;
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    c.setAttribute('width', Math.ceil(w * scale)); c.setAttribute('height', Math.ceil(h * scale));
    c.style.width = ''; c.style.height = '';
    var s = new XMLSerializer().serializeToString(c);
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('樂譜轉圖失敗')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
    });
  }

  /* 收集一頁要畫的東西（座標＝相對於頁面左上角的 CSS px） */
  function collect(page) {
    var base = page.getBoundingClientRect(), ops = [];
    page.querySelectorAll('svg').forEach(function (svg) {
      var r = svg.getBoundingClientRect();
      ops.push({ kind: 'svg', el: svg, x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height });
    });
    var walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (n.parentElement.closest('svg, .pv-ctl, .barhit, .auto-break')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var tn;
    while ((tn = walker.nextNode())) {
      var st = getComputedStyle(tn.parentElement);
      if (st.visibility === 'hidden' || st.display === 'none') continue;
      var rg = document.createRange(); rg.selectNodeContents(tn);
      var rects = rg.getClientRects();
      /* 一個文字節點正常只有一個框（題目文字都不換行）；萬一換行就整段畫在第一個框 */
      var r = rects[0]; if (!r) continue;
      ops.push({ kind: 'text', text: tn.nodeValue.replace(/\s+/g, ' ').trim(), x: r.left - base.left, y: r.top - base.top, h: r.height,
                 font: st.fontStyle + ' ' + st.fontWeight + ' ' + st.fontSize + ' ' + st.fontFamily, color: st.color,
                 lead: /^\s/.test(tn.nodeValue) });
    }
    /* 「＿＿調：」那條實線（border-bottom） */
    page.querySelectorAll('.keyline').forEach(function (el) {
      var r = el.getBoundingClientRect(), st = getComputedStyle(el);
      var bw = parseFloat(st.borderBottomWidth) || 1;
      ops.push({ kind: 'rect', x: r.left - base.left, y: r.bottom - base.top - bw, w: r.width, h: bw, color: st.borderBottomColor });
    });
    return { ops: ops, w: base.width, h: base.height };
  }

  async function deflateRows(cv, gray, ctx) {
    var W = cv.width, H = cv.height;
    var cs = new CompressionStream('deflate');
    var writer = cs.writable.getWriter();
    var out = new Response(cs.readable).arrayBuffer();
    for (var y = 0; y < H; y += ROWS) {
      var hh = Math.min(ROWS, H - y);
      var d = ctx.getImageData(0, y, W, hh).data;
      var buf = new Uint8Array(W * hh * (gray ? 1 : 3));
      if (gray) for (var i = 0, j = 0; i < d.length; i += 4) buf[j++] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      else for (var i2 = 0, j2 = 0; i2 < d.length; i2 += 4) { buf[j2++] = d[i2]; buf[j2++] = d[i2 + 1]; buf[j2++] = d[i2 + 2]; }
      await writer.write(buf);
    }
    await writer.close();
    return new Uint8Array(await out);
  }

  /* pages：已經放進畫面（可量尺寸）的 .page 元素。回傳 PDF Blob */
  async function exportPages(pages, opt) {
    opt = opt || {};
    if (typeof CompressionStream === 'undefined') throw new Error('這個瀏覽器太舊，不支援匯出 PDF（請更新系統或改用電腦）');
    var dpi = opt.dpi || 600, gray = !!opt.gray, sc = dpi / PX_PER_IN;
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    var outPages = [];
    for (var p = 0; p < pages.length; p++) {
      var info = collect(pages[p]);
      var Wpx = Math.round(info.w * sc), Hpx = Math.round(info.h * sc);
      /* 先把這一頁的樂譜都轉成圖片（只在這一頁用，做完就丟） */
      var imgs = [];
      for (var i = 0; i < info.ops.length; i++) {
        var o = info.ops[i];
        if (o.kind === 'svg') o.img = await svgImage(o.el, sc), imgs.push(o);
      }
      var strips = [], y0 = 0;
      for (var s = 0; s < STRIPS; s++) {
        if (opt.onProgress) opt.onProgress(p, pages.length, s, STRIPS);
        var y1 = s === STRIPS - 1 ? Hpx : Math.round(Hpx * (s + 1) / STRIPS), hh = y1 - y0;
        var cv = document.createElement('canvas'); cv.width = Wpx; cv.height = hh;
        var ctx = cv.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('記憶體不足，無法建立畫布');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, Wpx, hh);
        ctx.setTransform(sc, 0, 0, sc, 0, -y0);
        var top = y0 / sc, bot = y1 / sc;
        info.ops.forEach(function (o) {
          var oy = o.y, oh = o.kind === 'text' ? o.h : o.h;
          if (oy > bot || oy + oh < top) return;
          if (o.kind === 'svg') ctx.drawImage(o.img, o.x, o.y, o.w, o.h);
          else if (o.kind === 'rect') { ctx.fillStyle = o.color; ctx.fillRect(o.x, o.y, o.w, o.h); }
          else {
            ctx.font = o.font; ctx.fillStyle = o.color; ctx.textBaseline = 'alphabetic';
            var m = ctx.measureText(o.text);
            var asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
            if (!(asc > 0)) { asc = parseFloat(o.font.match(/(\d+(\.\d+)?)px/)[1]) * 0.88; desc = asc * 0.25; }
            var base = o.y + (o.h - (asc + desc)) / 2 + asc;
            ctx.fillText(o.text, o.x, base);
          }
        });
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        var data = await deflateRows(cv, gray, ctx);
        cv.width = 0; cv.height = 0;   // 立刻釋放畫布
        strips.push({ data: data, pw: Wpx, ph: hh });
        y0 = y1;
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      imgs.forEach(function (o) { o.img.src = ''; o.img = null; });
      outPages.push({ strips: strips, Hpx: Hpx });
    }
    return buildPdf(outPages, gray, opt.title || '');
  }

  function buildPdf(pages, gray, title) {
    var PW = 595.28, PH = 841.89;
    var enc = function (str) { var a = new Uint8Array(str.length); for (var i = 0; i < str.length; i++) a[i] = str.charCodeAt(i) & 255; return a; };
    var chunks = [], size = 0, offsets = [];
    var push = function (u8) { chunks.push(u8); size += u8.length; };
    var obj = function (n, body) { offsets[n] = size; push(enc(n + ' 0 obj\n')); body.forEach(push); push(enc('\nendobj\n')); };
    push(enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
    /* 物件編號：1 目錄、2 頁面樹、3 資訊；之後每頁＝頁面、內容、STRIPS 張圖 */
    var next = 4, plan = pages.map(function (pg) {
      var o = { page: next++, content: next++, imgs: [] };
      pg.strips.forEach(function () { o.imgs.push(next++); });
      return o;
    });
    obj(1, [enc('<< /Type /Catalog /Pages 2 0 R >>')]);
    obj(2, [enc('<< /Type /Pages /Kids [' + plan.map(function (o) { return o.page + ' 0 R'; }).join(' ') + '] /Count ' + pages.length + ' >>')]);
    var hex = ''; for (var i = 0; i < title.length; i++) hex += ('000' + title.charCodeAt(i).toString(16)).slice(-4);
    obj(3, [enc('<< /Title <FEFF' + hex + '> /Producer (Cadenza Exam Maker) >>')]);
    pages.forEach(function (pg, k) {
      var o = plan[k], xo = [], cs = '', yTop = PH;
      pg.strips.forEach(function (st, si) {
        var h = PH * st.ph / pg.Hpx;
        yTop -= h;
        xo.push('/Im' + si + ' ' + o.imgs[si] + ' 0 R');
        cs += 'q ' + PW.toFixed(2) + ' 0 0 ' + h.toFixed(4) + ' 0 ' + yTop.toFixed(4) + ' cm /Im' + si + ' Do Q\n';
      });
      obj(o.page, [enc('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << ' + xo.join(' ') + ' >> >> /Contents ' + o.content + ' 0 R >>')]);
      obj(o.content, [enc('<< /Length ' + cs.length + ' >>\nstream\n' + cs + 'endstream')]);
      pg.strips.forEach(function (st, si) {
        obj(o.imgs[si], [enc('<< /Type /XObject /Subtype /Image /Width ' + st.pw + ' /Height ' + st.ph +
                             ' /ColorSpace /' + (gray ? 'DeviceGray' : 'DeviceRGB') + ' /BitsPerComponent 8 /Filter /FlateDecode /Length ' + st.data.length + ' >>\nstream\n'),
                         st.data, enc('\nendstream')]);
      });
    });
    var total = next, xref = size;
    var x = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (var m = 1; m < total; m++) x += String(offsets[m]).padStart(10, '0') + ' 00000 n \n';
    push(enc(x + 'trailer\n<< /Size ' + total + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + xref + '\n%%EOF\n'));
    return new Blob(chunks, { type: 'application/pdf' });
  }

  global.MakerPdf = { exportPages: exportPages };
})(window);
