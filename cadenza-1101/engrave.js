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

  function makeNote(n, clef) {
    var keys = n.rest ? [clef === 'bass' ? 'd/3' : 'b/4'] : n.pitches.map(function (p) { return p.step + '/' + p.oct; });
    var sn = new VF.StaveNote({ clef: clef, keys: keys, duration: n.type + (n.rest ? 'r' : ''), auto_stem: !n.stem });
    if (n.stem) sn.setStemDirection(n.stem === 'up' ? 1 : -1);
    if (!n.rest) n.pitches.forEach(function (p, i) { if (p.acc) sn.addAccidental(i, new VF.Accidental(p.acc)); });
    for (var d = 0; d < n.dots; d++) sn.addDotToAll();
    n.vf = sn;
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
        /* 格間雙小節線（細＋細） */
        vline(ctx, cx1 - 4, top, bot, 1); vline(ctx, cx1 - 1, top, bot, 1);
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
  function measureNeed(m, clef) {
    var src = m.staves[0] || [];
    if (!src.length) return 0;
    var notes = src.map(function (nn) { return makeNote(nn, clef); }), tStart = -1;
    src.forEach(function (nn, i) {
      if (nn.tupStart) tStart = i;
      if (nn.tupStop && tStart >= 0) { new VF.Tuplet(notes.slice(tStart, i + 1), { num_notes: nn.tupNum || 3, notes_occupied: nn.tupNorm || 2 }); tStart = -1; }
    });
    var total = src.reduce(function (s, nn) { return s + nn.div; }, 0) || 96;
    var v = new VF.Voice({ num_beats: total / 6, beat_value: 16 }).setMode(VF.Voice.Mode.SOFT).addTickables(notes);
    var f = new VF.Formatter().joinVoices([v]);
    return f.preCalculateMinTotalWidth([v]);
  }
  function autoPerLine(item, W) {
    var ms = item.measures, clef = ms[0].clefs[0] || 'treble';
    var keySpec = FIFTHS_KEY[String(ms[0].fifths || 0)];
    var pre1 = preWidth(clef, ms[0].time, keySpec);
    var need = 0;
    try { ms.forEach(function (m) { need = Math.max(need, measureNeed(m, clef)); }); } catch (e) { return 4; }
    for (var per = 4; per > 1; per--) {
      var mW = (W - X0 - pre1 - 2) / Math.min(per, ms.length);
      if (need * 1.45 + 30 <= mW) return per;
    }
    return 1;
  }

  function renderLines(item, mode, d, opt) {
    var k = d.k, W = contentPx(d) / k;
    var ms = item.measures, n = ms.length;
    var breaks = (item.breaks || defaultBreaks(n, autoPerLine(item, W))).filter(function (b) { return b > 0 && b < n; }).sort(function (a, b) { return a - b; });
    item.shownBreaks = breaks.slice();   // 目前畫面上的換行位置（點小節線時以它為準）
    var lines = [], s0 = 0;
    breaks.concat([n]).forEach(function (b) { lines.push([s0, b]); s0 = b; });
    var clef = ms[0].clefs[0] || 'treble';
    var keySpec = FIFTHS_KEY[String(ms[0].fifths || 0)];
    var time = ms[0].time;
    var pre1 = preWidth(clef, time, keySpec), pre2 = preWidth(clef, null, keySpec);
    var maxBars = Math.max.apply(null, lines.map(function (l) { return l[1] - l[0]; }));
    var mW = (W - X0 - pre1 - 2) / maxBars;
    var yT = 44, H = yT + 40 + 30;
    var systems = [], allNotes = [], firstNoteOfMeasure = [], lastNoteOfMeasure = [], lineOf = [];

    lines.forEach(function (ln, li) {
      var sys = document.createElement('div'); sys.className = 'sys';
      sys.style.height = (H * k) + 'px';
      var host = document.createElement('div'); sys.appendChild(host);
      var ctx = newCanvas(host, W, H, k);
      var pre = li === 0 ? pre1 : pre2;
      var ps = stave(X0, yT, pre).addClef(clef);
      if (keySpec !== 'C') ps.addKeySignature(keySpec);
      if (li === 0 && time) ps.addTimeSignature(time);
      ps.setContext(ctx).draw();
      var top = ps.getYForLine(0), bot = ps.getYForLine(4);
      var meta = { bars: [], line: li };
      for (var mi = ln[0]; mi < ln[1]; mi++) {
        var x = X0 + pre + (mi - ln[0]) * mW;
        var st = stave(x, yT, mW); st.setContext(ctx).draw();
        var isLast = (mi === n - 1);
        if (isLast) { vline(ctx, x + mW - 6, top, bot, 1); vline(ctx, x + mW - 3, top, bot, 3); }
        else vline(ctx, x + mW - 1, top, bot, 1);
        meta.bars.push({ index: mi, x0: x, x1: x + mW });
        lineOf[mi] = li;
        if (mode === 'blank') continue;
        var src = ms[mi].staves[0] || [];
        var notes = src.map(function (nn) { return makeNote(nn, clef).setStave(st); });
        /* 三連音要在放進 voice 之前建立 */
        var tuplets = [], tStart = -1;
        src.forEach(function (nn, i) {
          if (nn.tupStart) tStart = i;
          if (nn.tupStop && tStart >= 0) {
            tuplets.push(new VF.Tuplet(notes.slice(tStart, i + 1), { num_notes: nn.tupNum || 3, notes_occupied: nn.tupNorm || 2, bracketed: true, location: 1 }));
            tStart = -1;
          }
        });
        var total = src.reduce(function (s, nn) { return s + nn.div; }, 0) || 96;
        var v = new VF.Voice({ num_beats: total / 6, beat_value: 16 }).setMode(VF.Voice.Mode.SOFT).addTickables(notes);
        var beams = [], grp = null;
        src.forEach(function (nn, i) {
          if (nn.beam === 'begin') grp = [notes[i]];
          else if (nn.beam === 'continue' && grp) grp.push(notes[i]);
          else if (nn.beam === 'end' && grp) { grp.push(notes[i]); beams.push(new VF.Beam(grp)); grp = null; }
        });
        new VF.Formatter().joinVoices([v]).format([v], st.getNoteEndX() - st.getNoteStartX() - 6);
        v.draw(ctx, st);
        beams.forEach(function (b) { b.setContext(ctx).draw(); });
        tuplets.forEach(function (t) { t.setContext(ctx).draw(); });
        src.forEach(function (nn) { allNotes.push(nn); });
        firstNoteOfMeasure[mi] = src[0]; lastNoteOfMeasure[mi] = src[src.length - 1];
        sys.__ctx = ctx;
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

    /* 連結線：照 MusicXML 的 tie start／stop 依序配對；跨行時拆成兩段 */
    if (mode !== 'blank') {
      var pending = null, pendSys = -1;
      allNotes.forEach(function (nn) {
        if (nn.tieStop && pending) {
          var la = sysIndexOf(pending), lb = sysIndexOf(nn);
          if (la === lb) drawTie(systems[la].__ctx, pending.vf, nn.vf);
          else { drawTie(systems[la].__ctx, pending.vf, null); drawTie(systems[lb].__ctx, null, nn.vf); }
          pending = null;
        }
        if (nn.tieStart) pending = nn;
      });
    }
    function sysIndexOf(nn) {
      for (var mi = 0; mi < n; mi++) if ((ms[mi].staves[0] || []).indexOf(nn) >= 0) return lineOf[mi];
      return 0;
    }
    function drawTie(ctx, a, b) {
      var t = new VF.StaveTie({ first_note: a, last_note: b, first_indices: [0], last_indices: [0] });
      var dir = (a || b).getStemDirection ? -(a || b).getStemDirection() : -1;
      t.setDirection((a || b).getStemDirection());
      t.setContext(ctx).draw();
      return dir;
    }
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
  function renderGrand(item, mode, d) {
    var k = d.k, W = contentPx(d) / k;
    var ms = item.measures, n = ms.length;
    var br = grandBreaks(n), lines = [], s0 = 0;
    br.concat([n]).forEach(function (b) { lines.push([s0, b]); s0 = b; });
    var keySpec = FIFTHS_KEY[String(ms[0].fifths || 0)];
    var pre = preWidth('treble', null, keySpec);
    /* 小節寬固定：以 10 小節、調號最寬（7 個升記號）來算，所以 6、8 小節後面留白，
       而且不同調的題目小節寬都一樣 */
    var mW = (W - X0 - preWidth('treble', null, 'C#') - 2) / GRAND_PER_LINE;
    var yT = 40, yB = yT + 100, H = yB + 40 + 62;
    var ans = item.answers || {};
    var systems = [];
    lines.forEach(function (ln, li) {
      var sys = document.createElement('div'); sys.className = 'sys';
      sys.style.height = (H * k) + 'px';
      var host = document.createElement('div'); sys.appendChild(host);
      var ctx = newCanvas(host, W, H, k);
      var right = X0 + pre + (ln[1] - ln[0]) * mW;
      var sT = stave(X0, yT, right - X0).addClef('treble'), sB = stave(X0, yB, right - X0).addClef('bass');
      if (keySpec !== 'C') { sT.addKeySignature(keySpec); sB.addKeySignature(keySpec); }
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
        if (mode !== 'blank') {
          var voices = [];
          [0, 1].forEach(function (si) {
            var ch = chordOf(ms[mi].staves[si] || []); if (!ch) return;
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
          var num = (ans.numerals || [])[mi];
          if (num) overlay(sys, k, cc, bot + 22, num, 'numeral', 'center');
        }
      }
      /* 調名／「＿＿調：」：放在第一行調號正下方，右緣對齊第一小節的起點 */
      if (li === 0) {
        var keyText = mode === 'blank' ? '＿＿調：' : (ans.key || '');
        if (keyText) { var kd = overlay(sys, k, X0 + pre - 2, bot + 22, keyText, 'keyname'); kd.style.transform = 'translate(-100%, 0)'; }
      }
      fitSvg(host, W, H, k);
      sys.__meta = meta;
      systems.push(sys);
    });
    return systems;
  }

  /* ---------- 一個小題（標題＋譜） ---------- */
  function renderItem(item, mode, d, numState, opt) {
    var box = document.createElement('div'); box.className = 'item';
    var t = document.createElement('div'); t.className = 'item-title';
    t.style.fontSize = d.item + 'px';
    t.textContent = numState.item + '. ' + item.title;
    box.appendChild(t);
    if (!item.measures) item.measures = parse(item.xml);
    var systems = (item.layout === 'cells') ? renderCells(item, mode, d, numState)
                : (item.layout === 'grand') ? renderGrand(item, mode, d) : renderLines(item, mode, d, opt);
    systems.forEach(function (s) { s.style.marginTop = d.sysGap + 'px'; box.appendChild(s); });
    return box;
  }

  global.Engrave = { parse: parse, renderItem: renderItem, DENSITY: DENSITY, contentPx: contentPx, MM: MM,
                     defaultBreaks: defaultBreaks, CELLS_PER_ROW: CELLS_PER_ROW };
})(window);
