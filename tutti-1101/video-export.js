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
    return Math.min((W - 2 * MARGIN) / iw, (H - 2 * MARGIN) / ih);
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

  /* image：canvas 或 Image；audio：AudioBuffer。回傳 mp4 Blob */
  async function make(image, audio, opts) {
    opts = opts || {};
    var prog = opts.onProgress || function () {};
    await ensureMuxer();
    var iw = image.width || image.naturalWidth, ih = image.height || image.naturalHeight;
    var o = chooseOrient(opts.orient, iw, ih), W = SIZE[o][0], H = SIZE[o][1];
    var vcfg = await pickVideo(W, H);
    var CH = Math.min(2, audio.numberOfChannels);
    var acfg = await pickAudio([audio.sampleRate, 48000, 44100], CH);
    if (!vcfg || !acfg) throw new Error(NO_SUPPORT);
    var buf = await resample(audio, acfg.sampleRate);

    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    var k = fitScale(o, iw, ih), dw = iw * k, dh = ih * k;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(image, Math.round((W - dw) / 2), Math.round((H - dh) / 2), Math.round(dw), Math.round(dh));

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

  global.VideoExport = { make: make, supported: supported, deliver: deliver, chooseOrient: chooseOrient,
                         toASC: toASC, NO_SUPPORT: NO_SUPPORT };
})(window);
