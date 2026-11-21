/* 聖詠和聲：出題程式（v111 新增）
   ChoraleGen.make(deps) → { generate(cfg) }
   deps：本頁複製自四部和聲的出題引擎與工具 { HE, KEYS, letterIndexOfTone, displayChord }
   流程：樂句骨架（四部和聲引擎，一句一句接）→ 聲部進行 → 獨立檢查 → 加和聲外音（每一步都重新檢查）
         → 掛留拍（直接給答案）→ 依「組」挑挖空 → 數字低音（依實際的音算）
   雛形在 Python 驗證過（作者聽過四批範例），規則與雛形一致。 */
(function (root) {
  'use strict';
  var LS = [0, 2, 4, 5, 7, 9, 11];
  var RANGE = [[60, 79], [55, 72], [48, 67], [41, 60]];   // S A T B
  var EPS = 1e-9;

  function rng(seed) {   // mulberry32
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, R) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(arr, R) { return arr[Math.floor(R() * arr.length)]; }
  function mod(n, m) { return ((n % m) + m) % m; }
  function clone(V) { return V.map(function (v) { return v.map(function (x) { return Object.assign({}, x); }); }); }

  /* ---------- 聲部資料：V[聲部] = [{t, d, m, L, slot, k, tie}] ---------- */
  function build(q) {
    var V = [[], [], [], []], t = 0;
    for (var i = 0; i < q.durs.length; i++) {
      for (var v = 0; v < 4; v++) V[v].push({ t: t, d: q.durs[i], m: q.voicings[i][v], L: q.letters[i][v], slot: i, k: 'ct', tie: false });
      t += q.durs[i];
    }
    return { V: V, total: t };
  }
  function at(V, v, t) { var a = V[v]; for (var i = 0; i < a.length; i++) { var x = a[i]; if (x.t <= t + EPS && t + EPS < x.t + x.d) return x; } return null; }
  function idx(V, v, t) { var a = V[v]; for (var i = 0; i < a.length; i++) if (Math.abs(a[i].t - t) < EPS) return i; return -1; }
  function scaleOf(off, isMin) { var st = isMin ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11], s = {}; st.forEach(function (x) { s[(off + x) % 12] = 1; }); return s; }
  function step(m, L, dirn, scale) {
    var L2 = mod(L + dirn, 7);
    for (var c = m + dirn; c !== m + 3 * dirn; c += dirn) {
      if (scale[mod(c, 12)]) { var acc = mod(mod(c, 12) - LS[L2] + 6, 12) - 6; if (Math.abs(acc) <= 1) return [c, L2]; }
    }
    return null;
  }

  /* ---------- 獨立檢查（十六分音符為單位；不呼叫出題引擎的判斷） ---------- */
  function check(V, total) {
    var errs = [], N = Math.round(total * 4), prev = null, prevn = null, i, j;
    for (var g = 0; g < N; g++) {
      var t = g * 0.25, cur = [], ms = [];
      for (var v = 0; v < 4; v++) { cur.push(at(V, v, t)); ms.push(cur[v].m); }
      if (!(ms[0] >= ms[1] && ms[1] >= ms[2] && ms[2] >= ms[3])) errs.push(['交錯', t]);
      if (ms[0] - ms[1] > 12 || ms[1] - ms[2] > 12 || ms[2] - ms[3] > 24) errs.push(['間距', t]);
      for (v = 0; v < 4; v++) if (ms[v] < RANGE[v][0] || ms[v] > RANGE[v][1]) errs.push(['音域', t, v]);
      if (prev) {
        for (i = 0; i < 4; i++) for (j = i + 1; j < 4; j++) {
          var a1 = prev[i], a2 = ms[i], b1 = prev[j], b2 = ms[j];
          if (a1 === a2 || b1 === b2) continue;
          var i1 = mod(a1 - b1, 12), i2 = mod(a2 - b2, 12);
          if (i1 === i2 && (i1 === 0 || i1 === 7)) errs.push(['平行／反向五八度', t, i, j]);
        }
        var s1 = prev[0], s2 = ms[0], q1 = prev[3], q2 = ms[3];
        if ((s2 - s1) * (q2 - q1) > 0 && (mod(s2 - q2, 12) === 0 || mod(s2 - q2, 12) === 7) && Math.abs(s2 - s1) > 2) errs.push(['隱伏', t]);
      }
      for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) {
        if (i === j) continue;
        var x = cur[i], ys = [cur[j], prevn ? prevn[j] : null];
        for (var y = 0; y < 2; y++) {
          var yy = ys[y]; if (!yy) continue;
          if (x.L === yy.L && mod(x.m, 12) !== mod(yy.m, 12) && (x.k !== 'ct' || yy.k !== 'ct')) errs.push(['對斜', t, i, j]);
        }
      }
      prevn = cur; prev = ms;
    }
    // 拍子中間兩個聲部同時換音、其中有和聲外音 → 只能三度或六度
    var CT = { ct: 1, oct: 1, res: 1 };
    for (g = 0; g < N; g++) {
      t = g * 0.25; if (Math.abs(t - Math.round(t)) < EPS) continue;
      var mv = [];
      for (v = 0; v < 4; v++) { var e = at(V, v, t); if (Math.abs(e.t - t) < EPS) mv.push([v, e]); }
      for (i = 0; i < mv.length; i++) for (j = i + 1; j < mv.length; j++) {
        var X = mv[i][1], Y = mv[j][1];
        if (CT[X.k] && CT[Y.k]) continue;
        var iv = mod(X.m - Y.m, 12);
        if (!(iv === 3 || iv === 4 || iv === 8 || iv === 9)) errs.push(['同時換音非三六度', t, mv[i][0], mv[j][0]]);
      }
    }
    // 拍點對拍點
    for (var b = 0; b < Math.floor(total) - 1; b++) {
      var m1 = [], m2 = [];
      for (v = 0; v < 4; v++) { m1.push(at(V, v, b).m); m2.push(at(V, v, b + 1).m); }
      for (i = 0; i < 4; i++) for (j = i + 1; j < 4; j++) {
        if (m1[i] === m2[i] || m1[j] === m2[j]) continue;
        var k1 = mod(m1[i] - m1[j], 12), k2 = mod(m2[i] - m2[j], 12);
        if (k1 === k2 && (k1 === 0 || k1 === 7) && (m2[i] - m1[i]) * (m2[j] - m1[j]) > 0) errs.push(['拍點平行', b, i, j]);
      }
    }
    for (v = 0; v < 4; v++) {
      var ns = V[v];
      for (i = 0; i + 1 < ns.length; i++) {
        var A = ns[i], B = ns[i + 1], d = Math.abs(B.m - A.m), ld = Math.min(mod(B.L - A.L, 7), mod(A.L - B.L, 7));
        if (d === 3 && ld === 1) errs.push(['增二度', A.t, v]);
        if (v < 3 && d === 6) errs.push(['三全音跳進', A.t, v]);
        if (v < 3 && d > 7) errs.push(['大跳', A.t, v]);
        if (v === 3 && d === 6) errs.push(['低音三全音', A.t]);
      }
    }
    return errs;
  }

  function split(V, v, k, parts) {
    var x = V[v][k], t = x.t, nw = [];
    parts.forEach(function (p) { nw.push(Object.assign({}, x, { t: t, d: p[0], m: p[1], L: p[2], k: p[3], tie: false })); t += p[0]; });
    nw[nw.length - 1].tie = !!x.tie;
    V[v].splice.apply(V[v], [k, 1].concat(nw));
  }

  /* ---------- 和聲外音 ---------- */
  function decorate(q, rate, seed) {
    var R = rng(seed), bt = build(q), V = bt.V, total = bt.total;
    if (check(V, total).length) return null;
    var off = q.key.off, isMin = q.key.isMin, scale = scaleOf(off, isMin);
    var n = q.seq.length, durs = q.durs, ferm = q.ferm, ph = q.phraseOf, seq = q.seq, starts = q.starts;
    var avoid = {}; if (isMin) [8, 9, 10, 11].forEach(function (x) { avoid[(off + x) % 12] = 1; });
    var added = 0, perSlot = [], touched = {}, noask = {};
    for (var z = 0; z < n; z++) perSlot.push(0);
    function T(v, i) { return touched[v + ':' + i]; }
    function attempt(fn, slot, v) {
      var snap = clone(V);
      if (fn() && !check(V, total).length) { added++; perSlot[slot]++; touched[v + ':' + slot] = 1; return true; }
      V = snap; return false;
    }
    function free(v, i) { return !T(v, i) && !T(v, i - 1) && !T(v, i + 1); }
    // 掛留（4-3、7-6、9-8；只在上方聲部）：上一拍預備，同音延留到這一拍前半，下行級進解決
    for (var j = 1; j < n; j++) {
      if (ph[j] !== ph[j - 1] || durs[j] < 1 || R() > 0.35) continue;
      if (/^(N|It|Fr|Ger)/.test(seq[j])) continue;   // 拿坡里上不放掛留（數字寫法另議）
      var cadential = ferm[j] || (j + 1 < n && ferm[j + 1] && ph[j + 1] === ph[j]);
      if (!cadential && R() > 0.4) continue;
      var vs = shuffle([0, 1, 2], R);
      for (var vi = 0; vi < vs.length; vi++) {
        var v = vs[vi], ka = idx(V, v, starts[j - 1]), kb = idx(V, v, starts[j]);
        if (ka < 0 || kb < 0 || kb !== ka + 1 || !free(v, j)) continue;
        var a = V[v][ka], b = V[v][kb];
        if (!(a.m - b.m >= 1 && a.m - b.m <= 2) || mod(a.L - b.L, 7) !== 1 || a.k !== 'ct' || b.k !== 'ct') continue;
        var bass = at(V, 3, starts[j]).m, ivl = mod(a.m - bass, 12);
        if ([5, 10, 11, 1, 2].indexOf(ivl) < 0) continue;
        var clash = false;
        for (var u = 0; u < 3; u++) if (u !== v && mod(at(V, u, starts[j]).m, 12) === mod(b.m, 12)) clash = true;
        if (clash) continue;
        var ok = attempt((function (v, ka, kb) { return function () {
          var A = V[v][ka], B = V[v][kb], h = B.d / 2;
          A.tie = true; split(V, v, kb, [[h, A.m, A.L, 'sus'], [h, B.m, B.L, 'res']]); return true; }; })(v, ka, kb), j, v);
        if (ok) { noask[j] = 1; break; }
      }
    }
    // 女高音先現音（句尾 V→I）
    for (j = 0; j < n - 1; j++) {
      if (!(ferm[j + 1] && ph[j + 1] === ph[j] && /^V7?$/.test(seq[j]) && durs[j] === 1) || R() > 0.45) continue;
      var k1 = idx(V, 0, starts[j]), k2 = idx(V, 0, starts[j + 1]);
      if (k1 < 0 || k2 < 0 || !free(0, j)) continue;
      var A1 = V[0][k1], B1 = V[0][k2], dd = Math.abs(A1.m - B1.m);
      if (dd >= 1 && dd <= 2 && A1.d === 1)
        attempt((function (k1, A1, B1) { return function () { split(V, 0, k1, [[0.5, A1.m, A1.L, 'ct'], [0.5, B1.m, B1.L, 'ant']]); return true; }; })(k1, A1, B1), j, 0);
    }
    // 一般和聲外音：逐拍（不出強拍經過音、倚音）
    var OPS = { 0: ['pass', 'neigh', 'pass16', 'escape'], 1: ['pass', 'neigh', 'pass16'], 2: ['pass', 'neigh', 'pass16'], 3: ['pass', 'pass', 'oct', 'pass16', 'neigh'] };
    var order = shuffle(Array.from({ length: n - 1 }, function (_, i) { return i; }), R);
    order.forEach(function (i) {
      if (ferm[i] || ph[i] !== ph[i + 1] || durs[i] !== 1) return;
      if (perSlot[i] >= 2 || R() > rate) return;
      var vlist = shuffle([3, 0, 1, 2, 3, 0], R);
      for (var q2 = 0; q2 < vlist.length; q2++) {
        var v = vlist[q2];
        if (T(v, i) || T(v, i - 1) || T(v, i + 1)) continue;
        var k = idx(V, v, starts[i]), kk = idx(V, v, starts[i + 1]);
        if (k < 0 || kk < 0 || V[v][k].d !== 1 || V[v][k].k !== 'ct' || V[v][kk].k !== 'ct') continue;
        var a = V[v][k], b = V[v][kk], d = b.m - a.m, dirn = d > 0 ? 1 : -1, lo = Math.min(a.m, b.m), hi = Math.max(a.m, b.m);
        var ops = shuffle(OPS[v], R), done = false;
        for (var oi = 0; oi < ops.length && !done; oi++) {
          var op = ops[oi], parts = null, p, p1, p2;
          if (op === 'pass' && (Math.abs(d) === 3 || Math.abs(d) === 4)) {
            p = step(a.m, a.L, dirn, scale);
            if (p && lo < p[0] && p[0] < hi && !avoid[mod(p[0], 12)]) parts = [[0.5, a.m, a.L, 'ct'], [0.5, p[0], p[1], 'pass']];
          } else if (op === 'pass16' && Math.abs(d) === 5) {
            p1 = step(a.m, a.L, dirn, scale); p2 = p1 && step(p1[0], p1[1], dirn, scale);
            if (p2 && lo < p1[0] && p1[0] < hi && lo < p2[0] && p2[0] < hi && !avoid[mod(p1[0], 12)] && !avoid[mod(p2[0], 12)])
              parts = [[0.5, a.m, a.L, 'ct'], [0.25, p1[0], p1[1], 'pass'], [0.25, p2[0], p2[1], 'pass']];
          } else if (op === 'neigh' && d === 0) {
            p = step(a.m, a.L, R() < 0.5 ? 1 : -1, scale);
            if (p && !avoid[mod(p[0], 12)]) {
              if (v !== 3 && R() < 0.3) parts = [[0.5, a.m, a.L, 'ct'], [0.25, p[0], p[1], 'neigh'], [0.25, a.m, a.L, 'ct']];
              else parts = [[0.5, a.m, a.L, 'ct'], [0.5, p[0], p[1], 'neigh']];
            }
          } else if (op === 'escape' && -d >= 1 && -d <= 2) {
            p = step(a.m, a.L, 1, scale);
            if (p && !avoid[mod(p[0], 12)]) parts = [[0.5, a.m, a.L, 'ct'], [0.5, p[0], p[1], 'esc']];
          } else if (op === 'oct' && v === 3) {
            var os = [-12, 12];
            for (var o = 0; o < 2; o++) { var m2 = a.m + os[o]; if (m2 >= 41 && m2 <= 60 && Math.abs(b.m - m2) <= 7) { parts = [[0.5, a.m, a.L, 'ct'], [0.5, m2, a.L, 'oct']]; break; } }
          }
          if (!parts) continue;
          if (attempt((function (v, k, parts) { return function () { split(V, v, k, parts); return true; }; })(v, k, parts), i, v)) done = true;
        }
        if (done && perSlot[i] >= 2) break;
        if (done && R() < 0.6) break;
      }
    });
    return { V: V, added: added, noAsk: Object.keys(noask).map(Number).sort(function (x, y) { return x - y; }) };
  }

  /* ---------- 數字低音（作者的寫法；依實際的音算） ---------- */
  var ACC = { '1': '♯', '-1': '♭', '0': '♮', '2': '𝄪', '-2': '𝄫' };
  var STD = { '': [], '6': [6], '64': [6, 4], '7': [7], '65': [6, 5], '43': [4, 3], '42': [4, 2] };
  function alter(m, L) { return mod(mod(m, 12) - LS[L] + 6, 12) - 6; }
  function dval(m, L) { var a = alter(m, L); return Math.floor((m - a - LS[L]) / 12) * 7 + L; }
  function notesAt(V, t) { var o = []; for (var v = 0; v < 4; v++) o.push(at(V, v, t)); return o; }
  function accMap(ns, KS) {
    var b = ns.reduce(function (p, x) { return dval(x.m, x.L) < dval(p.m, p.L) ? x : p; }), acc = {};
    ns.forEach(function (x) {
      var dv = dval(x.m, x.L) - dval(b.m, b.L), d = mod(dv, 7); if (dv === 0 || d === 0) return;
      var n = d + 1, a = alter(x.m, x.L);
      if (a !== (KS[x.L] || 0)) acc[n] = ACC[String(a)] || '';
    });
    return { acc: acc, bass: b };
  }
  function rowsFor(std, acc) {
    var rows = std.map(function (n) { return { n: n, a: acc[n] || '', key: n }; });
    Object.keys(acc).map(Number).forEach(function (n) { if (std.indexOf(n) < 0) rows.push({ n: n === 3 ? 0 : n, a: acc[n], key: n }); });
    rows.sort(function (x, y) { return y.key - x.key; });
    return rows;
  }
  function figures(q, V, k, KS) {
    var disp = q.display[k], main = disp.split('/')[0], sec = disp.slice(main.length);
    if (/^(It|Fr|Ger)/.test(main)) return { roman: main, special: 'aug', rows: [], sec: '' };
    if (main === 'N6') return { roman: 'N6', special: 'n6', rows: [], sec: '' };
    var mm = main.match(/(\d+)$/), dg = mm ? mm[1] : '', roman = main.slice(0, main.length - dg.length);
    var ns = notesAt(V, q.starts[k]), am = accMap(ns, KS), base = STD[dg] || [];
    var out = { roman: roman, sec: sec, rows: rowsFor(base, am.acc) };
    for (var v = 0; v < 3; v++) {
      var x = V[v].filter(function (e) { return e.slot === k && e.k === 'sus'; })[0];
      if (!x) continue;
      var r = V[v].filter(function (e) { return e.slot === k && e.k === 'res'; })[0], b = am.bass;
      var fa = mod(dval(x.m, x.L) - dval(b.m, b.L), 7) + 1; fa = { 1: 8, 2: 9 }[fa] || fa;
      var fb = mod(dval(r.m, r.L) - dval(b.m, b.L), 7) + 1; fb = { 1: 8 }[fb] || fb;
      var ra = alter(r.m, r.L), racc = ra !== (KS[r.L] || 0) ? ACC[String(ra)] : '';
      var sa = alter(x.m, x.L), sacc = sa !== (KS[x.L] || 0) ? ACC[String(sa)] : '';
      var std = base.filter(function (n) { return n !== fb; }).concat([fa]);
      std = std.filter(function (n, i) { return std.indexOf(n) === i; }).sort(function (p, q2) { return q2 - p; });
      var acc = {}, faS = fa > 7 ? fa - 7 : fa;
      Object.keys(am.acc).forEach(function (n) { n = +n; if (n !== faS && n !== fb) acc[n] = am.acc[n]; });
      if (sacc) acc[fa] = sacc;
      var rows = rowsFor(std, acc), ix = 0;
      rows.forEach(function (rw, i) { if (rw.key === fa) ix = i; });
      out.rows = rows;
      out.sus = { row: ix, res: { n: fb, a: racc }, t: r.t };   // 解決後的數字一律寫出來（例：V⁴ - 3𝄪/V）
      break;
    }
    return out;
  }

  /* ---------- 挖空：依「組」挑 ---------- */
  function base(s) { return /^(N|It|Fr|Ger)/.test(s) ? s : s.replace(/(64|65|43|42|6|7)?(\/.*)?$/, ''); }
  function isDom(s) { return /^(V|vii°|viiø)/.test(s) && s.indexOf('/') < 0; }
  function isTon(s) { return ['I', 'i', 'vi', 'VI'].indexOf(base(s)) >= 0; }
  function isPd(s) { return ['ii', 'ii°', 'iiø', 'IV', 'iv'].indexOf(base(s)) >= 0 || /^N/.test(s); }
  var BUNDLES = [
    [[/^[Ii]$/, /^vii°6$/, /^[Ii]6$/], '固定組合', 3], [[/^[Ii]6$/, /^vii°6$/, /^[Ii]$/], '固定組合', 3],
    [[/^[Ii]$/, /^V64$/, /^[Ii]6$/], '經過六四', 3], [[/^[Ii]6$/, /^V64$/, /^[Ii]$/], '經過六四', 3],
    [[/^(IV|iv)$/, /^[Ii]64$/, /^(IV|iv)6$/], '經過六四', 3], [[/^(IV|iv)6$/, /^[Ii]64$/, /^(IV|iv)$/], '經過六四', 3],
    [[/^[Ii]$/, /^(IV|iv)64$/, /^[Ii]$/], '持續六四', 3],
    [[/^[Ii]64$/, /^V7?$/, /^[Ii]$/], '終止六四', 3], [[/^[Ii]64$/, /^V7?$/], '終止六四', 3]
  ];
  function makeUnits(seq) {
    var n = seq.length, i = 0, U = [];
    while (i < n) {
      var hit = null;
      for (var b = 0; b < BUNDLES.length && !hit; b++) {
        var P = BUNDLES[b][0];
        if (i + P.length <= n && P.every(function (re, k) { return re.test(seq[i + k]); })) hit = [range(i, i + P.length), BUNDLES[b][1], BUNDLES[b][2]];
      }
      if (!hit && seq[i].indexOf('/') >= 0 && i + 1 < n) {
        var tgt = seq[i].split('/')[1];
        if (base(seq[i + 1]) === tgt || /^V/.test(seq[i + 1])) hit = [[i, i + 1], '副屬', 3];
      }
      if (!hit && /^N/.test(seq[i]) && i + 1 < n && /^(V|I|i)/.test(seq[i + 1])) hit = [[i, i + 1], '拿坡里', 3];
      if (!hit) hit = [[i], '單', /\d/.test(seq[i]) ? 1.3 : 1.0];
      U.push(hit); i = hit[0][hit[0].length - 1] + 1;
    }
    return U;
  }
  function range(a, b) { var o = []; for (var i = a; i < b; i++) o.push(i); return o; }
  function bassTieFree(V, starts, durs) {
    var B = V[3];
    return starts.map(function (s, i) {
      var e = s + durs[i];
      var tin = B.some(function (x) { return (x.t < s - EPS && s - EPS < x.t + x.d - 2 * EPS) || (Math.abs(x.t + x.d - s) < EPS && x.tie); });
      var tout = B.some(function (x) { return Math.abs(x.t + x.d - e) < EPS && x.tie; });
      return !(tin || tout);
    });
  }
  /* amount：'few'｜'mid'｜'many'（少／中／多） */
  function chooseBlanks(q, V, amount, R) {
    var ratio = { few: 0.25, mid: 0.5, many: 0.75 }[amount] || 0.5;
    var seq = q.seq, n = seq.length, bok = bassTieFree(V, q.starts, q.durs), na = {};
    q.noAsk.forEach(function (k) { na[k] = 1; });
    var elig = seq.map(function (_, i) { return bok[i] && !na[i] && i > 0 && i < n - 1; });
    var units = makeUnits(seq), maxL = ratio >= 0.75 ? 4 : 3, wins = [];
    for (var a = 0; a < units.length; a++) {
      var ks = [], w = 0, kinds = [];
      for (var b = a; b < units.length; b++) {
        ks = ks.concat(units[b][0]); w += units[b][2]; kinds.push(units[b][1]);
        if (ks.length > maxL) break;
        if (!ks.every(function (k) { return elig[k]; })) break;
        var phs = {}; ks.forEach(function (k) { phs[q.phraseOf[k]] = 1; });
        if (Object.keys(phs).length > 1) break;   // 不跨樂句
        if (ks.length >= 2) {
          var sc = w;
          for (var z = 0; z + 1 < ks.length; z++) {
            if (isPd(seq[ks[z]]) && isDom(seq[ks[z + 1]])) sc += 1;
            if (isDom(seq[ks[z]]) && isTon(seq[ks[z + 1]])) sc += 0.5;
          }
          wins.push({ ks: ks.slice(), kind: kinds.filter(function (x) { return x !== '單'; }).join('+') || '一般', w: sc });
        }
      }
    }
    var target = Math.round(ratio * n), picked = {}, cnt = 0, chosen = [], pool = wins.slice();
    while (pool.length && cnt < target) {
      var tot = 0; pool.forEach(function (x) { tot += x.w * x.w; });
      var r = R() * tot, gi = 0;
      for (; gi < pool.length - 1; gi++) { r -= pool[gi].w * pool[gi].w; if (r <= 0) break; }
      var g = pool.splice(gi, 1)[0];
      if (g.ks.some(function (k) { return picked[k] || picked[k - 1] || picked[k + 1]; })) continue;   // 組與組之間至少隔一個顯示的和絃
      if (cnt + g.ks.length > target + 1) continue;
      g.ks.forEach(function (k) { picked[k] = 1; }); cnt += g.ks.length; chosen.push(g);
    }
    chosen.sort(function (x, y) { return x.ks[0] - y.ks[0]; });
    return chosen;
  }

  /* ---------- 出題 ---------- */
  function make(deps) {
    var HE = deps.HE, KEYS = deps.KEYS;
    // 聖詠：第一轉位的重複音當硬規則（I6/IV6/V6 不重三音；ii6/vi6 重三音）。只改本頁這份引擎，四部和聲頁不受影響
    if (!HE.__choraleFI) {
      var orig = HE.rootTriadDoublingOK.bind(HE);
      HE.rootTriadDoublingOK = function (v, sym, prevSym, isMinor, keyOffset) {
        if (!orig(v, sym, prevSym, isMinor, keyOffset)) return false;
        var m = /^(I|i|IV|iv|V|ii|ii°|vi|VI)6$/.exec(sym || ''); if (!m) return true;
        var p = this.getChordPcs(sym, isMinor).map(function (x) { return (x + keyOffset) % 12; }), c = {};
        v.forEach(function (x) { var q = x % 12; c[q] = (c[q] || 0) + 1; });
        if (!p.every(function (x) { return c[x]; })) return false;
        return /^(ii|ii°|vi|VI)$/.test(m[1]) ? c[p[1]] === 2 : c[p[1]] === 1;
      };
      HE.__choraleFI = true;
    }
    var root = function (x) { return x.replace(/[0-9]/g, ''); };
    var PRE = /^((IV|iv|ii|ii°)(6|65|7|43|42)?|N6|V7?\/V|V65\/V|V43\/V|V42\/V|V6\/V)$/;

    function skeleton(cfg, R, keyObj) {
      var B = cfg.meter === '3/4' ? 3 : 4, isMin = keyObj.isMin, engLv = cfg.level + 1, T = isMin ? 'i' : 'I';
      var DENS = cfg.level >= 2 ? 0.45 : 1.0, pickup = cfg.pickup;
      function partition(n) {
        for (var t = 0; t < 200; t++) {
          var out = [], r = n;
          while (r > 0) { var w = R(), L = w < 0.5 ? 2 : (w < 0.8 ? 3 : 4); if (L > r) L = r; out.push(L); r -= L; }
          if (out.every(function (x) { return x >= 2; })) return out;
        }
        return [n];
      }
      function slots(L, first, fin) {
        var out = [];
        if (first && pickup) out.push(1);
        for (var b = 0; b < L; b++) {
          var last = b === L - 1;
          if (last && fin) out.push(pickup ? B - 1 : B);
          else if (last) { for (var k = 0; k < B - 2; k++) out.push(1); out.push(2); }
          else for (k = 0; k < B; k++) out.push(1);
        }
        return out;
      }
      function phraseOK(s, kind) {
        var n = s.length;
        for (var i = 0; i < n; i++) {
          var x = s[i], r = root(x), p = s[i - 1] || '', pr = root(p);
          if (/^(iii6|vi6|III6|VI6|iii64|vi64|VI64|III64)$/.test(x)) return false;
          if (/(7|65|43|42)/.test(x) && x.indexOf('/') < 0 && !/^(V|ii|ii°|vii°)$/.test(r)) return false;
          if (x === 'vii°6' && !((/^(I|i)$/.test(p) && /^(I|i)6$/.test(s[i + 1] || '')) || (/^(I|i)6$/.test(p) && /^(I|i)$/.test(s[i + 1] || '')))) return false;
          if (i > 0) {
            if (pr === 'V' && p.indexOf('/') < 0 && /^(IV|iv|ii|ii°)$/.test(r)) return false;
            if (/^(ii|ii°)$/.test(pr) && /^(I|i)$/.test(r)) return false;
            if (/^(I|i)6?$/.test(p) && /^(I|i)64$/.test(x)) return false;
            if (p === 'N6' && !((/^V/.test(x) && x.indexOf('/') < 0) || /^(I|i)64$/.test(x))) return false;
            if (i >= 2 && r === pr && r === root(s[i - 2])) return false;
          }
        }
        if (s.filter(function (x) { return /^(iii|III)$/.test(root(x)); }).length > 1) return false;
        if (kind === 'pac' || kind === 'final') { if (!(PRE.test(s[n - 3]) || /^(I|i)64$/.test(s[n - 3]))) return false; }
        if (kind === 'hc') { if (/^V/.test(s[n - 2]) && s[n - 2].indexOf('/') < 0) return false; }
        return true;
      }
      for (var attempt = 0; attempt < 60; attempt++) {
        var phr = partition(cfg.bars), seq = [], durs = [], ferm = [], phraseOf = [], kinds = [], okAll = true, startWith = null;
        for (var p = 0; p < phr.length; p++) {
          var fin = p === phr.length - 1, d = slots(phr[p], p === 0, fin), n = d.length;
          var kind = fin ? 'final' : (function () { var w = R(); if (engLv >= 4 && w < 0.25) return 'sec'; if (w < 0.5) return 'hc'; if (w < 0.8) return 'pac'; return 'dc'; })();
          var got = null;
          for (var k = 0; k < 400 && !got; k++) {
            var s;
            if (kind === 'hc' || kind === 'sec') s = HE.generateSkeleton(n + 1, isMin, engLv, DENS).slice(0, n);
            else s = HE.generateSkeleton(n, isMin, engLv, DENS);
            s = s.map(function (x) { return ({ 'iii6': 'iii', 'vi6': 'vi', 'III6': 'III', 'VI6': 'VI' })[x] || x; });
            if (kind === 'hc') s[n - 1] = 'V';
            else if (kind === 'sec') { s[n - 1] = (!isMin && R() < 0.3) ? 'V/vi' : 'V/V'; if (/^V/.test(s[n - 2])) continue; }
            else if (kind === 'dc') { s[n - 2] = R() < 0.5 && engLv >= 3 ? 'V7' : 'V'; s[n - 1] = isMin ? 'VI' : 'vi'; }
            else if (kind === 'pac') { s[n - 2] = 'V'; s[n - 1] = T; }
            else {
              if (n >= 5 && R() < 0.65 && PRE.test(s[n - 4])) s[n - 3] = isMin ? 'i64' : 'I64';
              s[n - 2] = (engLv >= 3 && R() < 0.7) ? 'V7' : 'V';
              s[n - 1] = (isMin && engLv >= 4 && R() < 0.3) ? 'I' : T;   // 畢卡第三度（Lv.3）
            }
            if (startWith) s[0] = startWith;
            if (!phraseOK(s, kind)) continue;
            var trial = seq.concat(s);
            if (!HE.skeletonOK(trial, isMin, Math.min(engLv, 3))) continue;
            var sol = HE.solveVoiceLeading(trial, isMin, keyObj.off);
            if (!sol) continue;
            if (fin && sol[sol.length - 1][0] % 12 !== keyObj.off) continue;   // 最後女高音回到主音
            got = s;
          }
          if (!got) { okAll = false; break; }
          for (k = 0; k < n; k++) { seq.push(got[k]); durs.push(d[k]); ferm.push(k === n - 1); phraseOf.push(p); }
          kinds.push(kind);
          startWith = (kind === 'sec') ? (got[n - 1] === 'V/vi' ? 'vi' : 'V') : null;
        }
        if (!okAll) continue;
        if (!HE.skeletonOK(seq, isMin, engLv)) continue;
        var v = HE.solveVoiceLeading(seq, isMin, keyObj.off);
        if (!v) continue;
        var tl = 'CDEFGAB'.indexOf(keyObj.vfk[0].toUpperCase());
        var letters = v.map(function (ch, i) { return ch.map(function (m) { return deps.letterIndexOfTone(m % 12, seq[i], keyObj.off, keyObj.name, tl); }); });
        var starts = [], t0 = 0; durs.forEach(function (x) { starts.push(t0); t0 += x; });
        return { key: keyObj, meter: cfg.meter, beats: B, bars: cfg.bars, level: cfg.level, pickup: pickup, phrases: phr, kinds: kinds,
                 seq: seq, durs: durs, starts: starts, total: t0, ferm: ferm, phraseOf: phraseOf, voicings: v, letters: letters,
                 display: seq.map(function (x) { return deps.displayChord ? deps.displayChord(x, isMin) : x; }) };
      }
      return null;
    }

    /* cfg：{ level 1–3, keyPref 'mix'|'major'|'minor', bars, meter '4/4'|'3/4', pickup, amount 'few'|'mid'|'many', seed } */
    function generate(cfg) {
      var R = rng(cfg.seed != null ? cfg.seed : Math.floor(Math.random() * 4294967296));
      for (var tries = 0; tries < 40; tries++) {
        var pool = KEYS.filter(function (k) { return cfg.keyPref === 'major' ? !k.isMin : cfg.keyPref === 'minor' ? k.isMin : true; });
        var keyObj = pick(pool, R);
        var q = skeleton(cfg, R, keyObj);
        if (!q) continue;
        var bt = build(q);
        if (check(bt.V, bt.total).length) continue;   // 例如反向八度：出題引擎允許、聖詠不允許 → 重出
        var best = null;
        for (var s = 0; s < 12; s++) {
          var dec = decorate(q, 0.75, Math.floor(R() * 4294967296));
          if (!dec) break;
          if (!best || dec.added > best.added) best = dec;
          if (dec.added >= q.bars * 1.6) break;
        }
        if (!best) continue;
        q.V = best.V; q.noAsk = best.noAsk; q.nct = best.added;
        var KS = {};
        keyObj.sigs.forEach(function (sg) { KS['CDEFGAB'.indexOf(sg[0])] = sg[1] === '#' ? 1 : -1; });
        q.figs = q.seq.map(function (_, k) { return figures(q, q.V, k, KS); });
        q.groups = chooseBlanks(q, q.V, cfg.amount, R);
        q.blank = {}; q.groups.forEach(function (g) { g.ks.forEach(function (k) { q.blank[k] = 1; }); });
        q.bassOn = q.starts.map(function (s) { return at(q.V, 3, s); });   // 每格拍點上的低音（正解）
        q.errors = check(q.V, q.total);
        return q;
      }
      return null;
    }
    return { generate: generate };
  }

  root.ChoraleGen = { make: make, check: check, build: build, rng: rng, chooseBlanks: chooseBlanks, figures: figures };
})(typeof window !== 'undefined' ? window : globalThis);
