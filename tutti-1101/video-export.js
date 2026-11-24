/* ===== 譜例影片導出（v.111）=====
   一張譜例圖＋一段音檔 → mp4（H.264＋AAC，30 fps，白底、譜例等比置中）。
   用瀏覽器內建的 WebCodecs 編碼，mp4-muxer.js 封裝；第一次用到才載入（贊助者版與出考卷才有）。

   ⚠ 需要 AudioEncoder 能編 AAC：電腦 Chrome／Edge、安卓 Chrome、iPhone／iPad iOS 26 以上。
     iOS 18 以前沒有 AudioEncoder；mp4 裡裝 mp3 iPhone 不能播（實測），所以不提供備案。
   ⚠ Safari 的 AudioEncoder 給的 description 是整段 ES_Descriptor（03 開頭），
     要拆出裡面的 AudioSpecificConfig 才能交給 mp4-muxer，否則 iPhone 播放沒有聲音（實測）。 */
(function (global) {
  'use strict';

  var FPS = 30, KEY_EVERY = 90, MARGIN = 40, V_BITRATE = 6e6, A_BITRATE = 192000;   // 畫質優先：關鍵畫面給足位元率，譜線邊緣才不會糊
  var SIZE = { P: [1080, 1920], L: [1920, 1080] };
  var TB = 0;   // v.112.3：畫面上方的標題列高度（出考卷的影片才有；make() 依 opts.title 設定）
  var muxerReady = null;

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('載入失敗：' + url)); };
      document.head.appendChild(s);
    });
  }
  function ensureMuxer() {
    if (global.Mp4Muxer) return Promise.resolve();
    if (!muxerReady) muxerReady = loadScript((global.VIDEO_EXPORT_BASE || '') + 'mp4-muxer.js');
    return muxerReady;
  }

  var NO_SUPPORT = '這台裝置無法製作影片（iPhone／iPad 需要 iOS 26 以上）';

  async function pickVideo(w, h) {
    if (typeof VideoEncoder === 'undefined') return null;
    var codecs = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.640033'];
    for (var i = 0; i < codecs.length; i++) {
      var cfg = { codec: codecs[i], width: w, height: h, bitrate: V_BITRATE, framerate: FPS, avc: { format: 'avc' } };
      try { var r = await VideoEncoder.isConfigSupported(cfg); if (r && r.supported) return cfg; } catch (e) {}
    }
    return null;
  }
  async function pickAudio(srList, ch) {
    if (typeof AudioEncoder === 'undefined') return null;
    for (var i = 0; i < srList.length; i++) {
      var cfg = { codec: 'mp4a.40.2', sampleRate: srList[i], numberOfChannels: ch, bitrate: A_BITRATE };
      try { var r = await AudioEncoder.isConfigSupported(cfg); if (r && r.supported) return cfg; } catch (e) {}
    }
    return null;
  }
  /* 先檢查這台裝置能不能做（按下去就先問，不支援時不必白算音檔） */
  async function supported() {
    return !!(await pickVideo(1080, 1920)) && !!(await pickAudio([44100, 48000], 2));
  }

  /* Safari：description 是 ES_Descriptor → 拆出 DecoderSpecificInfo（tag 05）；Chrome 本來就是 ASC */
  function toASC(desc) {
    var u = desc instanceof ArrayBuffer ? new Uint8Array(desc) : new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength);
    if (!u.length || u[0] !== 0x03) return u;
    function len(i) { var n = 0, b; do { b = u[i.p++]; n = (n << 7) | (b & 0x7f); } while (b & 0x80); return n; }
    function scan(i, end) {
      while (i.p < end) {
        var tag = u[i.p++], n = len(i), start = i.p, r;
        if (tag === 0x05) return u.slice(start, start + n);
        if (tag === 0x03) {
          var fl = u[i.p + 2]; i.p += 3;
          if (fl & 0x80) i.p += 2;
          if (fl & 0x40) i.p += 1 + u[i.p];
          if (fl & 0x20) i.p += 2;
          if ((r = scan(i, start + n))) return r;
        } else if (tag === 0x04) {
          i.p += 13;
          if ((r = scan(i, start + n))) return r;
        }
        i.p = start + n;
      }
      return null;
    }
    return scan({ p: 0 }, u.length) || u;
  }

  /* 直式或橫式：'P'／'L' 照指定；'auto' 看譜例在哪一種放得比較大 */
  function fitScale(o, iw, ih) {
    var W = SIZE[o][0], H = SIZE[o][1];
    return Math.min((W - 2 * MARGIN) / iw, (H - 2 * MARGIN - TB) / ih);
  }
  function chooseOrient(orient, iw, ih) {
    if (orient === 'P' || orient === 'L') return orient;
    return fitScale('L', iw, ih) > fitScale('P', iw, ih) ? 'L' : 'P';
  }

  /* 取樣率轉換（裝置的 AAC 編碼器不接受原本的取樣率時） */
  async function resample(buf, sr) {
    if (buf.sampleRate === sr) return buf;
    var OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    var ch = Math.min(2, buf.numberOfChannels);
    var oc = new OAC(ch, Math.ceil(buf.duration * sr), sr);
    var src = oc.createBufferSource(); src.buffer = buf; src.connect(oc.destination); src.start(0);
    return await oc.startRendering();
  }

  /* ===== v.112：跟隨影片 =====
     follow = { clicks: [預備拍時間], lines: [{ y0, y1, x0, x1, pts: [{ t, x }] }] }，座標是譜例圖的「單位」
     （圖片像素 = 單位 × us）。游標每拍對準 pts，拍與拍之間滑動；一次最多兩行，換行時往上捲。 */
  var CUR_W = 16, CUR_RGB = '77,163,255', CUR_A = 0.35, CUR_FLASH_A = 0.55, FLASH_SEC = 0.3, SCROLL_SEC = 0.4;
  var PAN_BARS = 4;   // 一行很長（例如四部和聲 10 小節）：放大到一個畫面大約 4 小節，畫面跟著游標橫向移動
  function followView(o, f, Wu, Hu) {
    var aw = SIZE[o][0] - 2 * MARGIN, ah = SIZE[o][1] - 2 * MARGIN - TB, L = f.lines;
    var kAll = Math.min(aw / Wu, ah / Hu);
    if (L.length === 1 && L[0].mw) {
      var kPan = Math.min(aw / (L[0].lead + PAN_BARS * L[0].mw), ah / (Hu + 8));
      if (kPan > kAll * 1.15) return { k: kPan, paged: false, pan: true };
    }
    if (L.length <= 2) return { k: kAll, paged: false };
    var winH = 0;
    for (var i = 0; i + 1 < L.length; i++) winH = Math.max(winH, L[i + 1].y1 - L[i].y0 + 16);
    var kWin = Math.min(aw / Wu, ah / winH);
    return kAll >= kWin - 1e-6 ? { k: kAll, paged: false } : { k: kWin, paged: true };
  }
  function followSetup(image, f, us, orient) {
    var Wu = image.width / us, Hu = image.height / us;
    var vP = followView('P', f, Wu, Hu), vL = followView('L', f, Wu, Hu);
    var o = (orient === 'P' || orient === 'L') ? orient : (vP.k > vL.k + 1e-6 ? 'P' : 'L');
    var v = o === 'P' ? vP : vL, k = v.k, W = SIZE[o][0], H = SIZE[o][1];
    /* 先把整張譜縮放好（每一格畫面只要貼上、加游標） */
    var sc = document.createElement('canvas');
    sc.width = Math.round(Wu * k); sc.height = Math.round(Hu * k);
    var g = sc.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(image, 0, 0, sc.width, sc.height);
    /* 每一行游標的上下：找五線譜的譜線（長的水平線）。
       ⚠ 要在原解析度的圖上找：縮小後譜線不到 1 像素、會變淡，有的行找得到、有的找不到（實測）。 */
    var src = image.getContext ? image : null;
    if (!src) { src = document.createElement('canvas'); src.width = image.width; src.height = image.height; src.getContext('2d').drawImage(image, 0, 0); }
    var sg = src.getContext('2d');
    var lines = f.lines.map(function (ln) {
      // 最後一行常常比較短：只看到最後一個拍點為止（譜線只畫到那裡）
      var xr = ln.pts.reduce(function (m, p) { return Math.max(m, p.x); }, ln.x0 + 40);
      var x0 = Math.max(0, Math.round(ln.x0 * us)), x1 = Math.min(src.width - 1, Math.round(Math.min(ln.x1, xr) * us));
      var ya = Math.max(0, Math.round(ln.y0 * us)), yb = Math.min(src.height - 1, Math.round(ln.y1 * us));
      var top = null, bot = null, px = sg.getImageData(x0, ya, x1 - x0 + 1, yb - ya + 1).data, rw = x1 - x0 + 1;
      for (var y = 0; y <= yb - ya; y++) {
        var dark = 0, n = 0;
        for (var x = 0; x < rw; x += 3) { n++; if (px[(y * rw + x) * 4] < 190) dark++; }
        if (dark > n * 0.5) { if (top == null) top = y; bot = y; }
      }
      return { y0: ln.y0, y1: ln.y1, pts: ln.pts,
               sTop: top != null ? (ya + top) / us - 6 : ln.y0, sBot: bot != null ? (ya + bot) / us + 6 : ln.y1 };
    });
    var pts = [];
    lines.forEach(function (ln, li) { ln.pts.forEach(function (p) { pts.push({ t: p.t, x: p.x, li: li }); }); });
    pts.sort(function (a, b) { return a.t - b.t; });
    var changes = [];
    for (var i = 1; i < pts.length; i++) if (pts[i].li !== pts[i - 1].li) changes.push({ t: pts[i].t, li: pts[i].li });
    var viewH = (H - 2 * MARGIN) / k;
    /* 一個畫面兩行：目前這一行＋下一行（最後一行時是前一行＋最後一行），上下其他行用白色蓋掉 */
    function winOf(li) { var a = li + 1 < lines.length ? li : Math.max(0, li - 1); return [a, Math.min(lines.length - 1, a + 1)]; }
    function topOf(li) { return Math.max(0, lines[winOf(li)[0]].y0 - 8); }
    function maskTopOf(li) { return lines[winOf(li)[0]].y0 - 4; }
    function maskOf(li) { return lines[winOf(li)[1]].y1 + 4; }
    function ease(p) { return p * p * (3 - 2 * p); }
    function cam(t, fn) {   // 鏡頭：換行前後各 0.2 秒平順移過去
      var li0 = pts.length ? pts[0].li : 0, cur = fn(li0);
      for (var i = 0; i < changes.length; i++) {
        var a = changes[i].t - SCROLL_SEC / 2, b = changes[i].t + SCROLL_SEC / 2, nx = fn(changes[i].li);
        if (t >= b) cur = nx; else if (t > a) cur = cur + (nx - cur) * ease((t - a) / (b - a));
      }
      return cur;
    }
    function cursor(t) {
      if (!pts.length) return null;
      if (t <= pts[0].t) return { li: pts[0].li, x: pts[0].x };
      for (var i = 0; i + 1 < pts.length; i++) {
        var a = pts[i], b = pts[i + 1];
        if (t >= a.t && t < b.t) return a.li === b.li ? { li: a.li, x: a.x + (b.x - a.x) * (t - a.t) / (b.t - a.t) } : { li: a.li, x: a.x };
      }
      var z = pts[pts.length - 1]; return { li: z.li, x: z.x };
    }
    var clicks = f.clicks || [], tFirst = pts.length ? pts[0].t : 0;
    function alphaAt(t) {
      if (!clicks.length || t < clicks[0] - 0.05 || t >= tFirst) return CUR_A;
      for (var i = 0; i < clicks.length; i++) if (t >= clicks[i] && t < clicks[i] + FLASH_SEC) return CUR_FLASH_A;
      return 0;
    }
    function draw(ctx, t) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      var ox = Math.round((W - sc.width) / 2), oy;
      if (v.paged) oy = Math.round(MARGIN + TB - cam(t, topOf) * k);
      else oy = Math.round(TB + (H - TB - sc.height) / 2);
      if (v.pan) {   // 游標保持在畫面左邊約 35% 的位置，頭尾不超出譜例
        var cc = cursor(t), viewW = (W - 2 * MARGIN) / k;
        var left = Math.max(0, Math.min((cc ? cc.x : 0) - viewW * 0.35, Wu - viewW));
        ox = Math.round(MARGIN - left * k);
      }
      ctx.drawImage(sc, ox, oy);
      if (v.paged) {
        ctx.fillStyle = '#ffffff';
        var my = oy + cam(t, maskOf) * k; ctx.fillRect(0, Math.max(0, my), W, H);
        var mt = oy + cam(t, maskTopOf) * k; if (mt > TB) ctx.fillRect(0, 0, W, mt);
      }
      var c = cursor(t), a = alphaAt(t);
      if (c && a > 0) {
        var ln = lines[c.li], cx = ox + c.x * k, w = CUR_W * k, y0 = oy + ln.sTop * k, y1 = oy + ln.sBot * k, r = 4 * k;
        ctx.fillStyle = 'rgba(' + CUR_RGB + ',' + a + ')';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cx - w / 2, y0, w, y1 - y0, r); else ctx.rect(cx - w / 2, y0, w, y1 - y0);
        ctx.fill();
      }
    }
    return { o: o, W: W, H: H, draw: draw, lines: lines, k: k, paged: v.paged };
  }

  /* ===== v.112：從「譜面資訊＋實際發聲事件」算出跟隨用的拍點（各練習頁共用，頁面不用改） =====
     score：SheetExport 附在畫布上的 __score（每一格：起音 tick 與 x、小節範圍與拍長；單位與畫布相同）
     events：AudioExport 的發聲事件（含標準音 A、預備拍 click）
     ・一格就是一整段旋律：把「有發聲的起音」依序對上事件的起音時間（數量要一樣，對不上就不做跟隨）
     ・好幾格、每格一個和絃（連續聽寫）：把事件依最大的幾個空檔分成 N 組，游標停在正在播的那一題
     回傳 follow（格式同頁面自己給的），或 null＝做靜態影片 */
  function followFromScore(score, events) {
    if (!score || !score.length || !events || !events.length) return null;
    var notes = events.filter(function (e) { return e && e.type !== 'click' && e.midi != null; })
                      .sort(function (a, b) { return a.time - b.time; });
    var clicks = events.filter(function (e) { return e && e.type === 'click'; }).map(function (e) { return e.time; }).sort(function (a, b) { return a - b; });
    // 開頭的標準音 A（2 秒長、後面隔一段才有聲音）不算題目
    if (notes.length > 1 && notes[0].midi === 69 && notes[0].duration >= 1.5 && notes[1].time - notes[0].time >= 2) notes = notes.slice(1);
    var times = [];
    notes.forEach(function (e) { var t = Math.round(e.time * 1000) / 1000; if (!times.length || t - times[times.length - 1] > 0.03) times.push(t); });   // 30 ms 內算同一下（四部和聲低音提早 10 ms）
    if (!times.length) return null;

    if (score.length === 1) {
      var sc = score[0], snd = sc.onsets.filter(function (o) { return o.sound; });
      if (snd.length < 2 || snd.length !== times.length || !sc.measures.length) return null;
      var tk = snd.map(function (o) { return o.tick; });
      function timeOf(tick) {   // tick → 秒：對應點之間線性，頭尾用最近一段的速度延伸
        var i = 0; while (i + 1 < tk.length - 1 && tick > tk[i + 1]) i++;
        var a = tk[i], b = tk[i + 1], ta = times[i], tb = times[i + 1];
        return ta + (tb - ta) * (tick - a) / (b - a);
      }
      var known = sc.onsets.map(function (o) { return { tick: o.tick, x: o.x }; });
      sc.measures.forEach(function (m) { known.push({ tick: m.e, x: m.x1, end: true }); });
      known.sort(function (a, b) { return (a.tick - b.tick) || ((a.end ? 0 : 1) - (b.end ? 0 : 1)); });
      function xOf(tick) {   // 同一小節內：前後已知點之間依 tick 線性
        var m = sc.measures.filter(function (q) { return tick >= q.s && tick < q.e; })[0] || sc.measures[sc.measures.length - 1];
        var ins = known.filter(function (k) { return k.tick >= m.s && k.tick <= m.e && !(k.end && k.tick === m.s); });
        var lo = null, hi = null;
        ins.forEach(function (k) { if (k.tick <= tick && !k.end) lo = k; if (k.tick >= tick && !hi && (k.tick > tick || !k.end)) hi = k; });
        if (!hi) hi = { tick: m.e, x: m.x1 };
        if (!lo) lo = { tick: m.s, x: m.x0 };
        if (hi.tick === lo.tick) return lo.x;
        return lo.x + (hi.x - lo.x) * (tick - lo.tick) / (hi.tick - lo.tick);
      }
      var ticks = {};
      sc.onsets.forEach(function (o) { ticks[o.tick] = 1; });
      sc.measures.forEach(function (m) { for (var t = m.s; t < m.e - 0.01; t += m.beat) ticks[Math.round(t * 100) / 100] = 1; });
      var pts = Object.keys(ticks).map(Number).sort(function (a, b) { return a - b; })
        .map(function (t) { return { t: timeOf(t), x: xOf(t) }; });
      var last = sc.measures[sc.measures.length - 1];
      pts.push({ t: timeOf(last.e) - 0.001, x: last.x1 });
      var mw = sc.measures.reduce(function (a, m) { return a + (m.x1 - m.x0); }, 0) / sc.measures.length;
      return { clicks: clicks, lines: [{ y0: sc.y0, y1: sc.y1, x0: sc.x0, x1: sc.x1, pts: pts, mw: mw, lead: sc.measures[0].x0 - sc.x0 }] };
    }

    // 好幾格：每格一題
    var N = score.length;
    if (score.some(function (c) { return c.headX == null; }) || times.length < N) return null;
    var gaps = [];
    for (var i = 1; i < times.length; i++) gaps.push({ i: i, d: times[i] - times[i - 1] });
    var cut = gaps.sort(function (a, b) { return b.d - a.d; }).slice(0, N - 1).map(function (g) { return g.i; }).sort(function (a, b) { return a - b; });
    var starts = [times[0]].concat(cut.map(function (i) { return times[i]; }));
    var endAll = notes.reduce(function (m, e) { return Math.max(m, e.time + (e.duration || 0)); }, 0);
    var rows = [];
    score.forEach(function (c, ci) {
      var t0 = starts[ci], t1 = ci + 1 < N ? starts[ci + 1] : endAll;
      var row = rows.filter(function (r) { return Math.abs(r.y0 - c.y0) < 1; })[0];
      if (!row) { row = { y0: c.y0, y1: c.y1, x0: c.x0, x1: c.x1, pts: [] }; rows.push(row); }
      row.x0 = Math.min(row.x0, c.x0); row.x1 = Math.max(row.x1, c.x1);
      row.pts.push({ t: t0, x: c.headX }, { t: t1 - 0.002, x: c.headX });
    });
    return { clicks: clicks, lines: rows };
  }

  /* image：canvas 或 Image；audio：AudioBuffer。回傳 mp4 Blob
     opts.follow／opts.unitScale：有的話做跟隨影片（v.112） */
  async function make(image, audio, opts) {
    opts = opts || {};
    var prog = opts.onProgress || function () {};
    await ensureMuxer();
    var iw = image.width || image.naturalWidth, ih = image.height || image.naturalHeight;
    TB = opts.title ? TITLE_H : 0;
    try {
    var fs = (opts.follow && opts.follow.lines && opts.follow.lines.length) ? followSetup(image, opts.follow, opts.unitScale || 1, opts.orient) : null;
    var o = fs ? fs.o : chooseOrient(opts.orient, iw, ih), W = SIZE[o][0], H = SIZE[o][1];
    var vcfg = await pickVideo(W, H);
    var CH = Math.min(2, audio.numberOfChannels);
    var acfg = await pickAudio([audio.sampleRate, 48000, 44100], CH);
    if (!vcfg || !acfg) throw new Error(NO_SUPPORT);
    var buf = await resample(audio, acfg.sampleRate);

    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    if (!fs) {
      var k = fitScale(o, iw, ih), dw = iw * k, dh = ih * k;
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(image, Math.round((W - dw) / 2), Math.round(TB + (H - TB - dh) / 2), Math.round(dw), Math.round(dh));
      drawTitle(g, W, opts.title);
    }

    var muxer = new global.Mp4Muxer.Muxer({
      target: new global.Mp4Muxer.ArrayBufferTarget(),
      video: { codec: 'avc', width: W, height: H, frameRate: FPS },
      audio: { codec: 'aac', sampleRate: acfg.sampleRate, numberOfChannels: CH },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset'
    });

    var err = null;
    var ve = new VideoEncoder({ output: function (c, m) { muxer.addVideoChunk(c, m); }, error: function (e) { err = e; } });
    ve.configure(vcfg);
    var nF = Math.max(1, Math.ceil(buf.duration * FPS));
    for (var i = 0; i < nF; i++) {
      if (fs) { fs.draw(g, i / FPS); drawTitle(g, W, opts.title); }
      var vf = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      ve.encode(vf, { keyFrame: i % KEY_EVERY === 0 }); vf.close();
      if (err) throw err;
      while (ve.encodeQueueSize > 8) await new Promise(function (r) { setTimeout(r, 1); });
      if (i % 30 === 0) prog(i / nF * 0.9);
    }
    await ve.flush(); ve.close();
    if (err) throw err;

    var ae = new AudioEncoder({
      output: function (c, m) {
        if (m && m.decoderConfig && m.decoderConfig.description)
          m = { decoderConfig: Object.assign({}, m.decoderConfig, { description: toASC(m.decoderConfig.description) }) };
        muxer.addAudioChunk(c, m);
      },
      error: function (e) { err = e; }
    });
    ae.configure(acfg);
    var N = buf.length, STEP = 4096;
    for (var s = 0; s < N; s += STEP) {
      var n = Math.min(STEP, N - s), data = new Float32Array(n * CH);
      for (var c = 0; c < CH; c++) data.set(buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)).subarray(s, s + n), c * n);
      var ad = new AudioData({ format: 'f32-planar', sampleRate: buf.sampleRate, numberOfFrames: n, numberOfChannels: CH,
                               timestamp: Math.round(s * 1e6 / buf.sampleRate), data: data });
      ae.encode(ad); ad.close();
      if (err) throw err;
    }
    await ae.flush(); ae.close();
    if (err) throw err;
    muxer.finalize();
    prog(1);
    var blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    blob.__orient = o;
    return blob;
    } finally { TB = 0; }
  }
  /* 標題列（出考卷：「題號. 題目名稱」，與考卷上的小題標題相同） */
  var TITLE_H = 110, TITLE_PX = 46;
  function drawTitle(g, W, text) {
    if (!text) return;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, TB);
    g.fillStyle = '#000000'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.font = TITLE_PX + 'px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
    g.fillText(text, MARGIN + 20, Math.round(MARGIN + (TB - MARGIN) / 2));
  }

  function isIOS() {
    var ua = ''; try { ua = navigator.userAgent || ''; } catch (e) {}
    return /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && (function () { try { return (navigator.maxTouchPoints || 0) > 1; } catch (e) { return false; } })());
  }
  function download(blob, name) {
    try {
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (e) { return false; }
  }
  /* iOS 的分享面板要在點擊之後不久呼叫；影片做得比較久時可能被拒絕（NotAllowedError），
     這時改跳一顆「儲存影片」按鈕，讓使用者再點一下。 */
  function savePrompt(file) {
    var old = document.getElementById('veSavePrompt'); if (old) old.remove();
    var w = document.createElement('div');
    w.id = 'veSavePrompt';
    w.style.cssText = 'position:fixed;inset:0;z-index:2100;background:rgba(38,36,32,0.55);display:flex;align-items:center;justify-content:center;padding:24px;';
    w.innerHTML = '<div style="background:#efeee6;border-radius:16px;padding:22px;max-width:300px;width:100%;text-align:center;">' +
      '<div style="font-size:17px;font-weight:600;margin-bottom:14px;color:#262420;">🎬 影片已完成</div>' +
      '<button type="button" id="veSaveBtn" style="display:block;width:100%;padding:13px;font:inherit;font-size:15px;border-radius:11px;border:1px solid #33415c;background:#33415c;color:#fff;">儲存影片</button>' +
      '<button type="button" id="veSaveCancel" style="margin-top:8px;background:none;border:none;font:inherit;font-size:13.5px;color:#75705f;text-decoration:underline;">取消</button></div>';
    document.body.appendChild(w);
    document.getElementById('veSaveCancel').onclick = function () { w.remove(); };
    document.getElementById('veSaveBtn').onclick = function () {
      w.remove();
      navigator.share({ files: [file], title: file.name }).catch(function () {});
    };
  }
  async function deliver(blob, name) {
    if (global.__expCollect) { global.__expCollect.files.push({ blob: blob, name: name }); return { ok: true, collected: true }; }
    var file = new File([blob], name, { type: 'video/mp4' });
    if (isIOS()) {
      if (!(navigator.canShare && navigator.canShare({ files: [file] }))) return { ok: false, reason: 'ios-no-share' };
      try { await navigator.share({ files: [file], title: name }); return { ok: true }; }
      catch (e) {
        if (e && e.name === 'AbortError') return { ok: true, cancelled: true };
        savePrompt(file); return { ok: true, prompted: true };
      }
    }
    if (download(blob, name)) {
      if (global.ExportMenu && global.ExportMenu.notifyDownloaded) global.ExportMenu.notifyDownloaded();
      return { ok: true };
    }
    return { ok: false, reason: 'download' };
  }

  global.VideoExport = { make: make, supported: supported, deliver: deliver, chooseOrient: chooseOrient, followFromScore: followFromScore,
                         toASC: toASC, NO_SUPPORT: NO_SUPPORT };
})(window);
