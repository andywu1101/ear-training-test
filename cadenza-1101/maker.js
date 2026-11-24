/* ===== 出題工具（cadenza-1101）=====
   左邊嵌入 App 原本的練習頁（?maker=1），出題、譜例、音檔都由練習頁本人產生；
   這裡負責題目列表、預覽卡片、A4 排版、列印與 mp3 打包。 */
(function () {
  'use strict';
  var STORE = 'earTrainer.maker.paper', NOPV = 'earTrainer.maker.noPreview';

  /* 題型：第三階段起全部開放 */
  var TYPES = [
    { id: 'interval', label: '音程', page: 'interval-trainer.html', on: true },
    { id: 'chord', label: '和絃', page: 'chord-trainer.html', on: true },
    { id: 'rhythm', label: '節奏', page: 'rhythm-trainer.html', on: true },
    { id: 'melody', label: '單旋律', page: 'melody-trainer.html', on: true },
    { id: 'twopart', label: '兩聲部', page: 'two-part-trainer.html', on: true },
    { id: 'pitcherr', label: '找錯音', page: 'pitch-error-trainer.html', on: true },
    { id: 'pitchstack', label: '音堆', page: 'pitch-stack-trainer.html', on: true },
    { id: 'fourpart', label: '四部和聲', page: 'four-part-trainer.html', on: true },
    { id: 'chorale', label: '聖詠和聲', page: 'chorale-trainer.html', on: true }   // v111
  ];
  /* 大題：順序固定（v106.8 起比照大學檔模擬考的順序與名稱） */
  var SECTIONS = [
    { id: 'pitcherr', name: '音高的辨認' },
    { id: 'interval', name: '音程' }, { id: 'chord', name: '和絃性質判斷' },
    { id: 'rhythm', name: '節奏' }, { id: 'memRhythm', name: '記憶節奏' },
    { id: 'melody', name: '單旋律' }, { id: 'memMelody', name: '記憶旋律' },
    { id: 'twopart', name: '兩聲部' }, { id: 'memTwopart', name: '記憶兩聲部' },
    { id: 'pitchstack', name: '音堆辨認' }, { id: 'fourpart', name: '四部和聲' },
    { id: 'chorale', name: '聖詠和聲' }
  ];
  var CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  function $(id) { return document.getElementById(id); }
  function today() { var d = new Date(), p = function (x) { return String(x).padStart(2, '0'); }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); }

  /* ---------- 資料 ---------- */
  var paper = load();
  function load() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) {}
    p = p || {};
    p.header = p.header || { title: '', author: '伍祐恆', date: today() };
    p.density = p.density || 'dense';
    p.sectionNames = p.sectionNames || {};
    p.sectionScores = p.sectionScores || {};
    p.items = p.items || [];
    return p;
  }
  function save() {
    var slim = JSON.parse(JSON.stringify(paper, function (k, v) { return (k === 'measures' || k === 'shownBreaks' || k === 'chSvg') ? undefined : v; }));
    try { localStorage.setItem(STORE, JSON.stringify(slim)); } catch (e) {}
  }
  function secName(id) { return paper.sectionNames[id] || SECTIONS.filter(function (s) { return s.id === id; })[0].name; }
  /* ---------- 配分 ---------- */
  function fmtScore(v) { return String(Math.round(v * 100) / 100); }
  function scoreText(v) { return (v == null || v === '') ? '' : '（' + fmtScore(v) + '分）'; }
  function parseScore(t) { t = String(t).trim(); if (t === '') return null; var v = parseFloat(t); return (isFinite(v) && v >= 0) ? v : null; }
  /* 大題的分數：大題有填就用大題的；沒填就用小題的加總（都沒填＝null） */
  function itemSum(secId) {
    var its = paper.items.filter(function (it) { return it.section === secId && it.score != null; });
    return its.length ? its.reduce(function (a, it) { return a + it.score; }, 0) : null;
  }
  function secTotal(secId) { var v = paper.sectionScores[secId]; return v != null ? v : itemSum(secId); }
  function paperTotal() {
    var t = null;
    ordered().forEach(function (g) { var v = secTotal(g.sec); if (v != null) t = (t || 0) + v; });
    return t;
  }
  window.__makerScoreText = scoreText;   // engrave.js 印小題配分用

  function sectionOf(type, data) {
    if (type === 'rhythm') return data.barsCount === 1 ? 'memRhythm' : 'rhythm';
    if (type === 'melody') return data.barsCount === 1 ? 'memMelody' : 'melody';
    if (type === 'twopart') return data.barsCount === 1 ? 'memTwopart' : 'twopart';
    return type;
  }
  /* 依大題順序排好的題目，附上編號 */
  function ordered() {
    var out = [], n = 0;
    SECTIONS.forEach(function (s) {
      var its = paper.items.filter(function (it) { return it.section === s.id; });
      if (!its.length) return;
      out.push({ sec: s.id, items: its.map(function (it) { n++; return { it: it, num: n }; }) });
    });
    return out;
  }
  var uid = function () { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };

  /* ---------- 練習頁 iframe ---------- */
  var frames = {}, curTab = null;
  function frameWin(type) {
    var f = frames[type];
    return f && f.contentWindow && f.contentWindow.__maker ? f.contentWindow : null;
  }
  /* v108：練習頁用到才載入。iPhone／iPad 記憶體有限（伍線譜掃描踩過：同時開太多重的東西 Safari 整個崩潰），
     最多同時留 MAX_FRAMES 個，超過就關掉最久沒用、不是目前分頁的那個（它的設定會回到預設）。 */
  var IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var MAX_FRAMES = (IS_IOS || /Android/.test(navigator.userAgent)) ? 2 : 8;
  function evictFrames(keep) {
    var ks = Object.keys(frames);
    while (ks.length >= MAX_FRAMES) {
      var cand = ks.filter(function (k) { return k !== curTab && k !== keep; })
                   .sort(function (a, b) { return (frames[a].__usedAt || 0) - (frames[b].__usedAt || 0); })[0];
      if (!cand) break;
      var f = frames[cand];
      try { f.src = 'about:blank'; } catch (e) {}
      f.remove(); delete frames[cand];
      ks = Object.keys(frames);
    }
  }
  function ensureFrame(type) {
    if (frames[type]) { frames[type].__usedAt = Date.now(); return frames[type]; }
    evictFrames(type);
    var t = TYPES.filter(function (x) { return x.id === type; })[0];
    var f = document.createElement('iframe');
    f.src = '../tutti-1101/' + t.page + '?maker=1';
    f.addEventListener('load', function () { f.__loadedAt = Date.now(); });
    f.__usedAt = Date.now();
    $('frames').appendChild(f);
    frames[type] = f;
    return f;
  }
  function waitFrame(type) {
    ensureFrame(type);
    return new Promise(function (res, rej) {
      var t0 = Date.now();
      (function poll() {
        var w = frameWin(type), f = frames[type];
        /* ⚠ MusicXML 記錄器要等 VexFlow 載入後才掛得上（sheet-export.js 每 0.25 秒試一次），
           所以頁面載入完成後再多等一下，否則剛開的練習頁會「沒有樂譜資料」 */
        if (w && w.SheetExport && w.PianoEngine && f.__loadedAt && Date.now() - f.__loadedAt > 300 && recorderReady(w)) return res(w);
        if (Date.now() - t0 > 30000) return rej(new Error('練習頁載入逾時，請重新整理'));
        setTimeout(poll, 150);
      })();
    });
  }
  /* 記錄器掛上之後，VexFlow 的 StaveNote.draw 會被包一層（sheet-export.js 的 wrap）。
     v106.5：只等固定 0.8 秒不夠——練習頁的計時器被延後時會掛得更晚，改成確認掛好了才算 */
  function recorderReady(w) {
    try { return String(w.Vex.Flow.StaveNote.prototype.draw).indexOf('orig.apply') >= 0; } catch (e) { return false; }
  }
  function showTab(type) {
    curTab = type;
    ensureFrame(type);
    Object.keys(frames).forEach(function (k) { frames[k].classList.toggle('on', k === type); });
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === type); });
  }
  function buildTabs() {
    TYPES.forEach(function (t) {
      var b = document.createElement('button');
      b.textContent = t.label; b.dataset.t = t.id; b.disabled = !t.on;
      if (!t.on) b.title = '之後的階段才會開放';
      b.onclick = function () { showTab(t.id); };
      $('tabs').appendChild(b);
    });
    showTab('interval');
  }

  /* 練習頁按「出題」時呼叫這裡（練習頁裡的 window.parent.__makerOffer） */
  window.__makerOffer = function (o) {
    var w = frameWin(o.type);
    var cand;
    try { cand = buildCandidate(w, o.type, o.data, o.snapshot, o.title); }
    catch (e) { alert('出題失敗：' + e.message); return; }
    if (paper.noPreview) { addItem(cand); flash('已加入：' + cand.title); return; }
    openCard(cand, null);
  };
  function buildCandidate(w, type, data, snapshot, title) {
    var xml = w.__maker.musicxml(data);
    return { id: uid(), type: type, section: sectionOf(type, data), title: title, autoTitle: title, data: data, snapshot: snapshot,
             xml: xml, answers: w.__maker.answers(data), layout: (type === 'interval' || type === 'chord') ? 'cells' : (type === 'fourpart' ? 'grand' : (type === 'pitchstack' ? 'stack' : (type === 'chorale' ? 'chorale' : 'lines'))),
             chSvg: w.__maker.paper ? w.__maker.paper(data) : undefined,   // v111 聖詠和聲：練習頁畫好的譜（作答卷／解答卷；不存進 localStorage，見 prepChorale）
             blankNotes: type === 'pitcherr',   // 找錯音：作答卷要印題目譜
             pageBreak: false, breaks: null };
  }
  /* 新題目的自動標題：依題目內容決定標題的題型（四部和聲、找錯音）用頁面給的；其他題型由設定決定，與原本相同 */
  function autoTitleOf(w, data, it) { return (w.__maker.titleOf ? w.__maker.titleOf(data) : null) || it.autoTitle || it.title; }
  /* v111 聖詠和聲：譜例（SVG）一題約 0.4 MB，不存進 localStorage（整個網域共用 5 MB），只存題目資料；
     重新開啟、載入「我的考卷」後，用到時再請練習頁重畫一次（記在 it.chSvg，只放記憶體） */
  var chPending = null;
  function prepChorale() {
    var need = paper.items.filter(function (it) { return it.layout === 'chorale' && !it.chSvg; });
    if (!need.length) return Promise.resolve();
    if (chPending) return chPending;
    chPending = waitFrame('chorale').then(function (w) {
      need.forEach(function (it) { if (!it.chSvg) it.chSvg = w.__maker.paper(it.data); });
      chPending = null;
    }, function (e) { chPending = null; throw e; });
    return chPending;
  }
  window.__makerNeedChorale = function () {   // engrave.js 畫到還沒有譜的聖詠和聲時呼叫（先畫同樣高度的空白，畫好再重排）
    if (chPending) return;
    prepChorale().then(function () { renderList(); renderPreview(); }, function (e) { flash('聖詠和聲譜例載入失敗：' + e.message); });
  };
  function addItem(c) { paper.items.push(c); save(); renderList(); }

  /* ---------- 預覽卡片 ---------- */
  var card = null;   // { cand, replaceId }
  function openCard(cand, replaceId) {
    card = { cand: cand, replaceId: replaceId };
    $('cardTitle').textContent = (replaceId ? '重抽：' : '預覽：') + cand.title;
    $('cardAdd').textContent = replaceId ? '✓ 取代原題' : '＋ 加入考卷';
    $('noPreviewCard').checked = !!paper.noPreview;
    drawCardScore();
    resetCardAudio();
    $('cardMask').classList.add('on');
  }
  function drawCardScore() {
    var box = $('cardScore'); box.innerHTML = '';
    var d = Engrave.DENSITY.std, c = Object.assign({}, card.cand);
    c.measures = null;
    var el = Engrave.renderItem(c, 'key', d, { item: '', cell: 1 }, null);
    el.querySelector('.item-title').remove();
    box.appendChild(el);
  }
  function resetCardAudio() {
    var a = $('cardAudio'); a.pause(); a.removeAttribute('src'); a.style.display = 'none';
    $('cardPlay').style.display = ''; $('cardMsg').textContent = ''; $('cardMsg').className = 'msg';
  }
  function closeCard() { $('cardAudio').pause(); $('cardMask').classList.remove('on'); card = null; }
  $('cardCancel').onclick = closeCard;
  $('noPreviewCard').onchange = function (e) { paper.noPreview = e.target.checked; $('noPreviewTop').checked = paper.noPreview; save(); };
  $('noPreviewTop').onchange = function (e) { paper.noPreview = e.target.checked; save(); };
  $('cardAdd').onclick = function () {
    var c = card.cand;
    if (card.replaceId) {
      var old = paper.items.filter(function (x) { return x.id === card.replaceId; })[0];
      if (old) {
        /* 標題：作者改過的保留；沒改過的換成新題目的標題（四部和聲的調號、找錯音的拍號等會跟著變） */
        c.id = old.id; c.pageBreak = old.pageBreak;
        if (old.autoTitle != null && old.title !== old.autoTitle) c.title = old.title;
        c.section = old.section;
        c.breaks = (old.breaks && old.data.barsCount === c.data.barsCount) ? old.breaks : null;
        c.perLine = old.perLine || null;
        c.score = old.score != null ? old.score : null;
        if (old.data.bpm && c.data.bpm) c.data.bpm = old.data.bpm;   // 作者改過的 mp3 速度保留
        paper.items[paper.items.indexOf(old)] = c;
      }
      save(); renderList();
    } else addItem(c);
    closeCard();
  };
  $('cardRegen').onclick = async function () {
    var c = card.cand;
    try {
      var w = await waitFrame(c.type);
      var data = await w.__maker.regen(c.snapshot);   // 聖詠和聲的 regen 回傳 Promise
      var n = buildCandidate(w, c.type, data, c.snapshot, autoTitleOf(w, data, c));
      card.cand = n; drawCardScore(); resetCardAudio();
      $('cardTitle').textContent = (card.replaceId ? '重抽：' : '預覽：') + n.title;   // v112.8：重抽後標題跟著換
    } catch (e) { $('cardMsg').textContent = '重抽失敗：' + e.message; $('cardMsg').className = 'msg err'; }
  };
  $('cardPlay').onclick = async function () {
    var c = card.cand;
    $('cardMsg').textContent = '產生聲音中…';
    try {
      var w = await waitFrame(c.type);
      var buf = await w.PianoEngine.renderOffline(w.__maker.events(c.data));
      if (!card || card.cand !== c) return;
      var a = $('cardAudio'); a.src = URL.createObjectURL(wavBlob(buf));
      a.style.display = ''; $('cardPlay').style.display = 'none'; $('cardMsg').textContent = '';
      a.play().catch(function () {});
    } catch (e) { $('cardMsg').textContent = '聲音產生失敗：' + e.message; $('cardMsg').className = 'msg err'; }
  };
  function wavBlob(buf) {
    var ch = Math.min(2, buf.numberOfChannels), n = buf.length, sr = buf.sampleRate;
    var dv = new DataView(new ArrayBuffer(44 + n * ch * 2));
    function s(o, t) { for (var i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); }
    s(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); s(8, 'WAVE'); s(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); s(36, 'data'); dv.setUint32(40, n * ch * 2, true);
    var data = []; for (var c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    var o = 44;
    for (var i = 0; i < n; i++) for (c = 0; c < ch; c++) { var v = Math.max(-1, Math.min(1, data[c][i])); dv.setInt16(o, v < 0 ? v * 32768 : v * 32767, true); o += 2; }
    return new Blob([dv.buffer], { type: 'audio/wav' });
  }

  /* ---------- 確認框、處理中 ---------- */
  function ask(text, ok) {
    $('confirmText').textContent = text; $('confirmMask').classList.add('on');
    $('confirmOk').onclick = function () { $('confirmMask').classList.remove('on'); ok(); };
    $('confirmNo').onclick = function () { $('confirmMask').classList.remove('on'); };
  }
  function busy(msg) { if (msg == null) { $('busyMask').classList.remove('on'); return; } $('busyMsg').textContent = msg; $('busyMask').classList.add('on'); }
  var flashTimer = null;
  function flash(t) {
    var el = $('flash');
    if (!el) { el = document.createElement('div'); el.id = 'flash'; el.style.cssText = 'position:fixed;left:50%;bottom:' + (document.body.classList.contains('m') ? 84 : 26) + 'px;transform:translateX(-50%);background:#262420;color:#fff;padding:9px 16px;border-radius:20px;font-size:13.5px;z-index:60;'; document.body.appendChild(el); }
    el.textContent = t; el.style.display = '';
    clearTimeout(flashTimer); flashTimer = setTimeout(function () { el.style.display = 'none'; }, 1600);
  }

  /* ---------- 題目列表 ---------- */
  var autoBreakIds = {};
  function grp(label, el, after, rowName) {
    var g = document.createElement('label'); g.className = 'it-grp'; g.dataset.row = rowName;
    g.appendChild(document.createTextNode(label)); g.appendChild(el); if (after) g.appendChild(document.createTextNode(after));
    return g;
  }
  /* v110.2：重畫列表時記住捲動位置（清空的那一瞬間高度歸零，瀏覽器會把捲動拉回頂端） */
  function renderList() {
    var keep = [], e = $('list');
    while (e) { if (e.scrollHeight > e.clientHeight && e.scrollTop) keep.push([e, e.scrollTop]); e = e.parentElement; }
    var wy = window.scrollY || 0, minH = $('list').offsetHeight;
    $('list').style.minHeight = minH + 'px';   // 先撐住高度，重畫時不塌陷
    try { renderListRaw(); } finally {
      $('list').style.minHeight = '';
      keep.forEach(function (p) { p[0].scrollTop = p[1]; });
      if (wy && (window.scrollY || 0) !== wy) window.scrollTo(0, wy);
    }
  }
  function renderListRaw() {
    var box = $('list'); box.innerHTML = '';
    var groups = ordered();
    var tot = paperTotal(); $('totalScore').textContent = tot == null ? '' : '總分：' + fmtScore(tot) + ' 分';
    $('mNavList').textContent = '列表' + (paper.items.length ? '（' + paper.items.length + '）' : '');
    if (!groups.length) {
      box.innerHTML = '<div class="empty">' + (window.matchMedia('(max-width: 899px)').matches ? '在「出題」頁選擇題型' : '左邊選擇題型') + '、設定好之後按「➕ 出題」，題目就會依類型自動放進大題。<br>大題名稱、小題標題都可以直接點來修改；拖曳 ≡ 可以在同一個大題裡調整順序。</div>';
      return;
    }
    var starts = pageStarts();
    $('btnPbReset').style.display = paper.items.some(function (x) { return x.pageBreak; }) ? '' : 'none';
    groups.forEach(function (g, gi) {
      if (gi) box.appendChild(pageGap(g.items[0].it, starts));
      var sec = document.createElement('div'); sec.className = 'sec';
      var hn = document.createElement('div'); hn.className = 'sec-name';
      hn.innerHTML = '<span>' + CN[gi] + '、</span>';
      var inp = document.createElement('input'); inp.value = secName(g.sec);
      inp.onchange = function () { paper.sectionNames[g.sec] = inp.value.trim() || SECTIONS.filter(function (s) { return s.id === g.sec; })[0].name; save(); renderList(); };
      hn.appendChild(inp);
      var sc = document.createElement('label'); sc.className = 'sc-in'; sc.title = '大題配分（空白＝不印）';
      sc.innerHTML = '<span>配分</span>';
      var si = document.createElement('input'); si.type = 'text'; si.inputMode = 'decimal';
      si.value = paper.sectionScores[g.sec] != null ? fmtScore(paper.sectionScores[g.sec]) : '';
      si.onchange = function () { var v = parseScore(si.value); if (v == null) delete paper.sectionScores[g.sec]; else paper.sectionScores[g.sec] = v; save(); renderList(); };
      sc.appendChild(si); sc.appendChild(document.createTextNode('分')); hn.appendChild(sc);
      sec.appendChild(hn);
      var ss = paper.sectionScores[g.sec], is = itemSum(g.sec);
      if (ss != null && is != null && Math.abs(ss - is) > 1e-9) {
        var wn = document.createElement('div'); wn.className = 'sc-warn';
        wn.textContent = '⚠ 小題配分合計 ' + fmtScore(is) + ' 分，與大題配分 ' + fmtScore(ss) + ' 分不同';
        sec.appendChild(wn);
      }
      g.items.forEach(function (o) {
        var it = o.it, row = document.createElement('div'); row.className = 'it'; row.draggable = false;
        row.dataset.id = it.id; row.dataset.sec = it.section;
        var grip = document.createElement('span'); grip.className = 'grip'; grip.textContent = '≡'; grip.title = '拖曳調整順序';
        var num = document.createElement('span'); num.className = 'it-num'; num.textContent = o.num + '.';
        var ti = document.createElement('input'); ti.value = it.title; ti.title = it.title;   // 太長時滑過去看全文
        ti.onchange = function () { it.title = ti.value.trim() || it.title; ti.value = it.title; save(); };
        var info = document.createElement('span'); info.className = 'it-info';
        info.textContent = it.layout === 'cells' ? (it.data.questions.length + ' 格') : ((it.layout === 'grand' || it.layout === 'chorale') ? (it.answers && it.answers.key ? it.answers.key.replace('：', '') : '') : '');
        var rg = btn('🔄', '重抽', function () { regenItem(it); });
        var del = btn('🗑', '刪除', function () { ask('刪除第 ' + o.num + ' 題「' + it.title + '」？', function () { paper.items.splice(paper.items.indexOf(it), 1); save(); renderList(); }); });
        var extra = [];
        /* 每行小節數（節奏、單旋律）：自動／1～4；點過小節線就是「自訂」 */
        if (it.layout === 'lines' && it.data.barsCount > 1) {
          var pl = document.createElement('select'); pl.className = 'it-sel'; pl.title = '每行小節數';
          pl.innerHTML = '<option value="auto">自動</option>' + [1, 2, 3, 4].map(function (v) { return '<option value="' + v + '">' + v + '</option>'; }).join('') +
                         '<option value="custom" disabled>自訂</option>';
          pl.value = it.breaks ? 'custom' : (it.perLine ? String(it.perLine) : 'auto');
          pl.onchange = function () { it.breaks = null; it.perLine = pl.value === 'auto' ? null : parseInt(pl.value, 10); save(); renderPreview(); };
          extra.push(grp('每行小節數', pl, null, 'r2'));
        }
        /* mp3 速度（節奏、單旋律、四部和聲）：只影響音檔與預覽播放，譜例不變 */
        if (it.data.bpm) {
          var sp = document.createElement('label'); sp.className = 'it-bpm'; sp.title = 'mp3 速度（只影響音檔，譜例不變）';
          var sym = (it.data.meterType === 'compound') ? '♪' : '♩';
          sp.innerHTML = '<span>播放速度 ' + sym + '=</span>'; sp.dataset.row = 'r2';
          var bi = document.createElement('input'); bi.type = 'number'; bi.min = 40; bi.max = 160; bi.step = 1; bi.value = it.data.bpm;
          bi.onchange = function () { var v = Math.max(40, Math.min(160, parseInt(bi.value, 10) || it.data.bpm)); bi.value = v; it.data.bpm = v; save(); };
          sp.appendChild(bi); extra.push(sp);
        }
        /* v109.1：四部和聲的作答卷樣式（已出好的題目也能切換；只改作答卷顯示，和絃、音檔、解答不變；存模板時一起記住） */
        if (it.type === 'fourpart') {
          var hs = document.createElement('span'); hs.className = 'seg it-seg'; hs.title = '作答卷樣式';
          [['0', '聽寫'], ['1', '和聲作業']].forEach(function (o2) {
            var hb = document.createElement('button'); hb.type = 'button'; hb.textContent = o2[1];
            var on = (o2[0] === '1') === !!it.data.hw; if (on) hb.classList.add('on');
            hb.onclick = function () {
              var v = o2[0] === '1'; if (!!it.data.hw === v) return;
              it.data.hw = v; it.snapshot = Object.assign({}, it.snapshot || {}, { hw: v });
              save(); renderList(); renderPreview();
            };
            hs.appendChild(hb);
          });
          hs.dataset.row = 'r3'; extra.push(hs);
        }
        /* v112.6：聖詠和聲的作答卷樣式（聽寫｜和聲作業）；和聲作業再選掛留提示（保留｜留空）。只改作答卷，和絃、音檔、解答不變 */
        if (it.type === 'chorale') {
          var setHw = function (v) {
            if ((it.data.hw || false) === v) return;
            var tBase = String(it.autoTitle || '').replace(/（和聲作業[^）]*）$/, '');
            var suf = v === 'keep' ? '（和聲作業）' : v === 'blank' ? '（和聲作業，含掛留）' : '';
            if (it.autoTitle != null && it.title === it.autoTitle) it.title = tBase + suf;   // 沒改過標題才跟著換
            if (it.autoTitle != null) it.autoTitle = tBase + suf;
            it.data.hw = v; it.snapshot = Object.assign({}, it.snapshot || {}, { hw: v });
            it.chSvg = null;   // 作答卷要重畫
            save(); renderList(); renderPreview();
          };
          var cs = document.createElement('span'); cs.className = 'seg it-seg'; cs.title = '作答卷樣式';
          [[false, '聽寫'], ['keep', '和聲作業']].forEach(function (o2) {
            var cb = document.createElement('button'); cb.type = 'button'; cb.textContent = o2[1];
            if (!!it.data.hw === !!o2[0]) cb.classList.add('on');
            cb.onclick = function () { setHw(o2[0] ? (it.data.hw || 'keep') : false); };
            cs.appendChild(cb);
          });
          cs.dataset.row = 'r3'; extra.push(cs);
          if (it.data.hw) {
            var ss = document.createElement('span'); ss.className = 'seg it-seg'; ss.title = '掛留提示';
            var sl = document.createElement('span'); sl.textContent = '掛留提示'; sl.style.cssText = 'font-size:12px; margin-right:4px; color:#555;'; ss.appendChild(sl);
            [['keep', '保留'], ['blank', '留空']].forEach(function (o2) {
              var sb = document.createElement('button'); sb.type = 'button'; sb.textContent = o2[1];
              if (it.data.hw === o2[0]) sb.classList.add('on');
              sb.onclick = function () { setHw(o2[0]); };
              ss.appendChild(sb);
            });
            ss.dataset.row = 'r3'; extra.push(ss);
          }
        }
        /* v110.1：單旋律、兩聲部、找錯音的音色（每一題自己記；沒有記的舊題目＝鋼琴）。只影響播放與 mp3，譜例不變；存模板時一起記住 */
        /* v111：四部和聲、聖詠和聲的音色（鋼琴／管風琴），做法相同 */
        var TIMBRES = (it.type === 'melody' || it.type === 'twopart' || it.type === 'pitcherr') ? [['piano', '鋼琴'], ['winds', '長笛／低音管']]
                    : (it.type === 'fourpart' || it.type === 'chorale') ? [['piano', '鋼琴'], ['organ', '管風琴']] : null;
        if (TIMBRES) {
          /* v112.6：樂器改成一顆按鈕「樂器：鋼琴 ▾」，點下去用系統內建的列表選（之後新增音色只要加進 TIMBRES）。
             四部和聲、聖詠和聲的樂器放到下一行（前面有作答卷樣式） */
          var curT = function () { return TIMBRES.some(function (o3) { return o3[0] === it.data.timbre; }) ? it.data.timbre : 'piano'; };
          var nameT = function (v) { var f = TIMBRES.filter(function (o3) { return o3[0] === v; })[0]; return f ? f[1] : v; };
          var ts = document.createElement('label'); ts.className = 'it-ins'; ts.title = '樂器（只影響播放與 mp3）';
          var tl = document.createElement('span'); tl.textContent = '樂器：' + nameT(curT()) + ' ▾';
          var tsel = document.createElement('select');
          TIMBRES.forEach(function (o2) { var op = document.createElement('option'); op.value = o2[0]; op.textContent = o2[1]; tsel.appendChild(op); });
          tsel.value = curT();
          tsel.onchange = function () {
            var v = tsel.value; if (v === curT()) return;
            stopPlayer();
            it.data.timbre = v; it.snapshot = Object.assign({}, it.snapshot || {}, { timbre: v });
            save();   // 只換按鈕文字，不重畫列表（不會跳回頂端）
            tl.textContent = '樂器：' + nameT(v) + ' ▾';
          };
          ts.appendChild(tl); ts.appendChild(tsel);
          if (it.type === 'fourpart' || it.type === 'chorale') { var brk = document.createElement('span'); brk.className = 'it-brk'; brk.dataset.row = 'r3'; extra.push(brk); }
          ts.dataset.row = 'r3'; extra.push(ts);
        }
        /* 小題配分：空白＝不印 */
        var isc = document.createElement('label'); isc.className = 'it-sc'; isc.title = '小題配分（空白＝不印）';
        var ii = document.createElement('input'); ii.type = 'text'; ii.inputMode = 'decimal'; ii.value = it.score != null ? fmtScore(it.score) : '';
        ii.onchange = function () { it.score = parseScore(ii.value); save(); renderList(); };
        isc.appendChild(document.createTextNode('配分')); isc.appendChild(ii); isc.appendChild(document.createTextNode('分')); isc.dataset.row = 'r3'; extra.push(isc);
        /* v110.2 卡片排版：第 1 行題號與名稱；設定（手機分兩行：每行小節數＋播放速度／音色或作答卷樣式＋配分；電腦合成一行）；最後一行 🔄 🗑。
           ▲▼ 拿掉（手機用 ≡ 拖曳） */
        var r1 = document.createElement('div'); r1.className = 'it-r1';
        [grip, num, ti, info].forEach(function (x) { r1.appendChild(x); });
        var set = document.createElement('div'); set.className = 'it-set';
        var r2 = document.createElement('div'), r3 = document.createElement('div'); r2.className = 'it-r2'; r3.className = 'it-r3';
        extra.forEach(function (x) { (x.dataset.row === 'r2' ? r2 : r3).appendChild(x); });
        if (r2.children.length) set.appendChild(r2);
        set.appendChild(r3);
        var acts = document.createElement('div'); acts.className = 'it-acts'; acts.appendChild(rg); acts.appendChild(del);
        [r1, set, acts].forEach(function (x) { row.appendChild(x); });
        grip.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse') return; e.preventDefault(); touchDrag(e, row, it, grip); });
        grip.onmousedown = function () { row.draggable = true; };
        row.ondragstart = function (e) { dragId = it.id; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; };
        row.ondragend = function () { row.draggable = false; row.classList.remove('dragging'); clearDrop(); dragId = null; };
        row.ondragover = function (e) {
          var src = byId(dragId); if (!src || src.section !== it.section || src === it) return;
          e.preventDefault(); clearDrop();
          var r = row.getBoundingClientRect(); row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
        };
        row.ondrop = function (e) {
          e.preventDefault(); var src = byId(dragId); if (!src || src === it) return;
          var before = row.classList.contains('drop-before');
          paper.items.splice(paper.items.indexOf(src), 1);
          paper.items.splice(paper.items.indexOf(it) + (before ? 0 : 1), 0, src);
          save(); renderList();
        };
        if (o !== g.items[0]) sec.appendChild(pageGap(it, starts));
        sec.appendChild(row);
      });
      box.appendChild(sec);
    });
  }
  var dragId = null;
  function moveItem(it, dir) {
    var arr = paper.items, same = arr.filter(function (x) { return x.section === it.section; });
    var i = same.indexOf(it), j = i + dir; if (j < 0 || j >= same.length) return;
    var a = arr.indexOf(it), b = arr.indexOf(same[j]); arr[a] = same[j]; arr[b] = it;
    save(); renderList();
  }
  /* 手指拖曳 ≡（HTML 的拖放在手機上不能用）：只能在同一大題內；靠近列表上下緣自動捲動 */
  function touchDrag(e, row, it, grip) {
    var box = document.querySelector('.right'), target = null, before = false;
    try { grip.setPointerCapture(e.pointerId); } catch (x) {}
    row.classList.add('dragging');
    function mv(ev) {
      clearDrop(); target = null;
      var el = document.elementFromPoint(ev.clientX, ev.clientY), r = el && el.closest('.it');
      if (r && r !== row && r.dataset.sec === it.section) {
        var rc = r.getBoundingClientRect(); before = ev.clientY < rc.top + rc.height / 2;
        r.classList.add(before ? 'drop-before' : 'drop-after'); target = r;
      }
      var br = box.getBoundingClientRect();
      if (ev.clientY < br.top + 50) box.scrollTop -= 12; else if (ev.clientY > br.bottom - 50) box.scrollTop += 12;
    }
    function upH() {
      grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', upH); grip.removeEventListener('pointercancel', upH);
      row.classList.remove('dragging'); clearDrop();
      if (target) {
        var t = byId(target.dataset.id);
        paper.items.splice(paper.items.indexOf(it), 1);
        paper.items.splice(paper.items.indexOf(t) + (before ? 0 : 1), 0, it);
        save(); renderList();
      }
    }
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', upH); grip.addEventListener('pointercancel', upH);
  }
  function byId(id) { return paper.items.filter(function (x) { return x.id === id; })[0]; }
  function clearDrop() { document.querySelectorAll('.drop-before,.drop-after').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); }); }
  function btn(t, title, fn) { var b = document.createElement('button'); b.className = 'ib'; b.textContent = t; b.title = title; b.onclick = fn; return b; }
  async function regenItem(it) {
    busy('重抽中…');
    try {
      var w = await waitFrame(it.type);
      var data = await w.__maker.regen(it.snapshot);
      var c = buildCandidate(w, it.type, data, it.snapshot, autoTitleOf(w, data, it));
      busy(null); openCard(c, it.id);
    } catch (e) { busy(null); alert('重抽失敗：' + e.message); }
  }
  $('btnPbReset').onclick = function () {
    paper.items.forEach(function (x) { x.pageBreak = false; }); save(); renderList(); renderPreview(); flash('換頁已全部回到自動');
  };
  $('btnClear').onclick = function () {
    if (!paper.items.length) return;
    ask('清空整份考卷的題目？（標題與設定會保留）', function () { paper.items = []; delete paper.savedId; save(); renderList(); });
  };

  /* ---------- A4 排版與分頁 ---------- */
  /* ---------- v109.3 換頁線（題目列表）----------
     每個換頁的位置（自動、手動）在兩題之間畫一條虛線「第 N 頁」；拖動線＝把換頁移到別的兩題之間（變成手動，存在 it.pageBreak），
     手動的線可以「↺ 復原」回自動；兩題之間的空隙可以「＋ 在這裡換頁」。分頁以作答卷的排版計算。 */
  function pageStarts() {
    var out = {};
    if (!paper.items.length) return out;
    var keep = autoBreakIds; buildPages('blank', false); var auto = autoBreakIds; autoBreakIds = keep;
    var n = 1;
    ordered().forEach(function (g) { g.items.forEach(function (o) {
      if (o.num > 1 && (auto[o.it.id] || o.it.pageBreak)) out[o.it.id] = { page: ++n, manual: !!o.it.pageBreak };
    }); });
    return out;
  }
  function pageGap(it, starts) {
    var gap = document.createElement('div'); gap.className = 'pg-gap'; gap.dataset.id = it.id;
    var st = starts[it.id];
    if (st) {
      var ln = document.createElement('div'); ln.className = 'pg-line' + (st.manual ? ' manual' : '');
      ln.title = '拖動這條線，可以把換頁移到別的兩題之間';
      ln.innerHTML = '<span class="pg-lab">第 ' + st.page + ' 頁' + (st.manual ? '' : '（自動）') + '</span>';
      if (st.manual) {
        var rv = document.createElement('button'); rv.type = 'button'; rv.className = 'pg-rv'; rv.textContent = '↺ 復原'; rv.title = '回到自動換頁';
        rv.onclick = function (e) { e.stopPropagation(); it.pageBreak = false; save(); renderList(); renderPreview(); };
        rv.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        ln.appendChild(rv);
      }
      ln.addEventListener('pointerdown', function (e) { if (e.button) return; e.preventDefault(); dragLine(e, ln, it); });
      gap.appendChild(ln);
    } else {
      var add = document.createElement('button'); add.type = 'button'; add.className = 'pg-add'; add.textContent = '＋ 在這裡換頁';
      add.onclick = function () { it.pageBreak = true; save(); renderList(); renderPreview(); };
      gap.appendChild(add);
    }
    return gap;
  }
  function dragLine(e, ln, it) {
    var ghost = ln.cloneNode(true); ghost.classList.add('pg-ghost');
    var r0 = ln.getBoundingClientRect();
    ghost.style.cssText = 'position:fixed; left:' + r0.left + 'px; width:' + r0.width + 'px; top:' + r0.top + 'px; z-index:90; pointer-events:none;';
    document.body.appendChild(ghost); ln.classList.add('pg-src');
    var dy = e.clientY - r0.top, target = null;
    function nearest(y) {
      var best = null, bd = 1e9;
      document.querySelectorAll('#list .pg-gap').forEach(function (g) { var r = g.getBoundingClientRect(), c = r.top + r.height / 2, dd = Math.abs(c - y); if (dd < bd) { bd = dd; best = g; } });
      return best;
    }
    function move(ev) {
      ghost.style.top = (ev.clientY - dy) + 'px';
      var g = nearest(ev.clientY);
      document.querySelectorAll('#list .pg-gap.drop').forEach(function (x) { x.classList.remove('drop'); });
      if (g) g.classList.add('drop'); target = g;
      /* 拖到列表上下緣時自動捲動 */
      var sc = ln.closest('.right') || document.scrollingElement;
      var rr = sc === document.scrollingElement ? { top: 0, bottom: innerHeight } : sc.getBoundingClientRect();
      if (ev.clientY < rr.top + 40) sc.scrollTop -= 12; else if (ev.clientY > Math.min(rr.bottom, innerHeight) - 40) sc.scrollTop += 12;
    }
    function up() {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      ghost.remove(); ln.classList.remove('pg-src');
      var to = target ? byId(target.dataset.id) : null;
      if (to && to !== it) { it.pageBreak = false; to.pageBreak = true; save(); renderList(); renderPreview(); }
      else renderList();
    }
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  }
  function buildPages(mode, interactive) {
    var d = Engrave.DENSITY[paper.density] || Engrave.DENSITY.dense;
    var MM = Engrave.MM, cw = Engrave.contentPx(d);
    var innerH = (297 - d.mTop - d.mBot) * MM;
    /* 先在畫面外把每個區塊排出來量高度 */
    var meas = document.createElement('div');
    meas.style.cssText = 'position:absolute; left:-10000px; top:0; width:' + cw + 'px; font-family:var(--paper-font);';
    document.body.appendChild(meas);
    var blocks = [];
    var head = document.createElement('div'); head.className = 'head';
    head.style.fontSize = d.head + 'px';
    head.innerHTML = '<span class="ht"></span><span class="au"></span>';
    head.querySelector('.ht').textContent = (paper.header.title || '') + ' ' + (mode === 'key' ? '解答' : '作答卷');
    head.querySelector('.au').textContent = paper.header.author || '';
    head.style.marginBottom = '22px';
    blocks.push({ el: head });
    ordered().forEach(function (g, gi) {
      var st = document.createElement('div'); st.className = 'sec-title';
      st.style.fontSize = d.sec + 'px'; st.textContent = CN[gi] + '、' + secName(g.sec) + scoreText(paper.sectionScores[g.sec]);
      st.style.marginTop = (gi ? d.secGap : 0) + 'px'; st.style.marginBottom = '2px';
      blocks.push({ el: st, keepNext: true, sec: true });
      var playable = interactive && mode === 'key';   // 預覽解答：每題標題後面有播放鈕（列印不會出現）
      if (g.sec === 'pitchstack') {
        /* 音堆：一律大譜表接成一行三格，每格一題、只印題號；⤓ 的題目從新的一行（新的一頁）開始 */
        var rows = [];
        g.items.forEach(function (o) {
          var last = rows[rows.length - 1];
          if (!last || last.length >= Engrave.STACK_PER_ROW || o.it.pageBreak) rows.push([o]); else last.push(o);
        });
        rows.forEach(function (row, ri) {
          var rel = Engrave.renderStackRow(row.map(function (o) { return o.it; }), row.map(function (o) { return o.num; }), mode, d);
          if (playable) row.forEach(function (o, i) { addPlayControls(rel.__numEls[i], o.it); });
          rel.style.marginTop = (ri ? d.itemGap : 2) + 'px';
          blocks.push({ el: rel, item: row[0].it, firstInSec: ri === 0 });
        });
        return;
      }
      g.items.forEach(function (o, ii) {
        var it = o.it;
        var el = Engrave.renderItem(it, mode, d, { item: o.num, cell: 1 }, interactive ? {
          interactive: true,
          onBreak: function (bar) { toggleBreak(it, bar); }
        } : null);
        if (playable) addPlayControls(el.querySelector('.item-title'), it);
        el.style.marginTop = (ii ? d.itemGap : 2) + 'px';
        blocks.push({ el: el, item: it, firstInSec: ii === 0 });
      });
    });
    blocks.forEach(function (b) { meas.appendChild(b.el); });
    blocks.forEach(function (b) { var cs = getComputedStyle(b.el); b.h = b.el.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom); b.mt = parseFloat(cs.marginTop); });
    /* 分頁：同一題不跨頁；大題標題跟著第一題走；⤓ 強制換頁 */
    var pages = [[]], used = 0;
    autoBreakIds = {};
    blocks.forEach(function (b, i) {
      var cur = pages[pages.length - 1];
      var forced = b.item && b.item.pageBreak && !b.firstInSec;
      var forcedSec = b.sec && blocks[i + 1] && blocks[i + 1].item && blocks[i + 1].item.pageBreak;
      var need = b.h + (b.keepNext && blocks[i + 1] ? blocks[i + 1].h : 0);
      var top = !cur.length ? b.mt : 0;   // 頁首的上邊距不算
      if (cur.length && (forced || forcedSec || used + need - top > innerH)) {
        if (!forced && !forcedSec) { var it = b.item || (blocks[i + 1] && blocks[i + 1].item); if (it) autoBreakIds[it.id] = true; }
        pages.push([]); cur = pages[pages.length - 1]; used = 0;
      }
      if (!cur.length) b.el.style.marginTop = '0px';
      cur.push(b); used += (cur.length === 1 ? b.h - b.mt : b.h);
    });
    meas.remove();
    return pages.map(function (pg, pi) {
      var page = document.createElement('div'); page.className = 'page';
      var inn = document.createElement('div'); inn.className = 'page-in';
      inn.style.left = d.mSide + 'mm'; inn.style.top = d.mTop + 'mm'; inn.style.width = cw + 'px';
      pg.forEach(function (b) {
        inn.appendChild(b.el);
        if (interactive && b.item && autoBreakIds[b.item.id] && pi > 0 && pg[0] === b) {
          var n = document.createElement('div'); n.className = 'auto-break'; n.textContent = '上一頁放不下，自動換頁';
          b.el.style.position = 'relative'; b.el.appendChild(n);
        }
      });
      page.appendChild(inn);
      return page;
    });
  }
  /* ---------- 預覽解答的播放鈕＋速度拉桿（只在螢幕上）---------- */
  var player = { audio: null, id: null, btn: null };
  function stopPlayer() {
    if (player.audio) { player.audio.pause(); URL.revokeObjectURL(player.audio.src); }
    if (player.btn) player.btn.textContent = '▶';
    player.audio = null; player.id = null; player.btn = null;
  }
  function addPlayControls(titleEl, it) {
    if (!titleEl) return;
    var wrap = document.createElement('span'); wrap.className = 'pv-ctl';
    var b = document.createElement('button'); b.className = 'pv-play'; b.textContent = (player.id === it.id) ? '■' : '▶'; b.title = '播放這一題（與 mp3 相同）';
    if (player.id === it.id) player.btn = b;
    b.onclick = async function () {
      if (player.id === it.id) { stopPlayer(); return; }
      stopPlayer();
      player.id = it.id; player.btn = b; b.textContent = '⏳';
      try {
        var w = await waitFrame(it.type);
        var buf = await w.PianoEngine.renderOffline(w.__maker.events(it.data));
        if (player.id !== it.id) return;   // 等待中按了別題
        var a = new Audio(URL.createObjectURL(wavBlob(buf)));
        player.audio = a; b.textContent = '■';
        a.onended = function () { if (player.audio === a) stopPlayer(); };
        a.play().catch(function () { stopPlayer(); });
      } catch (e) { stopPlayer(); flash('播放失敗：' + e.message); }
    };
    wrap.appendChild(b);
    if (it.data.bpm) {
      /* 速度拉桿：與列表的速度欄、匯出的 mp3 連動 */
      var sym = (it.data.meterType === 'compound') ? '♪' : '♩';
      var lab = document.createElement('span'); lab.className = 'pv-bpm'; lab.textContent = sym + '=' + it.data.bpm;
      var r = document.createElement('input'); r.type = 'range'; r.min = 40; r.max = 160; r.step = 1; r.value = it.data.bpm; r.className = 'pv-range';
      r.oninput = function () { lab.textContent = sym + '=' + r.value; };
      r.onchange = function () { it.data.bpm = parseInt(r.value, 10); save(); if (player.id === it.id) stopPlayer(); };
      wrap.appendChild(r); wrap.appendChild(lab);
    }
    titleEl.appendChild(wrap);
  }

  function toggleBreak(it, bar) {
    var n = it.data.barsCount;
    var br = (it.breaks || it.shownBreaks || Engrave.defaultBreaks(n, 4)).slice();
    var i = br.indexOf(bar);
    if (i >= 0) br.splice(i, 1); else br.push(bar);
    it.breaks = br.sort(function (a, b) { return a - b; });
    save(); renderPreview();
  }

  var view = 'edit';
  function setView(v) {
    stopPlayer();
    view = v;
    document.body.classList.toggle('pvon', v !== 'edit');
    document.querySelectorAll('#viewSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); });
    $('mainView').classList.toggle('off', v !== 'edit');
    $('pvView').classList.toggle('on', v !== 'edit');
    if (v !== 'edit') { pvMode = v; document.querySelectorAll('#mPvSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); }); }
    if (v === 'edit') renderList(); else renderPreview();
  }
  function renderPreview() {
    if (view === 'edit') return;
    var box = $('pvPages'), y = $('pvView').scrollTop;
    box.innerHTML = '';
    if (!paper.items.length) { box.innerHTML = '<div class="empty">還沒有題目。</div>'; return; }
    buildPages(view, true).forEach(function (p) { box.appendChild(p); });
    applyPvZoom();
    $('pvView').scrollTop = y;
  }
  document.querySelectorAll('#viewSeg button').forEach(function (b) { b.onclick = function () { setView(b.dataset.v); }; });

  /* ---------- 列印成 PDF ---------- */
  async function doPrint(mode) {
    if (!paper.items.length) { flash('還沒有題目'); return; }
    try { await prepChorale(); } catch (e) { flash('聖詠和聲譜例載入失敗：' + e.message); return; }
    var area = $('printArea'); area.innerHTML = '';
    buildPages(mode, false).forEach(function (p) { area.appendChild(p); });
    var old = document.title;
    document.title = (mode === 'key' ? '聽寫課堂練習解答_' : '聽寫課堂練習作答卷_') + (paper.header.date || today());
    var restore = function () { document.title = old; area.innerHTML = ''; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    setTimeout(function () { window.print(); }, 50);
  }
  /* 第一次列印時提醒 Chrome 的設定（之後不再出現） */
  var TIP = 'earTrainer.maker.printTip';
  function printWithTip(mode) {
    var seen = false; try { seen = localStorage.getItem(TIP) === '1'; } catch (e) {}
    if (seen) { doPrint(mode); return; }
    ask('列印視窗請這樣設定：目的地選「另存為 PDF」、邊界選「無」、取消勾選「頁首和頁尾」。檔名會自動帶入。（這個提醒只出現一次）', function () {
      try { localStorage.setItem(TIP, '1'); } catch (e) {}
      doPrint(mode);
    });
  }
  $('btnPrintBlank').onclick = function () { printWithTip('blank'); };
  $('btnPrintKey').onclick = function () { printWithTip('key'); };

  /* ---------- mp3 打包 ---------- */
  function safeName(s) { return String(s).trim().replace(/\s+/g, '_').replace(/[\/\\:*?"<>|]/g, ''); }
  $('btnMp3').onclick = async function () {
    if (!paper.items.length) { flash('還沒有題目'); return; }
    var list = []; ordered().forEach(function (g) { g.items.forEach(function (o) { list.push({ it: o.it, num: o.num, sec: secName(g.sec) }); }); });
    var files = [], zipWin = null;
    try {
      for (var i = 0; i < list.length; i++) {
        var o = list[i], label = '第 ' + (i + 1) + '／' + list.length + ' 題';
        busy(label + '：產生聲音…');
        var w = await waitFrame(o.it.type); zipWin = w;   // v108：用最後一個（前面的練習頁可能已被關掉）
        var buf = await w.PianoEngine.renderOffline(w.__maker.events(o.it.data));
        var blob = await w.AudioExport.encodeMp3(buf, function (p) { busy(label + '：編碼中 ' + Math.round(p * 100) + '%'); });
        files.push({ name: o.num + '_' + safeName(o.sec) + '_' + safeName(o.it.title) + '.mp3', u8: new Uint8Array(await blob.arrayBuffer()) });
      }
      busy('打包中…');
      var zip = zipWin.ExportMenu.makeZip(files, new Date());
      files = null;
      busy(null);
      deliver(zip, '聽寫課堂練習音檔_' + (paper.header.date || today()) + '.zip', 'zip', list.length + ' 個 mp3');
    } catch (e) { busy(null); alert('mp3 產生失敗：' + e.message); }
  };

  /* ---------- 譜例影片打包（v111）----------
     每一題一支 mp4：解答譜例（與 PDF 解答同一套畫法）＋與 mp3 相同的聲音；直式或橫式自動判斷。
     製作影片的程式在 ../tutti-1101/video-export.js（贊助者版共用），第一次用到才載入。 */
  function ensureVideoExport() {
    if (window.VideoExport) return Promise.resolve();
    window.VIDEO_EXPORT_BASE = '../tutti-1101/';
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = '../tutti-1101/video-export.js';
      s.onload = function () { res(); }; s.onerror = function () { rej(new Error('影片模組載入失敗')); };
      document.head.appendChild(s);
    });
  }
  /* v.112.3：一格一題的大題（音程、和絃）——游標停在正在播的那一格。
     格子中心用考卷畫譜時記下的位置（sys.__meta.cells），換算成影片用的「單位」（VexFlow 單位，圖片像素＝單位 × us） */
  function cellsFollow(box, el, cv, d, ev) {
    var sysEls = Array.prototype.filter.call(el.querySelectorAll('.sys'), function (s) { return s.__meta && s.__meta.cells && s.__meta.cells.length; });
    var cr = cv.__crop; if (!cr || !sysEls.length) return null;
    var k = d.k, us = k * cr.sc, base = box.getBoundingClientRect(), score = [];
    sysEls.forEach(function (sys) {
      var svg = sys.querySelector('svg'); if (!svg) return;
      var r = svg.getBoundingClientRect();
      var offX = ((r.left - base.left) * cr.sc - cr.x0) / us, offY = ((r.top - base.top) * cr.sc - cr.y0) / us;
      var hU = r.height / k, cells = sys.__meta.cells;
      cells.forEach(function (c) {
        score.push({ headX: offX + c.centre, x0: offX + cells[0].x0, x1: offX + cells[cells.length - 1].x1, y0: offY, y1: offY + hU });
      });
    });
    if (score.length < 2) return null;
    var f = VideoExport.followFromScore(score, ev);
    return f ? { follow: f, us: us } : null;
  }
  async function itemCanvas(o, ev) {
    var d = Engrave.DENSITY[paper.density] || Engrave.DENSITY.dense, cw = Engrave.contentPx(d);
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed; left:-30000px; top:0; box-sizing:content-box; width:' + cw + 'px; padding:40px; background:#fff; color:#000; font-family:var(--paper-font); pointer-events:none;';
    var el = o.it.type === 'pitchstack'
      ? Engrave.renderStackRow([o.it], [o.num], 'key', d)
      : Engrave.renderItem(o.it, 'key', d, { item: o.num, cell: 1 }, null);
    el.style.marginTop = '0px';
    box.appendChild(el); document.body.appendChild(box);
    try {
      await new Promise(function (r) { setTimeout(r, 60); });
      var cv = await MakerPdf.elementCanvas(box, 3);
      if (ev && o.it.layout === 'cells') {
        var cf = null; try { cf = cellsFollow(box, el, cv, d, ev); } catch (e) { cf = null; }
        if (cf) { cv.__follow = cf.follow; cv.__us = cf.us; }
      }
      return cv;
    }
    finally { box.remove(); }
  }
  /* v.112.3：節奏、單旋律、兩聲部、找錯音、四部和聲、聖詠和聲——請練習頁照「下載譜例」的畫法畫正解譜，游標逐拍跟隨 */
  var SHEET_TYPES = { rhythm: 1, melody: 1, twopart: 1, fourpart: 1, pitcherr: 1, chorale: 1 };
  $('btnVideo').onclick = async function () {
    if (!paper.items.length) { flash('還沒有題目'); return; }
    stopPlayer();
    var list = []; ordered().forEach(function (g) { g.items.forEach(function (o) { list.push({ it: o.it, num: o.num, sec: secName(g.sec) }); }); });
    var files = [], zipWin = null;
    try {
      busy('譜例影片：準備中…');
      await ensureVideoExport();
      if (!(await VideoExport.supported())) { busy(null); alert(VideoExport.NO_SUPPORT); return; }
      await prepChorale();
      for (var i = 0; i < list.length; i++) {
        var o = list[i], label = '第 ' + (i + 1) + '／' + list.length + ' 題';
        busy(label + '：產生聲音…');
        var w = await waitFrame(o.it.type); zipWin = w;
        var ev = w.__maker.events(o.it.data);
        var buf = await w.PianoEngine.renderOffline(ev);
        busy(label + '：畫譜例…');
        var cv = null, follow = null, us = 1, title = null;
        if (SHEET_TYPES[o.it.type] && w.__maker.sheet) {
          try { cv = await w.__maker.sheet(o.it.data); } catch (e) { cv = null; }
          if (cv) {
            follow = cv.__follow || VideoExport.followFromScore(cv.__score, ev);
            us = (cv.__layout && cv.__layout.scale) || 1;
            title = o.num + '. ' + o.it.title + (window.__makerScoreText ? window.__makerScoreText(o.it.score) : '');
          }
        }
        if (!cv) { cv = await itemCanvas(o, ev); follow = cv.__follow || null; us = cv.__us || 1; }
        var blob = await VideoExport.make(cv, buf, { orient: 'auto', follow: follow, unitScale: us, title: title,
          onProgress: function (p) { busy(label + '：製作影片 ' + Math.round(p * 100) + '%'); } });
        cv.width = 0; cv.height = 0;
        files.push({ name: o.num + '_' + safeName(o.sec) + '_' + safeName(o.it.title) + '.mp4', u8: new Uint8Array(await blob.arrayBuffer()) });
      }
      busy('打包中…');
      var zip = zipWin.ExportMenu.makeZip(files, new Date());
      files = null;
      busy(null);
      deliver(zip, '聽寫課堂練習影片_' + (paper.header.date || today()) + '.zip', 'video', list.length + ' 支影片');
    } catch (e) { busy(null); alert('譜例影片產生失敗：' + (e && e.message || e)); }
  };

  /* ---------- 模板（v106.8）----------
     內建：大學檔、高中檔，直接讀 App 的 exam-common.js（EXAM.PRESETS），每次套用重新隨機（拍號、譜號…）；
     自訂：存每一題的設定快照、標題、配分、換行、換頁、速度，以及大題名稱與配分；套用時重新出題。 */
  var TPL_STORE = 'earTrainer.maker.templates';
  var BUILTIN = [{ id: 'standard', name: '考大學檔' }, { id: 'highschool', name: '考高中檔' }];
  var EXAM_TYPE = { pitcherr1: 'pitcherr', pitcherr2: 'pitcherr', interval: 'interval', chord: 'chord',
                    rhythm1: 'rhythm', rhythm2: 'rhythm', rhythm3: 'rhythm', melody1: 'melody', melody2: 'melody',
                    twopart: 'twopart', fourpart: 'fourpart' };
  function loadTpls() { try { return JSON.parse(localStorage.getItem(TPL_STORE) || '[]'); } catch (e) { return []; } }
  function saveTpls(a) { try { localStorage.setItem(TPL_STORE, JSON.stringify(a)); return true; } catch (e) { alert('模板儲存失敗：' + e.message); return false; } }

  function renderTplMenu() {
    var m = $('tplMenu'); m.innerHTML = '';
    function row(label, tag, onPick, onDel) {
      var r = document.createElement('div'); r.className = 'tpl-row';
      var b = document.createElement('button'); b.className = 'tpl-pick';
      if (tag) { var t = document.createElement('span'); t.className = 'tpl-tag'; t.textContent = tag; b.appendChild(t); }
      b.appendChild(document.createTextNode(label)); b.onclick = function () { closeTplMenu(); onPick(); };
      r.appendChild(b);
      if (onDel) { var d = document.createElement('button'); d.className = 'tpl-del'; d.textContent = '🗑'; d.title = '刪除這個模板'; d.onclick = function (e) { e.stopPropagation(); closeTplMenu(); onDel(); }; r.appendChild(d); }
      m.appendChild(r);
    }
    BUILTIN.forEach(function (b) { row(b.name, '內建', function () { confirmApply(b.name, function () { applyBuiltin(b.id); }); }); });
    var list = loadTpls();
    if (list.length) {
      m.appendChild(Object.assign(document.createElement('div'), { className: 'tpl-sep' }));
      list.forEach(function (t) {
        row(t.name, '', function () { confirmApply(t.name, function () { applyCustom(t); }); },
            function () { ask('刪除模板「' + t.name + '」？', function () { saveTpls(loadTpls().filter(function (x) { return x.name !== t.name; })); flash('已刪除模板'); }); });
      });
    }
    m.appendChild(Object.assign(document.createElement('div'), { className: 'tpl-sep' }));
    row('＋ 把目前考卷存成新模板', '', openSaveTpl);
  }
  function closeTplMenu() { $('tplMenu').classList.remove('on'); $('exMenu').classList.remove('on'); $('mExMenu').classList.remove('on'); }
  $('btnTpl').onclick = function (e) {
    e.stopPropagation();
    if ($('tplMenu').classList.contains('on')) { closeTplMenu(); return; }
    closeTplMenu(); renderTplMenu(); $('tplMenu').classList.add('on');
  };
  /* v108：電腦版「📤 匯出 ▾」（PDF、列印、mp3） */
  $('btnExport').onclick = function (e) {
    e.stopPropagation();
    var on = $('exMenu').classList.contains('on'); closeTplMenu(); if (!on) $('exMenu').classList.add('on');
  };
  $('exMenu').addEventListener('click', function (e) { if (e.target.closest('button')) closeTplMenu(); });
  document.addEventListener('click', function (e) { if (!e.target.closest('.tpl-wrap')) closeTplMenu(); });

  function confirmApply(name, fn) {
    if (!paper.items.length) { fn(); return; }
    ask('套用「' + name + '」會清空目前考卷的 ' + paper.items.length + ' 題，確定嗎？', fn);
  }
  /* 依序出題；全部成功才換掉目前的考卷（中途失敗不會動到原本的題目） */
  async function runTemplate(name, jobs, secNames, secScores) {
    stopPlayer();
    var out = [];
    try {
      for (var i = 0; i < jobs.length; i++) {
        busy('套用「' + name + '」：出題中 ' + (i + 1) + '／' + jobs.length);
        out.push(await jobs[i]());
      }
    } catch (e) { busy(null); alert('套用模板失敗：' + e.message + '\n原本的考卷沒有變動。'); return; }
    paper.items = out; paper.sectionNames = secNames; paper.sectionScores = secScores;
    delete paper.savedId;   // v110：套用模板＝新的考卷，不再對應「我的考卷」裡的那一張
    save(); busy(null); setView('edit'); flash('✓ 已套用「' + name + '」，共 ' + out.length + ' 題');
  }
  /* 找錯音偶爾會出題失敗（頁面本來就會重抽），這裡最多試 8 次 */
  async function regenTry(w, snap) {
    var err;
    for (var k = 0; k < 8; k++) { try { return await w.__maker.regen(snap); } catch (e) { err = e; } }
    throw err;
  }
  async function applyBuiltin(id) {
    busy('準備模板…');
    var w0;
    try { w0 = await waitFrame('interval'); } catch (e) { busy(null); alert(e.message); return; }
    var P = w0.EXAM && w0.EXAM.PRESETS && w0.EXAM.PRESETS[id];
    if (!P) { busy(null); alert('讀不到 App 的模擬考設定'); return; }
    var cfg = P.buildConfig();
    var jobs = P.queue.map(function (key) {
      return async function () {
        var type = EXAM_TYPE[key];
        if (!type) throw new Error('不認得的段落：' + key);
        var w = await waitFrame(type);
        var fe = w.__maker.fromExam(cfg[key] || {});
        var data = await regenTry(w, fe.snapshot);
        var title = fe.title || w.__maker.titleOf(data);
        return buildCandidate(w, type, data, fe.snapshot, title);
      };
    });
    var name = BUILTIN.filter(function (b) { return b.id === id; })[0].name;
    runTemplate(name, jobs, {}, {});
  }
  async function applyCustom(t) {
    var jobs = t.items.map(function (s) {
      return async function () {
        var w = await waitFrame(s.type);
        var data = await regenTry(w, s.snapshot);
        if (s.bpm && data.bpm) data.bpm = s.bpm;
        var auto = (w.__maker.titleOf ? w.__maker.titleOf(data) : null) || s.autoTitle || '';
        var c = buildCandidate(w, s.type, data, s.snapshot, s.title || auto);
        c.section = s.section || c.section;
        c.pageBreak = !!s.pageBreak; c.breaks = s.breaks || null; c.perLine = s.perLine || null;
        c.score = s.score != null ? s.score : null;
        return c;
      };
    });
    runTemplate(t.name, jobs, JSON.parse(JSON.stringify(t.sectionNames || {})), JSON.parse(JSON.stringify(t.sectionScores || {})));
  }

  function openSaveTpl() {
    if (!paper.items.length) { flash('還沒有題目'); return; }
    $('nameInput').value = ''; $('nameMask').classList.add('on');
    setTimeout(function () { $('nameInput').focus(); }, 30);
  }
  $('nameNo').onclick = function () { $('nameMask').classList.remove('on'); };
  $('nameInput').onkeydown = function (e) { if (e.key === 'Enter') $('nameOk').click(); };
  $('nameOk').onclick = function () {
    var name = $('nameInput').value.trim();
    if (!name) { $('nameInput').focus(); return; }
    if (BUILTIN.some(function (b) { return b.name === name; })) { alert('「' + name + '」是內建模板的名稱，請換一個名稱'); return; }
    $('nameMask').classList.remove('on');
    /* 依目前列表的順序存（大題順序固定，大題內照列表） */
    var items = [];
    ordered().forEach(function (g) { g.items.forEach(function (o) {
      var it = o.it;
      /* 標題沒改過（＝自動標題）就不存死：四部和聲的調、找錯音的拍號等，重新出題後要跟著新題目 */
      var edited = it.autoTitle != null && it.title !== it.autoTitle;
      items.push({ type: it.type, section: it.section, snapshot: it.snapshot, title: edited ? it.title : null, autoTitle: it.autoTitle || it.title, pageBreak: !!it.pageBreak,
                   breaks: it.breaks || null, perLine: it.perLine || null, bpm: it.data.bpm || null, score: it.score != null ? it.score : null });
    }); });
    var tpl = { name: name, savedAt: Date.now(), items: items,
                sectionNames: JSON.parse(JSON.stringify(paper.sectionNames)), sectionScores: JSON.parse(JSON.stringify(paper.sectionScores)) };
    var list = loadTpls(), idx = -1;
    list.forEach(function (x, i) { if (x.name === name) idx = i; });
    function doSave() {
      if (idx >= 0) list[idx] = tpl; else list.push(tpl);
      if (saveTpls(list)) flash('✓ 已存成模板「' + name + '」（' + items.length + ' 題）');
    }
    if (idx >= 0) ask('已經有「' + name + '」這個模板，要覆蓋嗎？', doSave); else doSave();
  };

  /* ---------- 交付檔案（v108）----------
     電腦、Android：直接下載。iPhone／iPad：要由使用者按一下才能下載或分享（非同步做完之後瀏覽器不讓程式自己開），
     PDF 走下載（會開系統的 PDF 預覽，右上角分享才有 LINE；伍線譜掃描實測 navigator.share 分享 PDF 時 LINE 不會出現），
     壓縮檔走分享面板（可「儲存到檔案」）。 */
  function download(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 300000);
  }
  function deliver(blob, name, kind, desc) {
    if (!IS_IOS) { download(blob, name); flash('✓ 已下載 ' + (desc || name)); return; }
    $('dlTitle').textContent = kind === 'pdf' ? 'PDF 已完成' : (kind === 'json' ? '考卷檔已完成' : (kind === 'video' ? '影片壓縮檔已完成' : 'mp3 壓縮檔已完成'));
    $('dlText').textContent = name + '（' + (blob.size / 1048576).toFixed(1) + ' MB）。' +
      (kind === 'pdf' ? '按「開啟」會打開 PDF，從右上角的分享鈕可以存到「檔案」或傳 LINE。' : '按「分享／儲存」後選「儲存到檔案」，或傳給 LINE 等 App。');
    $('dlBtn').textContent = kind === 'pdf' ? '開啟' : '分享／儲存';
    $('dlMask').classList.add('on');
    $('dlBtn').onclick = async function () {
      if (kind !== 'pdf') {
        var file = new File([blob], name, { type: blob.type || 'application/zip' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file] }); $('dlMask').classList.remove('on'); }
          catch (e) { if (e && e.name !== 'AbortError') download(blob, name); }
          return;
        }
      }
      download(blob, name); $('dlMask').classList.remove('on');
    };
    $('dlNo').onclick = function () { $('dlMask').classList.remove('on'); };
  }

  /* ---------- 匯出 PDF（v108，600dpi 圖片 PDF；細節見 pdf-export.js）---------- */
  async function exportPdf(mode) {
    if (!paper.items.length) { flash('還沒有題目'); return; }
    stopPlayer();
    busy('匯出 PDF：準備中…');
    try { await prepChorale(); } catch (e) { busy(null); alert('聖詠和聲譜例載入失敗：' + e.message); return; }
    var area = document.createElement('div');
    area.style.cssText = 'position:fixed; left:-30000px; top:0; pointer-events:none;';
    document.body.appendChild(area);
    var name = (mode === 'key' ? '聽寫課堂練習解答_' : '聽寫課堂練習作答卷_') + (paper.header.date || today());
    try {
      var pages = buildPages(mode, false);
      pages.forEach(function (p) { area.appendChild(p); });
      await new Promise(function (r) { setTimeout(r, 60); });
      var blob = await MakerPdf.exportPages(pages, { dpi: 600, gray: mode !== 'key', title: name,
        onProgress: function (p, n, s, S) { busy('匯出 PDF：第 ' + (p + 1) + '／' + n + ' 頁　' + Math.round(s / S * 100) + '%'); } });
      area.remove(); busy(null);
      deliver(blob, name + '.pdf', 'pdf');
    } catch (e) { area.remove(); busy(null); alert('PDF 匯出失敗：' + (e && e.message || e) + (IS_IOS ? '\n（可能是記憶體不足：請關掉其他 App 後再試一次）' : '')); }
  }
  $('btnPdfBlank').onclick = function () { exportPdf('blank'); };
  $('btnPdfKey').onclick = function () { exportPdf('key'); };
  /* v108.5：手機預覽頁「📤 匯出 ▾」：和設定頁一樣的三個選項 */
  $('btnExportM').onclick = function (e) {
    e.stopPropagation();
    var on = $('mExMenu').classList.contains('on'); closeTplMenu(); if (!on) $('mExMenu').classList.add('on');
  };
  $('mExMenu').addEventListener('click', function (e) { if (e.target.closest('button')) closeTplMenu(); });
  $('mxPdfBlank').onclick = function () { exportPdf('blank'); };
  $('mxPdfKey').onclick = function () { exportPdf('key'); };
  $('mxMp3').onclick = function () { $('btnMp3').click(); };
  $('mxVideo').onclick = function () { $('btnVideo').click(); };

  /* ---------- 手機版（v108，寬度小於 900px）---------- */
  var mq = window.matchMedia('(max-width: 899px)'), mtab = 'make', pvMode = 'blank', pvZoom = 1;
  function isM() { return mq.matches; }
  /* 考卷設定卡片：電腦版在右邊列表最上面，手機版在「設定與匯出」頁 */
  function applyMode() {
    var m = isM();
    document.body.classList.toggle('m', m);
    closeTplMenu();
    if (m) { $('setSlotM').appendChild($('setCard')); setMTab(mtab === 'set' ? 'make' : mtab); }
    else {
      $('setSlotD').appendChild($('setCard'));
      delete document.body.dataset.mtab;
      $('pvPages').style.zoom = '';
      if (view !== 'edit') renderPreview();
      applySplit();
    }
  }
  var lastTab = 'make';
  function setMTab(t) {
    if (t !== 'set') lastTab = t;
    mtab = t; document.body.dataset.mtab = t;
    document.querySelectorAll('#mNav button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); });
    if (t === 'set') return;
    if (t === 'pv') setView(pvMode); else if (view !== 'edit') setView('edit');
  }
  document.querySelectorAll('#mNav button').forEach(function (b) { b.onclick = function () { setMTab(b.dataset.t); }; });
  document.querySelectorAll('#mPvSeg button').forEach(function (b) { b.onclick = function () { setView(b.dataset.v); }; });
  /* 手機「⋯」：整頁的「設定與匯出」（← 返回回到原本的分頁） */
  $('btnMore').onclick = function (e) { e.stopPropagation(); closeTplMenu(); setMTab('set'); };
  $('mSetBack').onclick = function () { setMTab(lastTab); };
  $('btnClearM').onclick = function () { $('btnClear').click(); };
  /* v108.5：回到封面（左上角 ‹ 返回、設定頁按鈕）；題目都還在，按「開始出題」回來 */
  function goCover() { closeTplMenu(); if (mtab === 'set') setMTab(lastTab); if (window.showCover) showCover(); }
  $('brandHome').onclick = goCover;
  $('brandHome').onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goCover(); } };
  $('btnCoverM').onclick = goCover;
  $('mPdfBlank').onclick = function () { exportPdf('blank'); };
  $('mPdfKey').onclick = function () { exportPdf('key'); };
  $('mMp3').onclick = function () { $('btnMp3').click(); };
  $('mVideo').onclick = function () { $('btnVideo').click(); };

  /* ---------- 電腦版：左右分隔（v108）----------
     拖曳調整右邊列表的寬度，記在瀏覽器；雙擊恢復預設。左邊至少 420、右邊至少 480 */
  var SPLIT_KEY = 'earTrainer.maker.split', RW_DEF = 680, RW_MIN = 480, LW_MIN = 420;
  function splitMax() { return $('mainView').clientWidth - 32 - 16 - LW_MIN; }
  function applySplit(w) {
    if (w == null) { try { w = parseFloat(localStorage.getItem(SPLIT_KEY)) || RW_DEF; } catch (e) { w = RW_DEF; } }
    w = Math.max(RW_MIN, Math.min(w, Math.max(RW_MIN, splitMax())));
    $('mainView').style.setProperty('--rw', w + 'px');
    return w;
  }
  (function () {
    var sp = $('split'), drag = null;
    sp.addEventListener('pointerdown', function (e) {
      e.preventDefault(); sp.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, w: $('mainView').querySelector('.right').getBoundingClientRect().width };
      sp.classList.add('drag'); document.body.classList.add('splitting');
    });
    sp.addEventListener('pointermove', function (e) { if (drag) drag.cur = applySplit(drag.w - (e.clientX - drag.x)); });
    function end() {
      if (!drag) return;
      if (drag.cur) { try { localStorage.setItem(SPLIT_KEY, String(drag.cur)); } catch (e) {} }
      drag = null; sp.classList.remove('drag'); document.body.classList.remove('splitting');
    }
    sp.addEventListener('pointerup', end); sp.addEventListener('pointercancel', end);
    sp.addEventListener('dblclick', function () { try { localStorage.removeItem(SPLIT_KEY); } catch (e) {} applySplit(RW_DEF); });
    window.addEventListener('resize', function () { if (!isM()) applySplit(); });
  })();
  /* 預覽：A4 縮到螢幕寬（CSS zoom 會重新排版，放大後仍清楚）；兩指縮放 1～4 倍 */
  var PAGE_PX = 210 / 25.4 * 96;
  function applyPvZoom() {
    if (!isM()) { $('pvPages').style.zoom = ''; return; }
    var fit = Math.max(0.2, ($('pvView').clientWidth - 16) / PAGE_PX);
    var eff = fit * pvZoom;
    $('pvPages').style.zoom = eff.toFixed(4);
    $('pvPages').style.setProperty('--bhw', Math.max(16, Math.min(60, 34 / eff)).toFixed(1) + 'px');   // 小節線的點擊框在螢幕上約 34px 寬
  }
  (function () {
    var pv = $('pvView'), pinch = null;
    function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
    pv.addEventListener('touchstart', function (e) {
      if (!isM() || e.touches.length !== 2) return;
      var r = pv.getBoundingClientRect();
      pinch = { d0: dist(e.touches), z0: pvZoom, cx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top };
      pinch.px = (pv.scrollLeft + pinch.cx) / pvZoom; pinch.py = (pv.scrollTop + pinch.cy) / pvZoom;
    }, { passive: true });
    pv.addEventListener('touchmove', function (e) {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      var z = Math.max(1, Math.min(4, pinch.z0 * dist(e.touches) / pinch.d0));
      if (Math.abs(z - pvZoom) < 0.01) return;
      pvZoom = z; applyPvZoom();
      pv.scrollLeft = pinch.px * z - pinch.cx; pv.scrollTop = pinch.py * z - pinch.cy;
    }, { passive: false });
    pv.addEventListener('touchend', function (e) { if (e.touches.length < 2) pinch = null; });
    window.addEventListener('resize', function () { if (view !== 'edit') applyPvZoom(); });
  })();

  /* ---------- 加入主畫面 ---------- */
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; });
  $('btnA2hs').onclick = function () {
    var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    var ipad = IS_IOS && !/iPhone|iPod/.test(navigator.userAgent), html;
    if (standalone) html = '<p class="msg">你已經是從主畫面打開的「音聽出考卷」了。</p>';
    else if (IS_IOS) html = '<ol class="a2-steps"><li>請用 <b>Safari</b> 打開這個網址</li><li>點' + (ipad ? '右上角' : '下方') + '的分享鈕（方框加向上箭頭）</li>' +
                            '<li>選「加入主畫面」</li><li>名稱是「音聽出考卷」，按「新增」</li></ol>' +
                            '<p class="msg" style="margin-top:8px;">從主畫面打開的資料和 Safari 裡的是分開的：之前在 Safari 存的考卷、模板，主畫面那邊看不到。刪除主畫面圖示也會刪掉裡面的考卷與模板。</p>';
    else html = installEvt ? '<p class="msg">按下「安裝」，就會出現在主畫面。</p>'
                           : '<ol class="a2-steps"><li>請用 <b>Chrome</b> 打開這個網址</li><li>點右上角的 ⋮</li><li>選「加到主畫面」或「安裝應用程式」</li></ol>';
    $('a2Body').innerHTML = html;
    $('a2Install').style.display = (!standalone && !IS_IOS && installEvt) ? '' : 'none';
    $('a2Mask').classList.add('on');
  };
  $('a2Install').onclick = async function () {
    if (!installEvt) return;
    installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {}
    installEvt = null; $('a2Mask').classList.remove('on');
  };
  $('a2No').onclick = function () { $('a2Mask').classList.remove('on'); };

  /* ---------- 我的考卷（v110）----------
     存在瀏覽器的資料庫（IndexedDB），不佔 localStorage（同網址的 App、伍線譜掃描共用那 5 MB）。最多 50 張，一張約 80 KB。
     每筆：{ id, name, savedAt, count, paper }。paper 與 localStorage 的工作考卷同格式（不含 measures，會從 xml 重算）。
     目前考卷記住它是從哪一張開啟／存的（paper.savedId），可以直接覆蓋儲存。
     檔案：單張 { format:'cadenza-paper' }、全部 { format:'cadenza-backup', papers, templates }。mp3 不放進檔案：匯出時由題目資料重新產生。 */
  var PDB = { name: 'earTrainer.maker', store: 'papers', cap: 50 };
  function pdbOpen() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('這個瀏覽器不支援資料庫')); return; }
      var r = indexedDB.open(PDB.name, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(PDB.store, { keyPath: 'id' }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function pdbTx(mode, fn) {
    return pdbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(PDB.store, mode), out, req = fn(t.objectStore(PDB.store));
        if (req) req.onsuccess = function () { out = req.result; };
        t.oncomplete = function () { db.close(); res(out); };
        t.onerror = t.onabort = function () { db.close(); rej(t.error || new Error('資料庫寫入失敗')); };
      });
    });
  }
  function pAll() { return pdbTx('readonly', function (st) { return st.getAll(); }).then(function (a) { return (a || []).sort(function (x, y) { return y.savedAt - x.savedAt; }); }); }
  function pPut(rec) { return pdbTx('readwrite', function (st) { return st.put(rec); }); }
  function pDel(id) { return pdbTx('readwrite', function (st) { return st.delete(id); }); }
  function newId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function slimPaper(p) {
    var o = JSON.parse(JSON.stringify(p, function (k, v) { return (k === 'measures' || k === 'shownBreaks' || k === 'chSvg') ? undefined : v; }));
    delete o.savedId; delete o.savedName;
    return o;
  }
  function uniqueName(name, taken) {
    if (taken.indexOf(name) < 0) return name;
    for (var n = 2; ; n++) { var c = name + '(' + n + ')'; if (taken.indexOf(c) < 0) return c; }
  }
  function fmtTime(ms) { var d = new Date(ms), p = function (x) { return String(x).padStart(2, '0'); }; return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function safeFile(s) { return String(s).replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || '考卷'; }
  var pList = [];
  function curRec() { return pList.filter(function (r) { return r.id === paper.savedId; })[0] || null; }
  /* 目前考卷跟存檔的內容不同（或沒存過）＝開別張時要提醒 */
  function paperDirty() {
    if (!paper.items.length) return false;
    var r = curRec(); if (!r) return true;
    return JSON.stringify(slimPaper(paper)) !== JSON.stringify(r.paper);
  }
  function askName(title, def, ok) {
    $('promptTitle').textContent = title; $('promptInput').value = def || ''; $('promptMask').classList.add('on');
    setTimeout(function () { $('promptInput').focus(); $('promptInput').select(); }, 30);
    $('promptOk').onclick = function () {
      var v = $('promptInput').value.trim(); if (!v) { $('promptInput').focus(); return; }
      $('promptMask').classList.remove('on'); ok(v);
    };
    $('promptNo').onclick = function () { $('promptMask').classList.remove('on'); };
  }
  $('promptInput').onkeydown = function (e) { if (e.key === 'Enter') $('promptOk').click(); };
  function persistOnce() { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {} }

  function renderPapers() {
    var box = $('ppList'); box.innerHTML = '';
    $('ppCount').textContent = '已存 ' + pList.length + '／' + PDB.cap + ' 張';
    var r0 = curRec();
    $('ppSave').textContent = r0 ? '💾 儲存（覆蓋「' + r0.name + '」）' : '💾 儲存目前考卷';
    $('ppSaveAs').style.display = r0 ? '' : 'none';
    if (!pList.length) { box.innerHTML = '<div class="pp-empty">還沒有存任何考卷</div>'; return; }
    pList.forEach(function (r) {
      var row = document.createElement('div'); row.className = 'pp-row' + (r.id === paper.savedId ? ' cur' : '');
      var info = document.createElement('div'); info.className = 'pp-info';
      var nm = document.createElement('div'); nm.className = 'pp-name'; nm.textContent = r.name + (r.id === paper.savedId ? '（目前）' : '');
      var mt = document.createElement('div'); mt.className = 'pp-meta'; mt.textContent = r.count + ' 題 · ' + fmtTime(r.savedAt);
      info.appendChild(nm); info.appendChild(mt); row.appendChild(info);
      var acts = document.createElement('div'); acts.className = 'pp-acts';
      [['開啟', 'pp-open', openRec], ['✏️ 改名', '', renameRec], ['⧉ 複製', '', dupRec], ['📤 匯出', '', exportRec], ['🗑', '', delRec]].forEach(function (a) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = a[0]; if (a[1]) b.className = a[1];
        b.onclick = function () { a[2](r); }; acts.appendChild(b);
      });
      row.appendChild(acts); box.appendChild(row);
    });
  }
  function refreshPapers() { return pAll().then(function (a) { pList = a; renderPapers(); }).catch(function (e) { alert('讀取我的考卷失敗：' + e.message); }); }
  function openPapers() { closeTplMenu(); $('papersMask').classList.add('on'); refreshPapers(); }
  $('btnPapers').onclick = openPapers;
  $('mPapers').onclick = openPapers;
  $('ppClose').onclick = function () { $('papersMask').classList.remove('on'); };

  function saveNew(name) {
    if (pList.length >= PDB.cap) { alert('已經存了 ' + PDB.cap + ' 張考卷，請先刪除不需要的考卷。'); return; }
    var rec = { id: newId(), name: uniqueName(name, pList.map(function (r) { return r.name; })), savedAt: Date.now(), count: paper.items.length, paper: slimPaper(paper) };
    pPut(rec).then(function () { paper.savedId = rec.id; save(); persistOnce(); flash('已儲存「' + rec.name + '」'); return refreshPapers(); })
      .catch(function (e) { alert('儲存失敗：' + e.message); });
  }
  $('ppSave').onclick = function () {
    if (!paper.items.length) { flash('還沒有題目'); return; }
    var r = curRec();
    if (r) {
      var rec = { id: r.id, name: r.name, savedAt: Date.now(), count: paper.items.length, paper: slimPaper(paper) };
      pPut(rec).then(function () { flash('已儲存「' + r.name + '」'); return refreshPapers(); }).catch(function (e) { alert('儲存失敗：' + e.message); });
      return;
    }
    askName('儲存目前考卷', paper.header.title || ('考卷 ' + (paper.header.date || today())), saveNew);
  };
  $('ppSaveAs').onclick = function () {
    if (!paper.items.length) { flash('還沒有題目'); return; }
    var r = curRec(); askName('另存新考卷', r ? r.name : (paper.header.title || '考卷'), saveNew);
  };
  /* 開啟：換掉目前考卷（工作考卷照舊存在 localStorage，重新整理也還在） */
  function useRec(r) {
    stopPlayer();
    var p = JSON.parse(JSON.stringify(r.paper));
    localStorage.setItem(STORE, JSON.stringify(p));
    paper = load(); paper.savedId = r.id; save();
    bindHeader(); renderList(); if (view !== 'edit') renderPreview();
    $('papersMask').classList.remove('on');
    if (isM() && mtab === 'set') setMTab('list');   // 手機：從設定頁開的，開完回到列表看題目
    flash('已開啟「' + r.name + '」');
  }
  function openRec(r) {
    if (r.id === paper.savedId && !paperDirty()) { $('papersMask').classList.remove('on'); return; }
    if (paperDirty()) ask('開啟「' + r.name + '」會取代目前的考卷，目前的考卷還沒儲存，確定嗎？', function () { useRec(r); });
    else useRec(r);
  }
  function renameRec(r) {
    askName('改名', r.name, function (v) {
      if (v === r.name) return;
      r.name = uniqueName(v, pList.filter(function (x) { return x !== r; }).map(function (x) { return x.name; }));
      pPut(r).then(refreshPapers).catch(function (e) { alert('改名失敗：' + e.message); });
    });
  }
  function dupRec(r) {
    if (pList.length >= PDB.cap) { alert('已經存了 ' + PDB.cap + ' 張考卷，請先刪除不需要的考卷。'); return; }
    var c = { id: newId(), name: uniqueName(r.name, pList.map(function (x) { return x.name; })), savedAt: Date.now(), count: r.count, paper: JSON.parse(JSON.stringify(r.paper)) };
    pPut(c).then(function () { flash('已複製成「' + c.name + '」'); return refreshPapers(); }).catch(function (e) { alert('複製失敗：' + e.message); });
  }
  function delRec(r) {
    ask('刪除考卷「' + r.name + '」？刪除後無法復原。', function () {
      pDel(r.id).then(function () { if (paper.savedId === r.id) { delete paper.savedId; save(); } return refreshPapers(); })
        .catch(function (e) { alert('刪除失敗：' + e.message); });
    });
  }
  function jsonBlob(o) { return new Blob([JSON.stringify(o)], { type: 'application/json' }); }
  function exportRec(r) {
    deliver(jsonBlob({ format: 'cadenza-paper', ver: 1, name: r.name, savedAt: r.savedAt, paper: r.paper }), '考卷_' + safeFile(r.name) + '.json', 'json', '考卷「' + r.name + '」');
  }
  $('ppExportAll').onclick = function () {
    var tpls = loadTpls();
    if (!pList.length && !tpls.length) { flash('還沒有存任何考卷或模板'); return; }
    deliver(jsonBlob({ format: 'cadenza-backup', ver: 1, exportedAt: Date.now(), papers: pList, templates: tpls }),
            '音聽出考卷備份_' + today() + '.json', 'json', pList.length + ' 張考卷、' + tpls.length + ' 個模板');
  };
  $('ppImport').onclick = function () { $('ppFile').value = ''; $('ppFile').click(); };
  $('ppFile').onchange = async function () {
    var f = this.files && this.files[0]; if (!f) return;
    var o; try { o = JSON.parse(await f.text()); } catch (e) { alert('這個檔案不是音聽出考卷的考卷檔。'); return; }
    var papers = [], tpls = [];
    if (o && o.format === 'cadenza-paper' && o.paper) papers = [{ name: o.name || '匯入的考卷', savedAt: o.savedAt, paper: o.paper }];
    else if (o && o.format === 'cadenza-backup') { papers = o.papers || []; tpls = o.templates || []; }
    else { alert('這個檔案不是音聽出考卷的考卷檔。'); return; }
    var names = pList.map(function (r) { return r.name; }), room = PDB.cap - pList.length, added = 0, skipped = 0;
    try {
      for (var i = 0; i < papers.length; i++) {
        var p = papers[i];
        if (!p || !p.paper || !Array.isArray(p.paper.items)) continue;
        if (added >= room) { skipped++; continue; }
        var nm = uniqueName(String(p.name || '匯入的考卷'), names); names.push(nm);   // 名稱重複：兩份都保留，新的加 (2)
        await pPut({ id: newId(), name: nm, savedAt: p.savedAt || Date.now(), count: p.paper.items.length, paper: p.paper });
        added++;
      }
    } catch (e) { alert('匯入失敗：' + e.message); }
    var tAdded = 0;
    if (tpls.length) {
      var cur = loadTpls(), tn = cur.map(function (t) { return t.name; }).concat(BUILTIN.map(function (b) { return b.name; }));
      tpls.forEach(function (t) { if (!t || !t.name) return; var c = JSON.parse(JSON.stringify(t)); c.name = uniqueName(t.name, tn); tn.push(c.name); cur.push(c); tAdded++; });
      if (!saveTpls(cur)) tAdded = 0;
    }
    if (added) persistOnce();
    await refreshPapers();
    alert('已匯入 ' + added + ' 張考卷' + (tpls.length ? '、' + tAdded + ' 個模板' : '') + '。' +
          (skipped ? '\n還有 ' + skipped + ' 張因為已滿 ' + PDB.cap + ' 張沒有匯入，請先刪除不需要的考卷再匯入一次。' : ''));
  };

  /* ---------- 上方欄位 ---------- */
  function bindHeader() {
    [['hdTitle', 'title'], ['hdAuthor', 'author'], ['hdDate', 'date']].forEach(function (p) {
      var el = $(p[0]); el.value = paper.header[p[1]] || '';
      el.oninput = function () { paper.header[p[1]] = el.value; save(); };
      el.onchange = function () { renderPreview(); };
    });
    /* v109：間距按鈕在預覽頁（電腦版頁首、手機預覽列各一組，同步） */
    document.querySelectorAll('.density-seg button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.d === paper.density);
      b.onclick = function () { paper.density = b.dataset.d; save(); document.querySelectorAll('.density-seg button').forEach(function (x) { x.classList.toggle('on', x.dataset.d === paper.density); }); renderPreview(); };
    });
    $('noPreviewTop').checked = !!paper.noPreview;
  }

  bindHeader(); buildTabs(); renderList();
  applyMode(); mq.addEventListener ? mq.addEventListener('change', applyMode) : mq.addListener(applyMode);
  window.__makerApp = { get paper() { return paper; }, loadTpls: loadTpls, buildPages: buildPages, ordered: ordered, waitFrame: waitFrame, renderList: renderList, setView: setView, save: save };
})();
