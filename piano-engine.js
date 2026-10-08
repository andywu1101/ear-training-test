/* ===== 鋼琴音色引擎（v.93）=====
   兩套音色並存，使用者可在選單頁的設定卡片切換：

   musyng      ── 原本的音色，走 soundfont-player，程式完全沿用舊路徑
   salamander  ── Salamander Grand Piano（Yamaha C5 真實錄音），自己解碼與排程

   ⚠ 設計原則：對呼叫端「完全相容」。
   八個發聲頁只需要把 loadPiano() 換成呼叫這裡，
   所有 pianoInst.play(midi, when, { duration, gain }) 的呼叫點都不必改。

   為什麼不把加工烘進音色檔：實測過，把取樣重新編碼一次（48 kbps）
   訊噪比只剩 28 dB，聽起來明顯模糊；不重新編碼、改在播放時即時加工，
   音質最好，檔案也最小。詳見開發者手冊。 */
(function (global) {
  'use strict';

  var LS_KEY = 'earTrainer.settings.piano';
  var DEFAULT_KIT = 'salamander';

  /* ---- Salamander 的加工參數：想調整聽感改這裡就好 ---- */
  var SAL = {
    file:      'salamander-piano-mp3.js',
    tuningA:   442.0,    // 目標標準音
    sourceA:   441.76,   // 取樣實測的 A4
    atkBoost:  10.0,     // 音頭增益 dB
    atkMs:     20,       // 音頭長度
    hiShelf:   3.0,      // 高頻提升 dB
    hiFreq:    2500,     // 高頻提升的轉折頻率
    /* 逐音正規化的目標：取樣 RMS 拉到這個值（16 bit 尺度），
       與原本音色的平均值相同，這樣兩套音色切換時音量不會跳。 */
    targetRms: 229
  };
  var MUSYNG = { file: 'acoustic_grand_piano-mp3.js' };
  /* soundfont-player 的預設 release（實測其原始碼：attack .01 / decay .1 / sustain .9 / release .3）。
     兩套音色的音長要一致，這個值就必須相同。 */
  var RELEASE = 0.3;

  function currentKit() {
    try {
      var v = localStorage.getItem(LS_KEY);
      return (v === 'musyng' || v === 'salamander') ? v : DEFAULT_KIT;
    } catch (e) { return DEFAULT_KIT; }
  }
  function setKit(v) {
    try { localStorage.setItem(LS_KEY, v === 'musyng' ? 'musyng' : 'salamander'); } catch (e) {}
  }

  /* ---------- Salamander：自己實作的 sampler ---------- */
  function SalamanderPiano(ctx, buffers, gains) {
    this.ctx = ctx;
    this.buffers = buffers;          // midi → AudioBuffer
    this.gains = gains;              // midi → 正規化倍率
    this.keys = Object.keys(buffers).map(Number).sort(function (a, b) { return a - b; });
    this.playing = [];
  }
  SalamanderPiano.prototype._nearest = function (midi) {
    var best = this.keys[0];
    for (var i = 0; i < this.keys.length; i++) {
      if (Math.abs(this.keys[i] - midi) < Math.abs(best - midi)) best = this.keys[i];
    }
    return best;
  };
  /* 介面與 soundfont-player 相同：play(midi, when, { duration, gain }) */
  SalamanderPiano.prototype.play = function (midi, when, opts) {
    opts = opts || {};
    var ctx = this.ctx;
    var t = (when == null) ? ctx.currentTime : when;
    var dur = opts.duration || 3.3;
    /* 呼叫端傳進來的 gain 直接乘上去。
       ⚠ 取樣已經逐音正規化到「與原本音色相同的 RMS」，所以這裡不能再除以 3.5，
         否則整體會小 3.5 倍（約 10.9 dB）。 */
    var rel = (opts.gain == null ? 3.5 : opts.gain);

    var src = this._nearest(midi);
    var buf = this.buffers[src];
    if (!buf) return null;

    var node = ctx.createBufferSource();
    node.buffer = buf;
    /* 移調 ＋ 標準音校正 */
    node.playbackRate.value = Math.pow(2, (midi - src) / 12) * (SAL.tuningA / SAL.sourceA);

    var out = node;
    if (SAL.hiShelf > 0) {
      var hs = ctx.createBiquadFilter();
      hs.type = 'highshelf';
      hs.frequency.value = SAL.hiFreq;
      hs.gain.value = SAL.hiShelf;
      out.connect(hs); out = hs;
    }

    var base = (this.gains[src] || 1) * rel;
    var g = ctx.createGain();
    /* 音頭增益：起音時多給一點再滑回原本的大小，補回真實錄音較圓潤的 attack。
       ⚠ 全部用排程，不讀 gain.value——讀當下值會拿到還沒生效的舊值，
         尾端會被重設成較大的音量，聽起來像又打了一下。 */
    if (SAL.atkBoost > 0) {
      g.gain.setValueAtTime(base * Math.pow(10, SAL.atkBoost / 20), t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, base), t + SAL.atkMs / 1000);
    } else {
      g.gain.setValueAtTime(base, t);
    }
    /* ⚠ soundfont-player 的 duration 是「何時開始放掉」，不是「何時靜音」——
       它預設還會再衰減 release 0.3 秒。原本我在 duration 之內就淡完，
       每個音都短了將近 0.4 秒，旋律聽起來像跳音。這裡比照它的規格。 */
    g.gain.setValueAtTime(base, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + RELEASE);

    out.connect(g); g.connect(ctx.destination);
    node.start(t); node.stop(t + dur + RELEASE + 0.02);

    var self = this;
    this.playing.push(node);
    node.onended = function () {
      var i = self.playing.indexOf(node);
      if (i >= 0) self.playing.splice(i, 1);
    };
    return node;
  };
  SalamanderPiano.prototype.stop = function () {
    this.playing.forEach(function (n) { try { n.stop(); } catch (e) {} });
    this.playing = [];
  };

  /* ---------- 載入 ---------- */
  var NOTE = { C:0, 'C#':1, Db:1, D:2, 'D#':3, Eb:3, E:4, F:5, 'F#':6, Gb:6,
               G:7, 'G#':8, Ab:8, A:9, 'A#':10, Bb:10, B:11 };
  function midiOfName(n) {
    var m = String(n).match(/^([A-G][b#]?)(-?\d)$/);
    if (!m) return null;
    return NOTE[m[1]] + (parseInt(m[2], 10) + 1) * 12;
  }
  function dataUriToBuf(uri) {
    var b64 = String(uri).split(',')[1] || '';
    var bin = atob(b64), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }
  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('載入失敗：' + url)); };
      document.head.appendChild(s);
    });
  }

  /* 逐音正規化：量前 1.5 秒的 RMS。
     ⚠ 必須用左右聲道平均——Salamander 是真立體聲，左右 RMS 可以差到 ±35%，
       只取單一聲道會讓每個音的音量各自偏掉。 */
  function normGain(buf) {
    var L = buf.getChannelData(0);
    var R = (buf.numberOfChannels > 1) ? buf.getChannelData(1) : L;
    var n = Math.min(L.length, Math.floor(buf.sampleRate * 1.5));
    if (!n) return 1;
    var s = 0;
    for (var i = 0; i < n; i++) { var m = (L[i] + R[i]) / 2; s += m * m; }
    var rms = Math.sqrt(s / n) || 0.0001;
    return (SAL.targetRms / 32768) / rms;
  }

  var salData = null;   // 音色資料只載入一次，切換時不必重抓
  async function buildSalamander(ctx, onProgress) {
    if (!salData) {
      await loadScript(SAL.file);
      salData = (global.MIDI && global.MIDI.Soundfont && global.MIDI.Soundfont.salamander_piano) || null;
      if (!salData) throw new Error('Salamander 音色資料不完整');
    }
    var names = Object.keys(salData), buffers = {}, gains = {}, done = 0;
    for (var i = 0; i < names.length; i++) {
      var mi = midiOfName(names[i]);
      if (mi === null) continue;
      try {
        var buf = await ctx.decodeAudioData(dataUriToBuf(salData[names[i]]));
        buffers[mi] = buf;
        gains[mi] = normGain(buf);
      } catch (e) {}
      done++;
      if (onProgress) onProgress(done, names.length);
    }
    if (!Object.keys(buffers).length) throw new Error('Salamander 沒有任何取樣可用');
    return new SalamanderPiano(ctx, buffers, gains);
  }

  function buildMusyng(ctx) {
    return Soundfont.instrument(ctx, 'acoustic_grand_piano', {
      nameToUrl: function () { return MUSYNG.file; }
    }).catch(function () {
      return Soundfont.instrument(ctx, 'acoustic_grand_piano');   // 本機檔失敗就退回 CDN
    });
  }

  /* 把已載入的音色改接到另一個 AudioContext（v.97.6）
     iOS 把 App 切到背景再回來時，舊的 context 可能「說自己在跑、其實已經斷線」，
     這時頁面會換一個在使用者手勢裡新建的 context。
     AudioBuffer 不屬於任何 context（規格明定可以跨 context 使用），
     所以 Salamander 已解碼的取樣直接沿用，不必重新解碼，幾乎不用等。
     ⚠ soundfont-player 的音色在內部綁死原本的 context，搬不過去 → 回傳 false，由頁面重新載入。 */
  function rebind(inst, ctx) {
    if (!inst || !ctx || !(inst instanceof SalamanderPiano)) return false;
    try { inst.stop(); } catch (e) {}     // 舊 context 上凍住的音符一併取消
    inst.ctx = ctx;
    return true;
  }

  /* 對外介面：回傳的物件與 soundfont-player 的 instrument 相容。
     載入 Salamander 失敗時自動退回原本的音色，不讓使用者卡住。 */

  async function load(ctx, opts) {
    opts = opts || {};
    var want = opts.kit || currentKit();
    if (want === 'salamander') {
      try {
        var inst = await buildSalamander(ctx, opts.onProgress);
        inst.__kit = 'salamander';
        return inst;
      } catch (e) {
        if (opts.onFallback) opts.onFallback(e);
      }
    }
    var m = await buildMusyng(ctx);
    m.__kit = 'musyng';
    return m;
  }

  /* ---------- 導出用：把一串音符離線算成音訊 ----------
     導出不能用「邊播邊錄」（要等完整播放時間），而是用 OfflineAudioContext 重算一次。
     兩套音色都支援：AudioBuffer 可以跨 context 共用，只要取樣率相同。 */

  /* 把原本音色的 data URI 解碼成 AudioBuffer。
     只解碼這一題用得到的音，不必整組 88 個都解（導出會快很多）。 */
  var musyngData = null;
  async function musyngBuffers(ctx, midis) {
    if (!musyngData) {
      if (!(global.MIDI && global.MIDI.Soundfont && global.MIDI.Soundfont.acoustic_grand_piano)) {
        await loadScript(MUSYNG.file);
      }
      musyngData = global.MIDI.Soundfont.acoustic_grand_piano;
    }
    var byMidi = {};
    Object.keys(musyngData).forEach(function (n) {
      var mi = midiOfName(n);
      if (mi !== null) byMidi[mi] = musyngData[n];
    });
    var avail = Object.keys(byMidi).map(Number);
    var need = {};
    midis.forEach(function (m) {
      var best = avail[0];
      avail.forEach(function (k) { if (Math.abs(k - m) < Math.abs(best - m)) best = k; });
      need[best] = 1;
    });
    var out = {};
    var keys = Object.keys(need).map(Number);
    for (var i = 0; i < keys.length; i++) {
      try { out[keys[i]] = await ctx.decodeAudioData(dataUriToBuf(byMidi[keys[i]])); } catch (e) {}
    }
    return out;
  }

  async function salamanderBuffers(ctx, midis) {
    if (!salData) {
      await loadScript(SAL.file);
      salData = (global.MIDI && global.MIDI.Soundfont && global.MIDI.Soundfont.salamander_piano) || null;
      if (!salData) throw new Error('Salamander 音色資料不完整');
    }
    var byMidi = {};
    Object.keys(salData).forEach(function (n) {
      var mi = midiOfName(n);
      if (mi !== null) byMidi[mi] = salData[n];
    });
    var avail = Object.keys(byMidi).map(Number);
    var need = {};
    midis.forEach(function (m) {
      var best = avail[0];
      avail.forEach(function (k) { if (Math.abs(k - m) < Math.abs(best - m)) best = k; });
      need[best] = 1;
    });
    var out = {};
    var keys = Object.keys(need).map(Number);
    for (var i = 0; i < keys.length; i++) {
      try { out[keys[i]] = await ctx.decodeAudioData(dataUriToBuf(byMidi[keys[i]])); } catch (e) {}
    }
    return out;
  }

  /* events: [{ midi, time, duration, gain }]，time 與 duration 單位是秒。
     回傳算好的 AudioBuffer。音色依使用者目前的設定，加工也完全一致——
     所以導出的檔案跟他在 App 裡聽到的一模一樣。 */
  async function renderOffline(events, opts) {
    opts = opts || {};
    var kit = opts.kit || currentKit();
    var tail = 1.0;                       // 尾端留一點空間給最後一個音的 release
    var total = 0;
    events.forEach(function (e) {
      var end = (e.type === 'click')
        ? (e.time || 0) + 0.1
        : (e.time || 0) + (e.duration || 3.3) + RELEASE;
      if (end > total) total = end;
    });
    total += tail;

    var OfflineCtx = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    var ctx = new OfflineCtx(2, Math.ceil(44100 * total), 44100);

    /* 預備拍的節拍器是振盪器不是鋼琴音，這裡一起畫進去。
       參數與各練習頁即時播放時完全相同（三角波、重拍 1000 Hz、弱拍 700 Hz）。 */
    var clicks = events.filter(function (e) { return e.type === 'click'; });
    clicks.forEach(function (e) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = e.freq || 700;
      var t = e.time || 0;
      g.gain.setValueAtTime(e.gain == null ? 0.2 : e.gain, t);
      g.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + 0.05);
    });

    events = events.filter(function (e) { return e.type !== 'click'; });
    var midis = events.map(function (e) { return e.midi; });

    if (kit === 'salamander') {
      var buffers = await salamanderBuffers(ctx, midis);
      var gains = {};
      Object.keys(buffers).forEach(function (k) { gains[k] = normGain(buffers[k]); });
      var piano = new SalamanderPiano(ctx, buffers, gains);
      events.forEach(function (e) {
        piano.play(e.midi, e.time || 0, { duration: e.duration, gain: e.gain });
      });
    } else {
      /* 原本的音色：沒有任何加工，直接排程，與 soundfont-player 的行為一致 */
      var bufs = await musyngBuffers(ctx, midis);
      var keys = Object.keys(bufs).map(Number);
      events.forEach(function (e) {
        var best = keys[0];
        keys.forEach(function (k) { if (Math.abs(k - e.midi) < Math.abs(best - e.midi)) best = k; });
        if (!bufs[best]) return;
        var src = ctx.createBufferSource();
        src.buffer = bufs[best];
        src.playbackRate.value = Math.pow(2, (e.midi - best) / 12);
        var g = ctx.createGain();
        var base = (e.gain == null ? 3.5 : e.gain);
        var t = e.time || 0, d = e.duration || 3.3;
        g.gain.setValueAtTime(base, t);
        g.gain.setValueAtTime(base, t + d);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + RELEASE);
        src.connect(g); g.connect(ctx.destination);
        src.start(t); src.stop(t + d + RELEASE + 0.02);
      });
    }
    return await ctx.startRendering();
  }

  global.PianoEngine = {
    load: load,
    rebind: rebind,
    renderOffline: renderOffline,
    currentKit: currentKit,
    setKit: setKit,
    DEFAULT_KIT: DEFAULT_KIT,
    LS_KEY: LS_KEY,
    params: SAL
  };
})(window);
