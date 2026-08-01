/* ===================================================================
 * exam-common.js — 模擬考共用契約、計分與考試介面
 * 由 exam.html 與各練習頁（考試模式 ?exam=1）共用。
 *
 * 交卷式規則：
 *  - 題目在第一次進入該段時產生並存進 session，之後回到該段題目不變。
 *  - 答案即時存進 session，可自由「上一段／下一段」回頭修改。
 *  - 每段音訊只播一次；播放中鎖住換頁，切走 App 視同已播放。
 *  - 最後一段按「交卷」才一次計分。
 * =================================================================== */
(function () {
  var LS_SESSION = 'earTrainer.exam.session';
  var LS_HISTORY = 'earTrainer.exam.history';
  var HISTORY_CAP = 100;

  var SECTIONS = {
    interval: { no: '一', label: '音程',              max: 10, page: 'interval-trainer.html', type: 'choice' },
    chord:    { no: '二', label: '和絃性質判斷',      max: 10, page: 'chord-trainer.html',    type: 'choice' },
    rhythm1:  { no: '三', label: '節奏（第 1 題）',   max: 10, page: 'rhythm-trainer.html',   type: 'saved' },
    rhythm2:  { no: '三', label: '節奏（第 2 題）',   max: 10, page: 'rhythm-trainer.html',   type: 'saved' },
    melody1:  { no: '四', label: '單旋律（第 1 題）', max: 10, page: 'melody-trainer.html',   type: 'saved' },
    melody2:  { no: '四', label: '單旋律（第 2 題）', max: 10, page: 'melody-trainer.html',   type: 'saved' },
    twopart:  { no: '五', label: '兩聲部',            max: 20, page: 'two-part-trainer.html', type: 'saved' },
    fourpart: { no: '六', label: '四部和聲',          max: 20, page: 'four-part-trainer.html',type: 'saved' }
  };
  var FULL_ORDER = ['interval', 'chord', 'rhythm1', 'rhythm2', 'melody1', 'melody2', 'twopart', 'fourpart'];
  var PHASE1 = ['interval', 'chord', 'rhythm1', 'rhythm2', 'melody1', 'melody2', 'twopart', 'fourpart'];

  /* 單拍子考題：拍號與小節數配對（總拍數相當） */
  var SIMPLE_METERS = [ { meter: '4/4', bars: 2 }, { meter: '3/4', bars: 3 }, { meter: '2/4', bars: 4 } ];
  var COMPOUND_METER = { meter: '6/8', bars: 2 };

  var GAPS = { reps: 3, repGap: 500, questionGap: 2000, interleaveGap: 1500, roundGap: 2500 };

  var STD_CONFIG = {
    interval: { count: 10, allowRepeat: false, compound: true,  pool: 'ALL13' },   // 13 種抽 10 種，不重複
    chord:    { count: 10, allowRepeat: false, inversion: false, pool: 'LV5' }
    // rhythm1/2、melody1/2 的拍號在 startStandard() 時隨機決定並寫入 config
  };

  /* 產生本次考卷的節奏／旋律設定（拍號在開考時決定，之後固定） */
  function buildMeterConfig() {
    function pickSimple() { return SIMPLE_METERS[Math.floor(Math.random() * SIMPLE_METERS.length)]; }
    var r1 = pickSimple(), m1 = pickSimple();
    return {
      rhythm1: { meter: r1.meter, meterType: 'simple',   bars: r1.bars, bpm: 80, plays: 5, pitchMode: 'single' },
      rhythm2: { meter: COMPOUND_METER.meter, meterType: 'compound', bars: COMPOUND_METER.bars, bpm: 80, plays: 5, pitchMode: 'dual' },
      melody1: { meter: m1.meter, meterType: 'simple',   bars: m1.bars, bpm: 72, plays: 6, clef: 'treble', tuningA: true },
      melody2: { meter: COMPOUND_METER.meter, meterType: 'compound', bars: COMPOUND_METER.bars, bpm: 72, plays: 6, clef: 'treble', tuningA: true },
      twopart:  { meter: '4/4', meterType: 'simple', bars: 2, bpm: 70, plays: 8, tuningA: true },
      fourpart: { bars: 10, bpm: 100, plays: 6, levelId: 4, tuningA: true }
    };
  }

  /* ---------------- session ---------------- */
  function loadSession() { try { return JSON.parse(localStorage.getItem(LS_SESSION) || 'null'); } catch (e) { return null; } }
  function saveSession(s) { try { localStorage.setItem(LS_SESSION, JSON.stringify(s)); } catch (e) {} }
  function clearSession() { try { localStorage.removeItem(LS_SESSION); } catch (e) {} }
  function hasSession() { return !!loadSession(); }

  function startStandard() {
    var s = {
      id: 'exam_' + Date.now(), mode: 'standard',
      scopeLabel: '標準考卷（模擬大學入學考試難度）',
      startedAt: Date.now(),
      queue: PHASE1.slice(), cursor: 0,
      play: (Math.random() < 0.5 ? 'A' : 'B'),
      config: (function () { var c = JSON.parse(JSON.stringify(STD_CONFIG)); var m = buildMeterConfig(); for (var k in m) c[k] = m[k]; return c; })(),
      data: {}   // { interval:{questions,labels,answers,played}, ... }
    };
    saveSession(s); return s;
  }

  function currentSection(s) { s = s || loadSession(); if (!s) return null; return s.queue[s.cursor] || null; }
  function configFor(k, s) { s = s || loadSession(); if (s && s.config && s.config[k]) return s.config[k]; return STD_CONFIG[k] || null; }
  function playMode(s) { s = s || loadSession(); return s ? s.play : 'A'; }
  function playModeLabel(m) { return m === 'A' ? '逐題三連（每題連播 3 遍）' : '整段三輪（整段共播 3 輪）'; }
  function progress(s) { s = s || loadSession(); if (!s) return null; return { index: s.cursor + 1, total: s.queue.length, key: currentSection(s) }; }

  /* 取某段資料；沒有就用 gen() 產生並存起來（題目只產生一次） */
  function sectionData(key, gen) {
    var s = loadSession(); if (!s) return null;
    if (!s.data) s.data = {};
    if (!s.data[key] && typeof gen === 'function') {
      var d = gen();  // { questions:[...], labels:{key:label} }
      s.data[key] = { questions: d.questions, labels: d.labels || {}, answers: [], played: false };
      saveSession(s);
    }
    return s.data[key] || null;
  }
  function saveAnswers(key, answers) {
    var s = loadSession(); if (!s || !s.data || !s.data[key]) return;
    s.data[key].answers = answers; saveSession(s);
  }
  /* 節奏／旋律等由各頁自行計分（頁面才知道每拍音數），作答時即時存起來 */
  function saveResult(key, result) {
    var s = loadSession(); if (!s || !s.data || !s.data[key]) return;
    s.data[key].result = result; saveSession(s);
  }
  /* 逐拍計分（單旋律／兩聲部共用）
   *  beats: [{ rhythmOK:bool, sameCount:bool, wrongPitches:int }]
   *  規則：節奏對 → 每個錯音 -1；節奏錯但音數相同 → -2 再每個錯音 -1；節奏錯且音數不同 → 該拍 -4 */
  function scoreBeats(beats, max) {
    var lost = 0;
    (beats || []).forEach(function (b) {
      if (b.rhythmOK) lost += (b.wrongPitches || 0);
      else if (b.sameCount) lost += 2 + (b.wrongPitches || 0);
      else lost += 4;
    });
    return Math.max(0, max - lost);
  }
  /* 節奏題計分：每個錯拍 -2 */
  function scoreRhythm(wrongBeats, max) { return Math.max(0, max - 2 * (wrongBeats || 0)); }
  function markPlayed(key) {
    var s = loadSession(); if (!s || !s.data || !s.data[key]) return;
    s.data[key].played = true; saveSession(s);
  }
  function isPlayed(key) {
    var s = loadSession(); return !!(s && s.data && s.data[key] && s.data[key].played);
  }

  /* 移動段落；回傳目標網址 */
  function gotoIndex(i) {
    var s = loadSession(); if (!s) return 'exam.html';
    if (i < 0) i = 0;
    if (i >= s.queue.length) return 'exam.html?done=1';
    s.cursor = i; saveSession(s);
    return SECTIONS[s.queue[i]].page + '?exam=1';
  }
  function gotoPrev() { var s = loadSession(); return gotoIndex(s ? s.cursor - 1 : 0); }
  function gotoNext() { var s = loadSession(); return gotoIndex(s ? s.cursor + 1 : 0); }
  function isLast(s) { s = s || loadSession(); return !!s && s.cursor >= s.queue.length - 1; }

  /* 未作答統計（交卷確認用） */
  function unansweredReport() {
    var s = loadSession(); if (!s) return { total: 0, parts: [], unplayed: [] };
    var parts = [], total = 0, unplayed = [];
    s.queue.forEach(function (k) {
      var d = s.data && s.data[k];
      if (!d) { unplayed.push(SECTIONS[k].label); return; }
      var miss = 0, unit = '題';
      if ((SECTIONS[k] || {}).type === 'saved') { miss = (d.result && d.result.unanswered) || 0; unit = '拍'; }
      else { for (var i = 0; i < (d.questions || []).length; i++) { if (!d.answers || !d.answers[i]) miss++; } }
      if (miss > 0) { parts.push(SECTIONS[k].label + ' ' + miss + ' ' + unit); total += miss; }
      if (!d.played) unplayed.push(SECTIONS[k].label);
    });
    return { total: total, parts: parts, unplayed: unplayed };
  }

  /* 集中計分：音程／和絃皆為「答案 key === 題目 qualityKey」 */
  function computeResults(s) {
    s = s || loadSession(); var out = {};
    if (!s) return out;
    s.queue.forEach(function (k) {
      var d = s.data && s.data[k]; if (!d) return;
      if ((SECTIONS[k] || {}).type === 'saved') {
        out[k] = d.result || { score: 0, max: SECTIONS[k].max, detail: null };
        return;
      }
      var cor = 0, detail = [];
      d.questions.forEach(function (q, i) {
        var ua = (d.answers && d.answers[i]) || null;
        var ok = (ua === q.qualityKey);
        if (ok) cor++;
        detail.push({ correct: ok, your: ua ? (d.labels[ua] || ua) : '（未作答）', right: d.labels[q.qualityKey] || q.qualityKey });
      });
      out[k] = { score: cor, max: SECTIONS[k].max, detail: detail };
    });
    return out;
  }

  function finalize() {
    var s = loadSession(); if (!s) return null;
    var scores = computeResults(s);
    var total = 0, max = 0, secOut = {};
    FULL_ORDER.forEach(function (k) {
      var sc = scores[k];
      if (sc) { total += sc.score; max += sc.max; secOut[k] = sc; }
    });
    var pct = max > 0 ? Math.round((total / max) * 100) : 0;
    var rec = { date: Date.now(), mode: s.mode, scope: s.scopeLabel, total: total, max: max, pct: pct, play: s.play, sections: secOut, id: s.id };
    var h = loadHistory(); h.push(rec);
    if (h.length > HISTORY_CAP) h = h.slice(h.length - HISTORY_CAP);
    try { localStorage.setItem(LS_HISTORY, JSON.stringify(h)); } catch (e) {}
    clearSession();
    return rec;
  }

  /* ---------------- history ---------------- */
  function loadHistory() { try { return JSON.parse(localStorage.getItem(LS_HISTORY) || '[]'); } catch (e) { return []; } }
  function clearHistory() { try { localStorage.removeItem(LS_HISTORY); } catch (e) {} }
  function historyStats(mode) {
    var h = loadHistory().filter(function (r) { return !mode || r.mode === mode; });
    if (!h.length) return null;
    var p = h.map(function (r) { return r.pct; });
    return { best: Math.max.apply(null, p), last: p[p.length - 1], avg: Math.round(p.reduce(function (a, b) { return a + b; }, 0) / p.length), count: h.length };
  }

  function isExamMode() { try { return /[?&]exam=1\b/.test(location.search); } catch (e) { return false; } }

  /* =================================================================
   * 考試介面（抬頭、底部列、更多卡片、播放鎖定）— 兩頁共用
   * host: 該頁 practice 容器元素
   * ================================================================= */
  var _locked = false;

  function injectStyles() {
    if (document.getElementById('exam-ui-style')) return;
    var st = document.createElement('style'); st.id = 'exam-ui-style';
    st.textContent =
      '#exam-head{background:#33415c;color:#fff;border-radius:12px;padding:8px 14px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;flex:0 0 auto;}' +
      '#exam-head .eh-title{font-family:Fraunces,serif;font-weight:600;font-size:20px;letter-spacing:0.01em;line-height:1.25;}' +
      '#exam-head .eh-play{font-size:12.5px;opacity:0.92;text-align:right;}' +
      '#exam-bar{flex:0 0 auto;}' +
      '#exam-warnmsg{flex:0 0 auto;}' +
      '#exam-lockwrap.playing{outline:2.5px solid #a6493b;outline-offset:4px;border-radius:14px;}' +
      '#exam-lockwrap.warn{animation:examWarn 0.6s ease;}' +
      '@keyframes examWarn{0%,100%{outline-color:#a6493b;}50%{outline-color:rgba(166,73,59,0.25);}}' +
      '#exam-warnmsg{display:none;background:rgba(166,73,59,0.1);border:1px solid rgba(166,73,59,0.4);color:#a6493b;font-size:12.5px;font-weight:700;border-radius:10px;padding:7px 12px;margin:6px 0;text-align:center;}' +
      '#exam-warnmsg.show{display:block;}' +
      '#exam-bar{display:flex;gap:8px;margin-top:10px;}' +
      '#exam-bar button{flex:1;font-family:Inter,sans-serif;font-weight:700;font-size:13.5px;padding:10px 6px;border-radius:999px;border:1px solid #ddd8c9;background:#fbfaf6;color:#262420;cursor:pointer;touch-action:manipulation;transition:all .15s ease;}' +
      '#exam-bar button:hover:not(:disabled),#exam-bar button:active:not(:disabled){border-color:#33415c;background:#33415c;color:#fbfaf6;}' +
      '#exam-bar button:disabled{opacity:0.4;cursor:not-allowed;}' +
      '#exam-bar button.submit{background:#a6493b;color:#fff;border-color:#a6493b;box-shadow:0 4px 14px rgba(166,73,59,0.28);}' +
      '#exam-bar button.submit:hover,#exam-bar button.submit:active{filter:brightness(1.08);background:#a6493b;color:#fff;}' +
      '.exam-modal{display:none;position:fixed;inset:0;z-index:1300;background:rgba(38,36,32,0.55);padding:24px 16px;overflow-y:auto;}' +
      '.exam-modal.open{display:flex;align-items:center;justify-content:center;}' +
      '.exam-modal .box{background:#efeee6;border:1px solid #ddd8c9;border-radius:16px;max-width:380px;width:100%;padding:24px 22px;box-shadow:0 20px 50px rgba(0,0,0,0.28);}' +
      '.exam-modal h3{font-family:Fraunces,serif;font-size:20px;font-weight:600;margin:0 0 14px;text-align:center;}' +
      '.exam-modal .opt{display:block;width:100%;font-family:Inter,sans-serif;font-weight:700;font-size:14.5px;padding:13px;margin-bottom:9px;border-radius:12px;border:1px solid #ddd8c9;background:#fbfaf6;color:#262420;cursor:pointer;text-align:center;touch-action:manipulation;}' +
      '.exam-modal .opt:hover,.exam-modal .opt:active{border-color:#33415c;background:rgba(51,65,92,0.08);}' +
      '.exam-modal .opt.danger{color:#a6493b;border-color:rgba(166,73,59,0.4);}' +
      '.exam-modal .dismiss{width:100%;background:none;border:none;font-size:13px;color:#75705f;text-decoration:underline;cursor:pointer;padding:8px;}';
    document.head.appendChild(st);
  }

  /* 建立抬頭 */
  function buildHeader(host, sectionKey, rightText) {
    injectStyles();
    var def = SECTIONS[sectionKey];
    var exist = document.getElementById('exam-head');
    var right = rightText || ('播放：' + playModeLabel(playMode()));
    if (exist) { exist.querySelector('.eh-play').innerHTML = right; return; }
    var bar = document.createElement('div'); bar.id = 'exam-head';
    bar.innerHTML = '<span class="eh-title">' + def.no + '、' + def.label + '</span>' +
                    '<span class="eh-play">' + right + '</span>';
    host.insertBefore(bar, host.firstChild);
  }

  /* 播放狀態：紅框＋提示條僅作「播放中」的狀態提示；換頁不禁用，改為點擊時確認 */
  function setPlaying(on, wrapEl) {
    _locked = !!on;
    var w = wrapEl || document.getElementById('exam-lockwrap');
    if (w) { if (on) w.classList.add('playing'); else { w.classList.remove('playing'); w.classList.remove('warn'); } }
    var msg = document.getElementById('exam-warnmsg');
    if (msg) {
      if (on) { msg.textContent = '🔊 題目播放中…（本段僅播放一次）'; msg.classList.add('show'); }
      else msg.classList.remove('show');
    }
  }
  function isLocked() { return _locked; }
  function warnLocked() {
    var w = document.getElementById('exam-lockwrap');
    var msg = document.getElementById('exam-warnmsg');
    if (msg) { msg.textContent = '⚠️ 題目播放中，請聽完再操作（本段僅播放一次）'; msg.classList.add('show'); }
    if (w) { w.classList.remove('warn'); void w.offsetWidth; w.classList.add('warn'); }
  }

  /* 建立底部列（上一段／下一段 or 交卷／更多）與更多卡片 */
  function buildBar(host, onLeave) {
    injectStyles();
    if (document.getElementById('exam-bar')) return;
    var s = loadSession(); if (!s) return;
    var last = isLast(s);
    /* 放進「會捲動的作答區」末端，避免固定在視窗最底而誤觸手機底部手勢列 */
    var scrollHost = host.querySelector('.practice-bottom-scroll') || host.querySelector('.fpt-keyboard-area') || host;
    if (!document.getElementById('exam-warnmsg')) {
      var wm = document.createElement('div'); wm.id = 'exam-warnmsg';
      (scrollHost === host ? host : scrollHost).appendChild(wm);
    }
    var bar = document.createElement('div'); bar.id = 'exam-bar';
    if (scrollHost !== host) { bar.style.marginTop = '28px'; bar.style.paddingBottom = '18px'; }
    bar.innerHTML =
      '<button id="exam-prev"' + (s.cursor === 0 ? ' disabled' : '') + '>← 上一段</button>' +
      '<button id="exam-next" class="' + (last ? 'submit' : '') + '">' + (last ? '📤 交卷' : '下一段 →') + '</button>' +
      '<button id="exam-more">⋯ 更多</button>';
    /* 一律放在作答區最下面（四部＝編輯低音／級數面板之後），往下捲即可看到。
       底部保留安全距離，避免貼齊畫面邊緣而壓到手機的底部手勢列。 */
    if (scrollHost !== host) {
      bar.style.marginTop = '24px';
      bar.style.paddingBottom = 'calc(28px + env(safe-area-inset-bottom))';
      scrollHost.style.paddingBottom = 'calc(16px + env(safe-area-inset-bottom))';
    }
    scrollHost.appendChild(bar);

    var modal = document.createElement('div'); modal.className = 'exam-modal'; modal.id = 'exam-moreModal';
    modal.innerHTML =
      '<div class="box"><h3>更多</h3>' +
      '<button class="opt" id="exam-opt-pause">⏸ 暫離考試（保留進度）</button>' +
      '<button class="opt" id="exam-opt-menu">🏠 回選單（保留進度）</button>' +
      '<button class="opt danger" id="exam-opt-restart">🗑️ 放棄考試，重新開始</button>' +
      '<button class="dismiss" id="exam-opt-close">取消</button></div>';
    document.body.appendChild(modal);
    modal.onclick = function (e) { if (e.target === modal) modal.classList.remove('open'); };

    /* 播放中仍可跳轉，但先確認；確定後停止播放並記為已播放（不能再重聽） */
    function guard(fn) {
      return function () {
        if (_locked) {
          if (!window.confirm('目前題目還在播放中。\n\n若現在跳轉，本段將視同已播放、之後不能再重聽。\n\n確定要跳轉嗎？')) return;
          try { if (typeof window.stopAllPlayback === 'function') window.stopAllPlayback(); } catch (e) {}
          var ck = currentSection(); if (ck) markPlayed(ck);
          setPlaying(false);
        }
        fn();
      };
    }
    document.getElementById('exam-prev').onclick = guard(function () { if (onLeave) onLeave(); location.href = gotoPrev(); });
    document.getElementById('exam-next').onclick = guard(function () {
      if (onLeave) onLeave();
      if (!isLast()) { location.href = gotoNext(); return; }
      var rep = unansweredReport();
      var msg;
      if (rep.total > 0) msg = '尚有 ' + rep.total + ' 題未作答（' + rep.parts.join('、') + '），未作答一律計為零分。\n\n確定要交卷嗎？';
      else msg = '確定要交卷嗎？交卷後不能再修改答案。';
      if (rep.unplayed.length) msg = '「' + rep.unplayed.join('、') + '」尚未播放。\n\n' + msg;
      if (window.confirm(msg)) location.href = 'exam.html?done=1';
    });
    document.getElementById('exam-more').onclick = guard(function () { modal.classList.add('open'); });
    document.getElementById('exam-opt-close').onclick = function () { modal.classList.remove('open'); };
    document.getElementById('exam-opt-pause').onclick = function () { if (onLeave) onLeave(); location.href = 'exam.html'; };
    document.getElementById('exam-opt-menu').onclick = function () { if (onLeave) onLeave(); location.href = 'index.html#menu'; };
    document.getElementById('exam-opt-restart').onclick = function () {
      if (window.confirm('確定放棄這份考試並重新開始嗎？已作答的內容會全部清除。')) { clearSession(); location.href = 'exam.html'; }
    };
  }

  /* 切走 App／關螢幕：視同已播放（避免靠切走賺重聽） */
  function guardVisibility(sectionKey, onHidden) {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && _locked) { markPlayed(sectionKey); _locked = false; if (onHidden) onHidden(); }
    });
  }

  window.EXAM = {
    LS_SESSION: LS_SESSION, LS_HISTORY: LS_HISTORY,
    SECTIONS: SECTIONS, FULL_ORDER: FULL_ORDER, PHASE1: PHASE1, GAPS: GAPS, STD_CONFIG: STD_CONFIG,
    loadSession: loadSession, saveSession: saveSession, clearSession: clearSession, hasSession: hasSession,
    startStandard: startStandard, currentSection: currentSection, configFor: configFor,
    playMode: playMode, playModeLabel: playModeLabel, progress: progress, isLast: isLast,
    sectionData: sectionData, saveAnswers: saveAnswers, saveResult: saveResult, markPlayed: markPlayed, isPlayed: isPlayed,
    scoreBeats: scoreBeats, scoreRhythm: scoreRhythm, SIMPLE_METERS: SIMPLE_METERS, COMPOUND_METER: COMPOUND_METER,
    gotoIndex: gotoIndex, gotoPrev: gotoPrev, gotoNext: gotoNext,
    unansweredReport: unansweredReport, computeResults: computeResults, finalize: finalize,
    loadHistory: loadHistory, clearHistory: clearHistory, historyStats: historyStats,
    isExamMode: isExamMode,
    buildHeader: buildHeader, buildBar: buildBar, setPlaying: setPlaying, isLocked: isLocked,
    warnLocked: warnLocked, guardVisibility: guardVisibility
  };
})();
