/* ===== 出題工具：MusicXML → A4 譜面（VexFlow 3.0.9）=====
   譜例的內容（音高拼寫、符槓、連結線、三連音）一律來自練習頁的 MusicXML 記錄器，
   這裡只負責「版面」：小節等寬、換行、格子置中、作答卷與解答同一個版面。

   座標：VexFlow 原生單位（一個線距＝10），畫完整張 SVG 依 k（線距 px ÷ 10）縮放。 */
(function (global) {
  'use strict';
  var VF = global.Vex.Flow;

  /* ---------- MusicXML 解析（只處理練習頁自己輸出的那幾種元素） ---------- */
  var TYPE_DUR = { whole: 'w', half: 'h', quarter: 'q', eighth: '8', '16th': '16', '32nd': '32' };
  var ACC = { sharp: '#', flat: 'b', natural: 'n', 'double-sharp': '##', 'flat-flat': 'bb', 'sharp-sharp': '##' };
  var FIFTHS_KEY = { '0': 'C', '1': 'G', '2': 'D', '3': 'A', '4': 'E', '5': 'B', '6': 'F#', '7': 'C#',
                     '-1': 'F', '-2': 'Bb', '-3': 'Eb', '-4': 'Ab', '-5': 'Db', '-6': 'Gb', '-7': 'Cb' };

  function txt(el, sel) { var x = el.querySelector(sel); return x ? x.textContent : null; }

  function parse(xml) {
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    var out = [], time = null, fifths = 0, clefs = ['treble'], nStaff = 1;
    doc.querySelectorAll('part > measure').forEach(function (m) {
      var at = m.querySelector('attributes');
      if (at) {
        var st = txt(at, 'staves'); if (st) nStaff = parseInt(st, 10);
        var f = txt(at, 'key > fifths'); if (f != null) fifths = parseInt(f, 10);
        var tm = at.querySelector('time');
        if (tm) time = (tm.getAttribute('print-object') === 'no') ? null : (txt(tm, 'beats') + '/' + txt(tm, 'beat-type'));
        at.querySelectorAll('clef').forEach(function (c) {
          var n = parseInt(c.getAttribute('number') || '1', 10) - 1;
          clefs[n] = (txt(c, 'sign') === 'F') ? 'bass' : 'treble';
        });
      }
      var staves = [];
      for (var i = 0; i < nStaff; i++) staves.push([]);
      var last = null;
      m.querySelectorAll('note').forEach(function (n) {
        var si = parseInt(txt(n, 'staff') || '1', 10) - 1;
        if (n.getAttribute('print-object') === 'no') { last = null; return; }   // 空譜表補的隱形休止符
        var isChord = !!n.querySelector('chord');
        var p = n.querySelector('pitch'), pitch = null;
        if (p) pitch = { step: txt(p, 'step').toLowerCase(), alter: parseInt(txt(p, 'alter') || '0', 10), oct: parseInt(txt(p, 'octave'), 10),
                         acc: ACC[txt(n, 'accidental')] || null };
        if (isChord && last) { last.pitches.push(pitch); return; }
        var beams = {};
        n.querySelectorAll('beam').forEach(function (b) { beams[b.getAttribute('number')] = b.textContent; });
        var tupS = n.querySelector('notations > tuplet[type="start"]'), tupE = n.querySelector('notations > tuplet[type="stop"]');
        var note = {
          rest: !!n.querySelector('rest'), pitches: pitch ? [pitch] : [],
          type: TYPE_DUR[txt(n, 'type')] || 'q', dots: n.querySelectorAll('dot').length,
          div: parseInt(txt(n, 'duration') || '0', 10),
          tieStart: !!n.querySelector('tie[type="start"]'), tieStop: !!n.querySelector('tie[type="stop"]'),
          beam: beams['1'] || null, tupStart: !!tupS, tupStop: !!tupE,
          tupNum: parseInt(txt(n, 'time-modification > actual-notes') || '0', 10),
          tupNorm: parseInt(txt(n, 'time-modification > normal-notes') || '0', 10),
          stem: txt(n, 'stem')
        };
        staves[si].push(note); last = note;
      });
      out.push({ time: time, fifths: fifths, clefs: clefs.slice(0, nStaff), staves: staves });
    });
    return out;
  }

  /* ---------- 版面參數 ---------- */
  var DENSITY = {
    std:   { k: 0.60, mTop: 12, mBot: 12, mSide: 15, secGap: 22, itemGap: 12, sysGap: 4, head: 20, sec: 17, item: 13.5 },
    dense: { k: 0.533, mTop: 9, mBot: 9, mSide: 15, secGap: 14, itemGap: 8, sysGap: 2, head: 19, sec: 16, item: 13 },
    tight: { k: 0.50, mTop: 8, mBot: 8, mSide: 15, secGap: 9, itemGap: 5, sysGap: 0, head: 18, sec: 15, item: 12.5 }
  };
  var MM = 96 / 25.4;
  function contentPx(d) { return (210 - 2 * d.mSide) * MM; }

  var X0 = 14;                // 系統左緣（留給大括號）

  function newCanvas(host, Wvf, Hvf, k) {
    var r = new VF.Renderer(host, VF.Renderer.Backends.SVG);
    r.resize(Wvf, Hvf);
    var ctx = r.getContext();
    fitSvg(host, Wvf, Hvf, k);
    return ctx;
  }
  /* VexFlow 的 resize 會把尺寸寫進 style，畫完之後要再把縮放後的尺寸寫回去 */
  function fitSvg(host, Wvf, Hvf, k) {
    var svg = host.querySelector('svg');
    svg.setAttribute('viewBox', '0 0 ' + Wvf + ' ' + Hvf);
    svg.setAttribute('width', (Wvf * k).toFixed(2));
    svg.setAttribute('height', (Hvf * k).toFixed(2));
    svg.style.width = (Wvf * k).toFixed(2) + 'px';
    svg.style.height = (Hvf * k).toFixed(2) + 'px';
    svg.style.display = 'block';
    host.style.width = ''; host.style.height = '';
  }
  function stave(x, y, w) {
    var s = new VF.Stave(x, y, w, { space_above_staff_ln: 0, fill_style: '#222222' });   // 列印用：譜線用深色（App 畫面是 #999）
    s.setBegBarType(VF.Barline.type.NONE); s.setEndBarType(VF.Barline.type.NONE);
    return s;
  }
  function preWidth(clef, time, keySpec) {
    var s = new VF.Stave(0, 0, 400, { space_above_staff_ln: 0 });
    s.setBegBarType(VF.Barline.type.NONE);
    s.addClef(clef); if (keySpec && keySpec !== 'C') s.addKeySignature(keySpec); if (time) s.addTimeSignature(time);
    s.format();
    return s.getNoteStartX() + 2;
  }
  /* 線段：小節線自己畫，位置可以精確控制、測試也量得到 */
  function vline(ctx, x, y1, y2, w) { ctx.fillRect(x, y1, w || 1, y2 - y1); }
  function overlay(sys, k, x, y, text, cls, align) {
    var d = document.createElement('div');
    d.className = 'ov ' + (cls || '');
    d.textContent = text;
    d.style.left = (x * k) + 'px'; d.style.top = (y * k) + 'px';
    if (align === 'center') d.style.transform = 'translate(-50%, 0)';
    sys.appendChild(d);
    return d;
  }

  var STEP_IDX = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 };
  function makeNote(n, clef) {
    /* ⚠ VexFlow 會把和絃的音由低到高重新排序，addAccidental 的索引是排序後的位置。
       原本的順序（例如女高音在前、女低音在後）不排好，升記號會畫到另一個音上（v106.4 修正） */
    if (!n.rest && n.pitches.length > 1) n.pitches = n.pitches.slice().sort(function (a, b) { return (a.oct * 7 + STEP_IDX[a.step]) - (b.oct * 7 + STEP_IDX[b.step]); });
    var keys = n.rest ? [clef === 'bass' ? 'd/3' : 'b/4'] : n.pitches.map(function (p) { return p.step + '/' + p.oct; });
    var sn = new VF.StaveNote({ clef: clef, keys: keys, duration: n.type + (n.rest ? 'r' : ''), auto_stem: !n.stem });
    if (n.stem) sn.setStemDirection(n.stem === 'up' ? 1 : -1);
    if (!n.rest) n.pitches.forEach(function (p, i) { if (p.acc) sn.addAccidental(i, new VF.Accidental(p.acc)); });
    for (var d = 0; d < n.dots; d++) sn.addDotToAll();
    n.vf = sn;
    if (global.Engrave && global.Engrave.debugNotes) global.Engrave.debugNotes.push({ sn: sn, pitches: n.pitches });
    return sn;
  }

  /* 符頭置中：上下兩行共用同一個 TickContext；量排版後的符頭左右界（臨時記號會把符頭往右推、
     同度與二度會有錯開的符頭），再整組平移到中心 */
  function centreAt(voices, cc) {
    var tc = voices[0].notes[0].getTickContext();
    var lo = Infinity, hi = -Infinity;
    voices.forEach(function (o) { o.notes.forEach(function (n) {
      var b = n.getNoteHeadBeginX(), e = n.getNoteHeadEndX();
      var disp = (n.note_heads || []).some(function (h) { return h.displaced || (h.isDisplaced && h.isDisplaced()); });
      if (disp) { if (n.getStemDirection() > 0) e += (e - b); else b -= (e - b); }
      lo = Math.min(lo, b); hi = Math.max(hi, e);
    }); });
    tc.setX(tc.getX() + (cc - (lo + hi) / 2));
  }

  /* ---------- 音程／和絃：一行 5 格的大譜表 ---------- */
  var CELLS_PER_ROW = 5;
  function renderCells(item, mode, d, numStart) {
    var k = d.k, W = contentPx(d) / k;
    var measures = item.measures, answers = item.answers || [];
    var preW = preWidth('treble', null, null);
    var cellW = (W - X0 - preW - 4) / CELLS_PER_ROW;
    var yT = 46, yB = yT + 100, H = yB + 40 + 52;
    var systems = [];
    for (var r = 0; r * CELLS_PER_ROW < measures.length; r++) {
      var row = measures.slice(r * CELLS_PER_ROW, (r + 1) * CELLS_PER_ROW);
      var sys = document.createElement('div'); sys.className = 'sys';
      sys.style.height = (H * k) + 'px';
      var host = document.createElement('div'); sys.appendChild(host);
      var ctx = newCanvas(host, W, H, k);
      var right = X0 + preW + row.length * cellW;
      var sT = stave(X0, yT, right - X0).addClef('treble'), sB = stave(X0, yB, right - X0).addClef('bass');
      sT.setContext(ctx).draw(); sB.setContext(ctx).draw();
      new VF.StaveConnector(sT, sB).setType(VF.StaveConnector.type.BRACE).setContext(ctx).draw();
      new VF.StaveConnector(sT, sB).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
      var top = sT.getYForLine(0), bot = sB.getYForLine(4);
      var meta = { cells: [] };
      row.forEach(function (m, i) {
        var cx0 = X0 + preW + i * cellW, cx1 = cx0 + cellW, cc = (cx0 + cx1) / 2;
        /* 每格各自是一題：格尾用終止線（細＋粗） */
        vline(ctx, cx1 - 6, top, bot, 1); vline(ctx, cx1 - 3, top, bot, 3);
        var num = numStart.cell + r * CELLS_PER_ROW + i;
        overlay(sys, k, cx0 + 4, yT - 44, num + '.', 'cellnum');
        meta.cells.push({ x0: cx0, x1: cx1, centre: cc });
        if (mode === 'blank') {
          ctx.fillRect(cc - 62, bot + 34, 124, 1.3);
          return;
        }
        var voices = [];
        [0, 1].forEach(function (si) {
          var ns = (m.staves[si] || []).filter(function (n) { return !n.rest; });
          if (!ns.length) return;
          var clef = si === 0 ? 'treble' : 'bass', st = si === 0 ? sT : sB;
          var notes = ns.map(function (n) { return makeNote(n, clef).setStave(st); });
          var v = new VF.Voice({ num_beats: 4, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT).addTickables(notes);
          voices.push({ v: v, st: st, notes: notes });
        });
        if (voices.length) {
          var f = new VF.Formatter();
          voices.forEach(function (o) { f.joinVoices([o.v]); });
          f.format(voices.map(function (o) { return o.v; }), 0);
          /* 符頭中心對到格子中心：所有聲部共用同一個 TickContext，上下兩行的符頭自然對齊 */
          centreAt(voices, cc);
          voices.forEach(function (o) { o.v.draw(ctx, o.st); });
        }
        var ans = answers[r * CELLS_PER_ROW + i];
        if (ans) overlay(sys, k, cc, bot + 16, ans, 'ans', 'center');
      });
      fitSvg(host, W, H, k);
      sys.__meta = meta;
      systems.push(sys);
    }
    return systems;
  }

  /* ---------- 節奏／單旋律：一條譜表，小節等寬、可指定換行 ---------- */
  function defaultBreaks(n, per) { var b = []; for (var i = per; i < n; i += per) b.push(i); return b; }
  /* 預設每行 4 小節；但音符太密（例如 12/8 有十六分音符又有臨時記號）放不下時，自動減少每行小節數。
     作者自己點過換行（item.breaks 有值）就照作者的。 */
  /* 一個小節排得下所需的最小寬度；大譜表兩行要一起排（上下對齊會互相推擠），所以合起來算 */
  function measureNeed(m) {
    var clefs = m.clefs.length ? m.clefs : ['treble'], voices = [];
    clefs.forEach(function (clef, si) {
      var src = m.staves[si] || [];
      if (!src.length) return;
      var notes = src.map(function (nn) { return makeNote(nn, clef); }), tStart = -1;
      src.forEach(function (nn, i) {
        if (nn.tupStart) tStart = i;
        if (nn.tupStop && tStart >= 0) { new VF.Tuplet(notes.slice(tStart, i + 1), { num_notes: nn.tupNum || 3, notes_occupied: nn.tupNorm || 2 }); tStart = -1; }
      });
      var total = src.reduce(function (s, nn) { return s + nn.div; }, 0) || 96;
      voices.push(new VF.Voice({ num_beats: total / 6, beat_value: 16 }).setMode(VF.Voice.Mode.SOFT).addTickables(notes));
    });
    if (!voices.length) return 0;
    var f = new VF.Formatter();
    voices.forEach(function (v) { f.joinVoices([v]); });
    return f.preCalculateMinTotalWidth(voices);
  }
  /* 自動排法：行數不變的前提下平均分配（4 小節放不下一行時排 2+2，不排 3+1；7 小節排 4+3） */
  function balanced(n, per) { var lines = Math.ceil(n / per); return Math.ceil(n / lines); }
  var NEED_K = 1.1;    // 安全係數：大量出題實測（v106.4，節奏＋單旋律各 720 題：1.0 有 2 個音超出小節、1.1 起 0）
  function autoPerLine(item, W) {
    var ms = item.measures, clef = ms[0].clefs[0] || 'treble';
    var keySpec = FIFTHS_KEY[String(ms[0].fifths || 0)];
    var pre1 = preWidth(clef, ms[0].time, keySpec);
    var need = 0;
    try { ms.forEach(function (m) { need = Math.max(need, measureNeed(m)); }); } catch (e) { return 4; }
    for (var per = 4; per > 1; per--) {
      var mW = (W - X0 - pre1 - 2) / Math.min(per, ms.length);
      if (need * NEED_K + 30 <= mW) return per;
    }
    return 1;
  }

  /* 節奏、單旋律、兩聲部（大譜表）、找錯音共用。
     ‧ 每一行補滿到右邊界；只有一小節的行用第一行的小節寬（v106.5，作者：行尾一律對齊）
     ‧ 找錯音：作答卷也畫音符（題目譜），解答再加錯音外框與「應為 X」 */
  function renderLines(item, mode, d, opt) {
    var k = d.k, W = contentPx(d) / k;
    var ms = item.measures, n = ms.length;
    var breaks = (item.breaks || defaultBreaks(n, item.perLine || balanced(n, autoPerLine(item, W)))).filter(function (b) { return b > 0 && b < n; }).sort(function (a, b) { return a - b; });
    item.shownBreaks = breaks.slice();   // 目前畫面上的換行位置（點小節線時以它為準）
    var lines = [], s0 = 0;
    breaks.concat([n]).forEach(function (b) { lines.push([s0, b]); s0 = b; });
    var clefs = ms[0].clefs.length ? ms[0].clefs : ['treble'];
    var nSt = clefs.length;                       // 1＝單一譜表、2＝大譜表（兩聲部）
    var keySpec = FIFTHS_KEY[String(ms[0].fifths || 0)];
    var time = ms[0].time;
    var pre1 = preWidth(clefs[0], time, keySpec), pre2 = preWidth(clefs[0], null, keySpec);
    var showNotes = mode !== 'blank' || item.blankNotes;
    var marks = (mode === 'key' && item.answers && item.answers.marks) ? item.answers.marks : [];
    var yT = (item.answers && item.answers.marks && item.answers.marks.length) ? 100 : 44;              // 找錯音的解答：上方要寫「應為 X」（最多兩排，交疊時上下錯開）
    var gapB = 100, H = yT + (nSt - 1) * gapB + 40 + (nSt > 1 ? 40 : 30);
    var widthOf = function (li) { var c = lines[li][1] - lines[li][0]; return (W - X0 - (li ? pre2 : pre1) - 2) / c; };
    var firstW = widthOf(0);
    var systems = [], allNotes = [[], []], lineOf = [], flat = [];

    function buildMeasure(mi, sts, avail) {
      var voices = [], drawLater = [], rec = [];
      clefs.forEach(function (cl, si) {
        var src = ms[mi].staves[si] || [];
        if (!src.length) return;
        var notes = src.map(function (nn) { return makeNote(nn, cl).setStave(sts[si]); });
        /* 三連音要在放進 voice 之前建立 */
        var tStart = -1;
        src.forEach(function (nn, i) {
          if (nn.tupStart) tStart = i;
          if (nn.tupStop && tStart >= 0) {
            drawLater.push(new VF.Tuplet(notes.slice(tStart, i + 1), { num_notes: nn.tupNum || 3, notes_occupied: nn.tupNorm || 2, bracketed: true, location: si === 0 ? 1 : -1 }));
            tStart = -1;
          }
        });
        var total = src.reduce(function (s, nn) { return s + nn.div; }, 0) || 96;
        var v = new VF.Voice({ num_beats: total / 6, beat_value: 16 }).setMode(VF.Voice.Mode.SOFT).addTickables(notes);
        var grp = null;
        src.forEach(function (nn, i) {
          if (nn.beam === 'begin') grp = [notes[i]];
          else if (nn.beam === 'continue' && grp) grp.push(notes[i]);
          else if (nn.beam === 'end' && grp) { grp.push(notes[i]); drawLater.unshift(new VF.Beam(grp)); grp = null; }
        });
        voices.push({ v: v, st: sts[si], notes: notes });
        rec.push(function () { src.forEach(function (nn) { allNotes[si].push({ nn: nn, mi: mi }); if (si === 0) flat.push(nn); }); });
      });
      if (!voices.length) return null;
      /* 大譜表兩行一起排，上下對齊 */
      var f = new VF.Formatter();
      voices.forEach(function (o) { f.joinVoices([o.v]); });
      f.format(voices.map(function (o) { return o.v; }), avail);
      var maxEnd = -Infinity;
      voices.forEach(function (o) { o.notes.forEach(function (n) { maxEnd = Math.max(maxEnd, n.getNoteHeadEndX()); }); });
      return { voices: voices, drawLater: drawLater, maxEnd: maxEnd, record: function () { rec.forEach(function (r) { r(); }); } };
    }

    lines.forEach(function (ln, li) {
      var cnt = ln[1] - ln[0];
      var mW = (cnt === 1 && li > 0) ? Math.min(firstW, widthOf(li)) : widthOf(li);
      var sys = document.createElement('div'); sys.className = 'sys';
      sys.style.height = (H * k) + 'px';
      var host = document.createElement('div'); sys.appendChild(host);
      var ctx = newCanvas(host, W, H, k);
      sys.__ctx = ctx;
      var pre = li === 0 ? pre1 : pre2;
      var preSt = clefs.map(function (cl, si) {
        var ps = stave(X0, yT + si * gapB, pre).addClef(cl);
        if (keySpec !== 'C') ps.addKeySignature(keySpec);
        if (li === 0 && time) ps.addTimeSignature(time);
        ps.setContext(ctx).draw();
        return ps;
      });
      if (nSt > 1) {
        new VF.StaveConnector(preSt[0], preSt[1]).setType(VF.StaveConnector.type.BRACE).setContext(ctx).draw();
        new VF.StaveConnector(preSt[0], preSt[1]).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
      }
      var top = preSt[0].getYForLine(0), bot = preSt[nSt - 1].getYForLine(4);
      var meta = { bars: [], line: li };
      for (var mi = ln[0]; mi < ln[1]; mi++) {
        var x = X0 + pre + (mi - ln[0]) * mW;
        var sts = clefs.map(function (cl, si) { var st = stave(x, yT + si * gapB, mW); st.setContext(ctx).draw(); return st; });
        var isLast = (mi === n - 1);
        if (isLast) { vline(ctx, x + mW - 6, top, bot, 1); vline(ctx, x + mW - 3, top, bot, 3); }
        else vline(ctx, x + mW - 1, top, bot, 1);
        meta.bars.push({ index: mi, x0: x, x1: x + mW });
        lineOf[mi] = li;
        if (!showNotes) continue;
        /* 排一次、量最後一個符頭有沒有超出小節線，超出就縮小排版寬度重排（大譜表兩行一起排時，
           另一行的附點、臨時記號會把音往右推；最多重排 4 次） */
        var avail = sts[0].getNoteEndX() - sts[0].getNoteStartX() - 6, built = null;
        for (var tries = 0; tries < 5; tries++) {
          built = buildMeasure(mi, sts, avail);
          if (!built || built.maxEnd <= x + mW - 5) break;
          avail -= (built.maxEnd - (x + mW - 5)) + 2;
        }
        if (!built) continue;
        built.voices.forEach(function (o) { o.v.draw(ctx, o.st); });
        built.drawLater.forEach(function (b) { b.setContext(ctx).draw(); });
        built.record();
      }
      /* 換行用的點擊區（只在螢幕預覽） */
      if (opt && opt.interactive) {
        meta.bars.forEach(function (b) {
          if (b.index >= n - 1) return;
          var hit = document.createElement('div');
          hit.className = 'barhit' + (b.index === ln[1] - 1 ? ' at-break' : '');
          hit.title = (b.index === ln[1] - 1) ? '點一下：併回上一行' : '點一下：從這裡換行';
          hit.style.left = ((b.x1 - 6) * k) + 'px'; hit.style.top = ((top - 6) * k) + 'px';
          hit.style.height = ((bot - top + 12) * k) + 'px';
          hit.onclick = function () { opt.onBreak(b.index + 1); };
          sys.appendChild(hit);
        });
      }
      fitSvg(host, W, H, k);
      sys.__meta = meta;
      systems.push(sys);
    });

    if (showNotes) {
      /* 連結線：每個譜表各自照 MusicXML 的 tie start／stop 依序配對；跨行時拆成兩段 */
      allNotes.forEach(function (list) {
        var pending = null;
        list.forEach(function (o) {
          if (o.nn.tieStop && pending) {
            var la = lineOf[pending.mi], lb = lineOf[o.mi];
            if (la === lb) drawTie(systems[la].__ctx, pending.nn.vf, o.nn.vf);
            else { drawTie(systems[la].__ctx, pending.nn.vf, null); drawTie(systems[lb].__ctx, null, o.nn.vf); }
            pending = null;
          }
          if (o.nn.tieStart) pending = o;
        });
      });
      /* 找錯音的解答：錯音加綠色圓角框（圈出錯音＝正確答案），上方用紅字寫「應為 X」。
         標籤與外框之間留空隙；兩個標籤左右交疊時，後面那個往上錯開一排。 */
      var LAB_PX = 10.5, labH = LAB_PX / k, rowsUsed = {};
      function labW(t) { var w = 0; for (var i = 0; i < t.length; i++) w += /[\u2E80-\uFFFF]/.test(t[i]) && !/[♭♯𝄪𝄫]/.test(t[i]) ? 1 : 0.68; return w * LAB_PX / k; }
      marks.forEach(function (mk) {
        var nn = flat[mk.note]; if (!nn || !nn.vf) return;
        var mi = -1; for (var i = 0; i < n; i++) if ((ms[i].staves[0] || []).indexOf(nn) >= 0) { mi = i; break; }
        var sys = systems[lineOf[mi]]; if (!sys) return;
        var st = nn.vf.getStave(), b = nn.vf.getNoteHeadBeginX(), e = nn.vf.getNoteHeadEndX();
        var accW = 0; nn.vf.getModifiers().forEach(function (m) { if (m.getCategory() === 'accidentals') accW = Math.max(accW, m.getWidth() + 2); });
        var x0 = b - 6 - accW, x1 = e + 6, y0 = st.getYForLine(0) - 22, y1 = st.getYForLine(4) + 22, r = 6;
        var c = sys.__ctx;
        c.save(); c.setStrokeStyle('#4b7a5b'); c.setLineWidth(1.5);
        c.beginPath();
        c.moveTo(x0 + r, y0); c.lineTo(x1 - r, y0); c.quadraticCurveTo(x1, y0, x1, y0 + r);
        c.lineTo(x1, y1 - r); c.quadraticCurveTo(x1, y1, x1 - r, y1); c.lineTo(x0 + r, y1);
        c.quadraticCurveTo(x0, y1, x0, y1 - r); c.lineTo(x0, y0 + r); c.quadraticCurveTo(x0, y0, x0 + r, y0);
        c.closePath(); c.stroke(); c.restore();
        var text = String(mk.label).replace(/\s*[↑↓].*$/, ''), cx = (x0 + x1) / 2, w = labW(text) + 6;
        var used = rowsUsed[lineOf[mi]] = rowsUsed[lineOf[mi]] || [[], []], row = 0;
        while (row < 1 && used[row].some(function (u) { return cx - w / 2 < u[1] && cx + w / 2 > u[0]; })) row++;
        used[row].push([cx - w / 2, cx + w / 2]);
        overlay(sys, k, cx, y0 - 12 - labH * (row + 1) - row * 3, text, 'errlabel', 'center');
      });
    }
    function drawTie(ctx, a, b) {
      var t = new VF.StaveTie({ first_note: a, last_note: b, first_indices: [0], last_indices: [0] });
      t.setDirection((a || b).getStemDirection());
      t.setContext(ctx).draw();
    }
    /* v106.8：音域很寬時（符槓拉到譜表外），量每一行音符的最高、最低位置，超出就把那一行加高。
       作答卷沒有音符，借解答的量測結果，兩邊的行高才會一樣（分頁相同） */
    var ext;
    if (showNotes) {
      ext = systems.map(function () { return { lo: 1e9, hi: -1e9 }; });
      allNotes.forEach(function (list) { list.forEach(function (o) {
        var vf = o.nn.vf, e = ext[lineOf[o.mi]]; if (!vf || !e) return;
        try { vf.getYs().forEach(function (y) { e.lo = Math.min(e.lo, y - 6); e.hi = Math.max(e.hi, y + 6); }); } catch (x) {}
        try { if (vf.hasStem && vf.hasStem()) { var se = vf.getStemExtents(); e.lo = Math.min(e.lo, se.topY, se.baseY); e.hi = Math.max(e.hi, se.topY, se.baseY); } } catch (x) {}
      }); });
    } else {
      ext = renderLines(item, 'key', d, null).map(function (sy) { return sy.__ext; });
    }
    systems.forEach(function (sys, li) {
      var e = ext[li] || { lo: 1e9, hi: -1e9 };
      var offTop = Math.max(0, 24 - e.lo), newH = Math.max(H, e.hi + 22) + offTop;
      sys.__ext = e;
      if (!offTop && newH === H) return;
      var svg = sys.querySelector('svg');
      svg.setAttribute('viewBox', '0 ' + (-offTop) + ' ' + W + ' ' + newH);
      svg.setAttribute('height', (newH * k).toFixed(2)); svg.style.height = (newH * k).toFixed(2) + 'px';
      sys.style.height = (newH * k) + 'px';
      if (offTop) sys.querySelectorAll('.ov, .barhit').forEach(function (el) { el.style.top = (parseFloat(el.style.top) + offTop * k) + 'px'; });
    });
    return systems;
  }

  /* ---------- 四部和聲：大譜表、每小節一個全音符和絃置中、調名與級數 ---------- */
  var GRAND_PER_LINE = 10;
  function grandBreaks(n) { return n <= GRAND_PER_LINE ? [] : (n === 12 ? [6] : defaultBreaks(n, GRAND_PER_LINE)); }
  function chordOf(notes) {
    /* 同一譜表的兩個聲部合成一個和絃；同音只留一個（否則同一個音會畫兩個臨時記號） */
    var seen = {}, ps = [];
    notes.forEach(function (n) { if (n.rest) return; n.pitches.forEach(function (p) {
      var id = p.step + p.oct + ':' + p.alter; if (seen[id]) { if (p.acc) seen[id].acc = seen[id].acc || p.acc; return; }
      var c = { step: p.step, oct: p.oct, alter: p.alter, acc: p.acc }; seen[id] = c; ps.push(c);
    }); });
    return ps.length ? { rest: false, pitches: ps, type: 'w', dots: 0 } : null;
  }
  /* ===== v109 數字低音（作者的寫法）=====
     數字＝低音往上的音程；原位三和絃的 5、3 與六和絃的 3 省略；上方的音跟調號不同時，在它的數字右邊加記號（6♯、7♭），
     原本省略的數字這時要寫回來；只有 3 被改變時不寫 3、只寫記號（放在最下層／單獨時接在級數正右方）；低音本身的變化不標；
     重升用 𝄪、降記號調裡升高的音用 ♮。增六寫 It⁺6／Fr⁺6／Ger⁺6、拿坡里寫 N6（和聲作業的作答卷照實際音算）。
     ⚠ 與四部和聲頁（four-part-trainer.html）的 figuredBass 規則相同，改規則兩邊要一起改。 */
  var FB_ACC = { '1': '♯', '-1': '♭', '0': '♮', '2': '𝄪', '-2': '𝄫' };
  function figuredBass(meas, sym) {
    var KS = {}, f = meas.fifths || 0, order = f > 0 ? 'FCGDAEB' : 'BEADGCF';
    for (var i = 0; i < Math.abs(f); i++) KS[order[i]] = f > 0 ? 1 : -1;
    var ps = [];
    (meas.staves || []).forEach(function (st) { st.forEach(function (n) { if (!n.rest) n.pitches.forEach(function (p) { ps.push(p); }); }); });
    if (!ps.length || !sym) return null;
    var val = function (p) { return p.oct * 7 + 'CDEFGAB'.indexOf(String(p.step).toUpperCase()); };
    var bass = ps.reduce(function (a, p) { return val(p) < val(a) ? p : a; });
    var acc = {}, iv = {};
    ps.forEach(function (p) {
      var d = (val(p) - val(bass)) % 7; if (val(p) === val(bass) || !d) return;
      var n = d + 1, L = String(p.step).toUpperCase(); iv[n] = 1;
      if ((p.alter || 0) !== (KS[L] || 0)) acc[n] = FB_ACC[String(p.alter || 0)] || '';
    });
    var main = sym.split('/')[0], sec = sym.indexOf('/') >= 0 ? sym.slice(sym.indexOf('/')) : '';
    var special = /^(It|Fr|Ger)/.test(main) ? 'aug' : (main === 'N6' ? 'n6' : null);
    var std;
    if (special === 'aug') std = Object.keys(iv).map(Number).filter(function (n) { return n !== 3 || iv[4]; }).sort(function (a, b) { return b - a; });
    else {
      var m = main.match(/(\d+)$/), dg = m ? m[1] : '';
      std = { '': [], '6': [6], '64': [6, 4], '7': [7], '65': [6, 5], '43': [4, 3], '42': [4, 2] }[dg] || dg.split('').map(Number);
    }
    var rows = std.map(function (n) { return { n: n, a: acc[n] || '' }; });
    Object.keys(acc).map(Number).forEach(function (n) { if (std.indexOf(n) < 0) rows.push({ n: n === 3 ? 0 : n, a: acc[n], k: n }); });
    rows.sort(function (a, b) { return (b.k || b.n) - (a.k || a.n); });
    return { roman: main.replace(/\d+$/, ''), rows: rows, sec: sec, special: special };
  }
  function fbStack(rows, cls) {
    return '<span class="fb-s' + (cls ? ' ' + cls : '') + '">' + rows.map(function (r) {
      return '<span class="fb-row">' + (r.n ? '<span class="fb-d">' + r.n + (r.a ? '<span class="fb-a">' + r.a + '</span>' : '') + '</span>'
                                             : '<span class="fb-d fb-3">' + r.a + '</span>') + '</span>';
    }).join('') + '</span>';
  }
  /* 解答卷：一般級數＝羅馬數字正對低音（數字疊在右上、不佔寬度）；副屬和絃＝整串置中 */
  function fbKeyHtml(f, raw) {
    var e = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
    if (!f) return e(raw);
    if (f.special === 'aug') return e(f.roman) + '<sup class="fb-plus">+</sup>6';
    if (f.special === 'n6') return 'N6';
    var lone = f.rows.length === 1 && !f.rows[0].n;
    /* v109.2：只有一個數字、或只有一個記號時，寫在級數的正右方（和級數字母同高置中）；兩層以上才疊放 */
    var one = f.rows.length === 1 && f.rows[0].n;
    var fig = !f.rows.length ? '' : (lone ? '<span class="fb-lone">' + f.rows[0].a + '</span>'
            : (one ? '<span class="fb-one">' + f.rows[0].n + (f.rows[0].a ? '<span class="fb-oa">' + f.rows[0].a + '</span>' : '') + '</span>' : fbStack(f.rows)));
    if (f.sec) return '<span class="fb-sec">' + e(f.roman) + fig + e(f.sec) + '</span>';
    return '<span class="fb-r">' + e(f.roman) + (fig ? '<span class="fb-x">' + fig + '</span>' : '') + '</span>';
  }
  /* 和聲作業的作答卷：只印數字與記號，數字欄正對低音（右邊的記號不佔寬度） */
  function fbHwHtml(f) { return (f && f.rows.length) ? fbStack(f.rows, 'fb-hw') : ''; }

  function renderGrand(item, mode, d) {
    var k = d.k, W = contentPx(d) / k;
    var ms = item.measures, n = ms.length;
    var br = grandBreaks(n), lines = [], s0 = 0;
    br.concat([n]).forEach(function (b) { lines.push([s0, b]); s0 = b; });
    var keySpec = FIFTHS_KEY[String(ms[0].fifths || 0)];
    var pre0 = preWidth('treble', 'C', keySpec), pre1 = preWidth('treble', null, keySpec);   // v106.8：第一行加 C 拍號（作者）
    /* 每一行都補滿到右邊界（v106.4，作者：和其他題型對齊；12 小節 6＋6、單行的 6、8 小節也一樣） */
    var yT = 40, yB = yT + 100, H = yB + 40 + 62;
    var ans = item.answers || {};
    var systems = [];
    /* v106.8：級數那一排依這一行最低的音決定（作者選 b）：低音太低時往下移，與符頭保持距離。
       用題目資料算，作答卷（沒有音符）與解答的位置、行高相同 */
    var tmpB = stave(X0, yB, 200).addClef('bass'), botY = tmpB.getYForLine(4);
    function numYOf(ln) {
      var low = -1e9;
      for (var mi = ln[0]; mi < ln[1]; mi++) {
        var ch = chordOf(ms[mi].staves[1] || []); if (!ch) continue;
        ch.pitches.forEach(function (p) {
          var line = VF.keyProperties(String(p.step).toLowerCase() + '/' + p.oct, 'bass').line;
          low = Math.max(low, tmpB.getYForNote(line));
        });
      }
      return Math.max(botY + 22, low + 5 + 18);
    }
    lines.forEach(function (ln, li) {
      var numY = numYOf(ln), Hl = Math.max(H, numY + 40);
      /* v109：數字疊到三層（例如 6♯/4/3）時，這一行加高，不壓到下一行 */
      if (mode !== 'blank' || (item.data && item.data.hw)) {
        var maxRows = 0;
        for (var mj = ln[0]; mj < ln[1]; mj++) { var fq = figuredBass(ms[mj], (ans.numerals || [])[mj] || ''); if (fq && !fq.special) maxRows = Math.max(maxRows, fq.rows.length); else if (fq && mode === 'blank') maxRows = Math.max(maxRows, fq.rows.length); }
        if (maxRows > 2) Hl = Math.max(Hl, numY + 50 + (maxRows - 2) * 12);
      }
      var sys = document.createElement('div'); sys.className = 'sys';
      sys.style.height = (Hl * k) + 'px';
      var host = document.createElement('div'); sys.appendChild(host);
      var ctx = newCanvas(host, W, Hl, k);
      var pre = li ? pre1 : pre0;
      var mW = (W - X0 - pre - 2) / (ln[1] - ln[0]);
      var right = X0 + pre + (ln[1] - ln[0]) * mW;
      var sT = stave(X0, yT, right - X0).addClef('treble'), sB = stave(X0, yB, right - X0).addClef('bass');
      if (keySpec !== 'C') { sT.addKeySignature(keySpec); sB.addKeySignature(keySpec); }
      if (!li) { sT.addTimeSignature('C'); sB.addTimeSignature('C'); }
      sT.setContext(ctx).draw(); sB.setContext(ctx).draw();
      new VF.StaveConnector(sT, sB).setType(VF.StaveConnector.type.BRACE).setContext(ctx).draw();
      new VF.StaveConnector(sT, sB).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
      var top = sT.getYForLine(0), bot = sB.getYForLine(4);
      var meta = { bars: [], line: li };
      for (var mi = ln[0]; mi < ln[1]; mi++) {
        var x0 = X0 + pre + (mi - ln[0]) * mW, x1 = x0 + mW, cc = (x0 + x1) / 2;
        if (mi === n - 1) { vline(ctx, x1 - 6, top, bot, 1); vline(ctx, x1 - 3, top, bot, 3); }
        else vline(ctx, x1 - 1, top, bot, 1);
        meta.bars.push({ index: mi, x0: x0, x1: x1, centre: cc });
        /* v109：和聲作業（item.data.hw）的作答卷：第一小節完整四部，其餘小節只留低音（第四部），級數與調名照樣空白 */
        var hw = mode === 'blank' && item.data && item.data.hw;
        if (mode !== 'blank' || hw) {
          var voices = [];
          [0, 1].forEach(function (si) {
            var ch = chordOf(ms[mi].staves[si] || []); if (!ch) return;
            if (hw && mi > 0) {
              if (si === 0) return;
              var lo = ch.pitches.reduce(function (a, p) {
                var va = a.oct * 7 + 'CDEFGAB'.indexOf(String(a.step).toUpperCase()), vp = p.oct * 7 + 'CDEFGAB'.indexOf(String(p.step).toUpperCase());
                return (vp < va || (vp === va && (p.alter || 0) < (a.alter || 0))) ? p : a;
              });
              ch = { rest: false, pitches: [lo], type: 'w', dots: 0 };
            }
            var clef = si === 0 ? 'treble' : 'bass', st = si === 0 ? sT : sB;
            var note = makeNote(ch, clef).setStave(st);
            voices.push({ v: new VF.Voice({ num_beats: 4, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT).addTickables([note]), st: st, notes: [note] });
          });
          if (voices.length) {
            var f = new VF.Formatter();
            voices.forEach(function (o) { f.joinVoices([o.v]); });
            f.format(voices.map(function (o) { return o.v; }), 0);
            centreAt(voices, cc);
            voices.forEach(function (o) { o.v.draw(ctx, o.st); });
          }
          /* v109：級數改成數字低音寫法（解答卷）；和聲作業的作答卷只印數字與記號 */
          var num = (ans.numerals || [])[mi];
          if (num) {
            var fb = figuredBass(ms[mi], num);
            var html = mode === 'blank' ? fbHwHtml(fb) : fbKeyHtml(fb, num);
            if (html) overlay(sys, k, cc, numY, '', 'numeral', 'center').innerHTML = html;
          }
        }
      }
      /* 調名／「＿＿調：」：第一行低音譜表下方，從譜表最左邊開始寫（同 SOP 的解答） */
      if (li === 0) {
        if (mode === 'blank') {
          /* 作答卷：一條約三個字寬的實線＋「調：」（v106.5，作者：兩個底線字元中間會斷開） */
          var kb = overlay(sys, k, 0, numY, '', 'keyname');
          kb.innerHTML = '<span class="keyline"></span>調：';
        } else if (ans.key) overlay(sys, k, 0, numY, ans.key, 'keyname');
      }
      fitSvg(host, W, Hl, k);
      sys.__meta = meta;
      systems.push(sys);
    });
    return systems;
  }


  /* ---------- 音堆：一格一題（一行三格，排在 maker.js），一個小節、全音符音堆置中 ---------- */
  var STACK_PER_ROW = 3;
  /* 音堆：一律大譜表，同一大題的題目接成一行三格，每格以終止線結束，格內只印題號（同音程／和絃）。
     App 的音域：高音譜號題 C4–B5、低音譜號題 C2–B3，所以照原本的譜號放上／下譜表即可。 */
  function renderStackRow(items, nums, mode, d) {
    var k = d.k, W = contentPx(d) / k;
    var preW = preWidth('treble', null, null);
    var cellW = (W - X0 - preW - 4) / STACK_PER_ROW;
    var yT = 46, yB = yT + 100, H = yB + 40 + 34;
    var sys = document.createElement('div'); sys.className = 'sys';
    sys.style.height = (H * k) + 'px';
    var host = document.createElement('div'); sys.appendChild(host);
    var ctx = newCanvas(host, W, H, k);
    var right = X0 + preW + items.length * cellW;
    var sT = stave(X0, yT, right - X0).addClef('treble'), sB = stave(X0, yB, right - X0).addClef('bass');
    sT.setContext(ctx).draw(); sB.setContext(ctx).draw();
    new VF.StaveConnector(sT, sB).setType(VF.StaveConnector.type.BRACE).setContext(ctx).draw();
    new VF.StaveConnector(sT, sB).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
    var top = sT.getYForLine(0), bot = sB.getYForLine(4);
    var meta = { cells: [] }, numEls = [];
    items.forEach(function (item, i) {
      if (!item.measures) item.measures = parse(item.xml);
      var m = item.measures[0];
      var cx0 = X0 + preW + i * cellW, cx1 = cx0 + cellW, cc = (cx0 + cx1) / 2;
      vline(ctx, cx1 - 6, top, bot, 1); vline(ctx, cx1 - 3, top, bot, 3);   // 每格各自是一題：終止線
      numEls.push(nums[i] === '' ? null : overlay(sys, k, cx0 + 4, yT - 44, nums[i] + '.' + (global.__makerScoreText ? global.__makerScoreText(item.score) : ''), 'cellnum'));
      meta.cells.push({ x0: cx0, x1: cx1, centre: cc });
      if (mode === 'blank') return;
      var clefs = m.clefs.length ? m.clefs : ['treble'], voices = [];
      clefs.forEach(function (cl, si) {
        var ch = chordOf(m.staves[si] || []); if (!ch) return;
        var clef = (cl === 'bass') ? 'bass' : 'treble', st = clef === 'bass' ? sB : sT;
        var note = makeNote(ch, clef).setStave(st);
        voices.push({ v: new VF.Voice({ num_beats: 4, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT).addTickables([note]), st: st, notes: [note] });
      });
      if (voices.length) {
        var f = new VF.Formatter();
        voices.forEach(function (o) { f.joinVoices([o.v]); });
        f.format(voices.map(function (o) { return o.v; }), 0);
        centreAt(voices, cc);
        voices.forEach(function (o) { o.v.draw(ctx, o.st); });
      }
    });
    fitSvg(host, W, H, k);
    sys.__meta = meta; sys.__numEls = numEls;
    return sys;
  }

  /* ---------- 聖詠和聲（v111）：譜由練習頁畫好（item.paper.blank／key，每行一張 SVG），這裡縮放到 A4 內容寬 ----------
     作答卷：低音挖空、級數列畫底線；解答卷：同一個版面，補上低音、級數寫在底線上。每行三小節由練習頁排好。 */
  function renderChorale(item, mode, d) {
    var cw = contentPx(d);
    if (!item.chSvg) {   // 譜還沒畫好（剛開啟考卷）：先放同樣高度的空白，maker.js 請練習頁畫好後會重排
      if (global.__makerNeedChorale) global.__makerNeedChorale();
      var q = item.data && item.data.q, n = q ? Math.ceil(q.bars / 3) : 1, out = [];
      for (var i = 0; i < n; i++) { var ph = document.createElement('div'); ph.className = 'sys'; ph.style.height = (327 * cw / 1133) + 'px'; out.push(ph); }
      return out;
    }
    var list = item.chSvg[mode === 'key' ? 'key' : 'blank'] || [];
    return list.map(function (s) {
      var sc = cw / s.w, sys = document.createElement('div'); sys.className = 'sys';
      sys.innerHTML = s.svg;
      var svg = sys.querySelector('svg');
      svg.setAttribute('width', cw.toFixed(2)); svg.setAttribute('height', (s.h * sc).toFixed(2));
      svg.style.width = cw.toFixed(2) + 'px'; svg.style.height = (s.h * sc).toFixed(2) + 'px'; svg.style.display = 'block';
      sys.style.height = (s.h * sc) + 'px';
      return sys;
    });
  }

  /* ---------- 一個小題（標題＋譜） ---------- */
  function renderItem(item, mode, d, numState, opt) {
    var box = document.createElement('div'); box.className = 'item';
    var t = document.createElement('div'); t.className = 'item-title';
    t.style.fontSize = d.item + 'px';
    t.textContent = numState.item + '. ' + item.title + (global.__makerScoreText ? global.__makerScoreText(item.score) : '');
    box.appendChild(t);
    if (!item.measures && item.layout !== 'chorale') item.measures = parse(item.xml);
    var systems = (item.layout === 'chorale') ? renderChorale(item, mode, d)
                : (item.layout === 'stack') ? [renderStackRow([item], [''], mode, d)]   // 出題預覽卡：單題
                : (item.layout === 'cells') ? renderCells(item, mode, d, numState)
                : (item.layout === 'grand') ? renderGrand(item, mode, d) : renderLines(item, mode, d, opt);
    systems.forEach(function (s) { s.style.marginTop = d.sysGap + 'px'; box.appendChild(s); });
    return box;
  }

  global.Engrave = { renderStackRow: renderStackRow, STACK_PER_ROW: STACK_PER_ROW, debugNotes: null, setNeedK: function (v) { NEED_K = v; }, parse: parse, renderItem: renderItem, DENSITY: DENSITY, contentPx: contentPx, MM: MM,
                     defaultBreaks: defaultBreaks, CELLS_PER_ROW: CELLS_PER_ROW };
})(window);
