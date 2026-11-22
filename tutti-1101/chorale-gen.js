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
  function check(V, total, ferm) {   // ferm：延長記號（跨過延長記號、下一句重新開始時，不檢查旋律跳進）
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
    // 掛留解決、低音八度跳的那一刻，其他聲部不可唱同一個音高
    for (v = 0; v < 4; v++) V[v].forEach(function (e) {
      if (e.k !== 'res' && e.k !== 'oct') return;
      for (var u = 0; u < 4; u++) if (u !== v && at(V, u, e.t).m === e.m) errs.push(['解決／八度跳同度', e.t, v, u]);
    });
    // 掛留延留的那一拍，和其他聲部不可形成增二度或減七度（例如小調 V 上延留降六級對導音）
    for (v = 0; v < 4; v++) V[v].forEach(function (e) {
      if (e.k !== 'sus') return;
      for (var u = 0; u < 4; u++) {
        if (u === v) continue;
        var o = at(V, u, e.t), dd = mod(o.m - e.m, 12), ll = mod(o.L - e.L, 7);
        if ((dd === 3 && ll === 1) || (dd === 9 && ll === 6) || (dd === 9 && ll === 1) || (dd === 3 && ll === 6)) errs.push(['掛留增二度', e.t, v, u]);
      }
    });
    for (v = 0; v < 4; v++) {
      var ns = V[v];
      for (i = 0; i + 1 < ns.length; i++) {
        var A = ns[i], B = ns[i + 1], d = Math.abs(B.m - A.m), ld = Math.min(mod(B.L - A.L, 7), mod(A.L - B.L, 7));
        if (ferm && ferm[A.slot] && B.slot !== A.slot) continue;
        if (d === 3 && ld === 1) errs.push(['增二度', A.t, v]);
        if (v < 3 && d === 6) errs.push(['三全音跳進', A.t, v]);
        if (v < 3 && d > 7) errs.push(['大跳', A.t, v]);
        if (v === 3 && d === 6) errs.push(['低音三全音', A.t]);
        // 女高音不可用同音名半音（例如 C → C♯）直接進入延長記號
        if (v === 0 && ferm && ferm[B.slot] && B.slot !== A.slot && A.L === B.L && A.m !== B.m) errs.push(['同音名半音進延長記號', B.t]);
        // 女高音跳四、五度之後一定要反向（作者規則；延留到下一拍的掛留除外）
        var C = ns[i + 2];
        if (v === 0 && (d === 5 || d === 7) && C && !B.tie && !(ferm && ferm[B.slot] && C.slot !== B.slot)) {
          var m1 = B.m - A.m, m2 = C.m - B.m;
          if (m2 === 0 || Math.sign(m2) === Math.sign(m1)) errs.push(['跳進後未反向', B.t, v]);
        }
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
  var MEL = { rep: 3.5, leap: 1.2, tpl: 1.5, back: 0.8, join: 2, run: 1.0 };
  var NEIGH_P = 0.25, ANT_P = 0.2, SUS_P = 0.42, SUS_MID = 0.5;
  function decorate(q, rate, seed) {
    var R = rng(seed), bt = build(q), V = bt.V, total = bt.total;
    if (check(V, total, q.ferm).length) return null;
    var off = q.key.off, isMin = q.key.isMin, scale = scaleOf(off, isMin);
    var n = q.seq.length, durs = q.durs, ferm = q.ferm, ph = q.phraseOf, seq = q.seq, starts = q.starts;
    var avoid = {}; if (isMin) [8, 9, 10, 11].forEach(function (x) { avoid[(off + x) % 12] = 1; });
    var added = 0, perSlot = [], touched = {}, noask = {};
    for (var z = 0; z < n; z++) perSlot.push(0);
    // 拿坡里到終止要乾淨：N6、後面接的 I64、V 都不加和聲外音、掛留、八度跳（作者規則）
    var clean = {};
    for (z = 0; z < n; z++) if (seq[z] === 'N6') {
      clean[z] = 1;
      for (var w = z + 1; w < n && (/^(I|i)64$/.test(seq[w]) || (/^V/.test(seq[w]) && seq[w].indexOf('/') < 0)); w++) clean[w] = 1;
    }
    // 終止處（句尾延長記號前一個和絃、I64→V 的 I64）：低音八度跳只能往下
    function cadAt(i) { return (i + 1 < n && ferm[i + 1] && ph[i + 1] === ph[i]) || (/^(I|i)64$/.test(seq[i]) && /^V/.test(seq[i + 1] || '') && seq[i + 1].indexOf('/') < 0); }
    // 調內每個音的音名（例如 d♯ 小調的 F 音 = E♯）
    var TL = 'CDEFGAB'.indexOf(q.key.vfk[0].toUpperCase()), ST = isMin ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11], keyL = {};
    for (z = 0; z < 7; z++) keyL[(off + ST[z]) % 12] = (TL + z) % 7;
    // 和聲外音不可抵消同拍和絃的變化音（例如和絃有 E♮，同一拍不可出現 E♯／F♮）
    function chromOK() {
      for (var v = 0; v < 4; v++) for (var i = 0; i < V[v].length; i++) {
        var e = V[v][i]; if (!/^(pass|neigh|esc)$/.test(e.k)) continue;
        var kl = keyL[mod(e.m, 12)];
        for (var u = 0; u < 4; u++) for (var r = 0; r < V[u].length; r++) {
          var c = V[u][r]; if (c.slot !== e.slot || !/^(ct|res|oct)$/.test(c.k)) continue;
          var di = mod(e.m - c.m, 12);
          if ((di === 1 || di === 11) && (e.L === c.L || kl === c.L)) return false;
        }
      }
      return true;
    }
    function T(v, i) { return touched[v + ':' + i]; }
    function attempt(fn, slot, v) {
      var snap = clone(V);
      if (fn() && chromOK() && !check(V, total, ferm).length) { added++; perSlot[slot]++; touched[v + ':' + slot] = 1; return true; }
      V = snap; return false;
    }
    function free(v, i) { return !T(v, i) && !T(v, i - 1) && !T(v, i + 1); }
    // 掛留（4-3、7-6、9-8；只在上方聲部）：上一拍預備，同音延留到這一拍前半，下行級進解決
    for (var j = 1; j < n; j++) {
      if (ph[j] !== ph[j - 1] || durs[j] < 1 || R() > SUS_P) continue;
      if (/^(N|It|Fr|Ger)/.test(seq[j]) || clean[j] || (q.seqAt >= 0 && j >= q.seqAt && j <= q.seqAt + 3)) continue;   // 拿坡里上、N6 之後到終止、模進裡都不放掛留
      var cadential = ferm[j] || (j + 1 < n && ferm[j + 1] && ph[j + 1] === ph[j]);
      if (!cadential && R() > SUS_MID) continue;
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
    // 女高音先現音（句尾 V→I；機率低、一題最多一個）
    var antDone = false;
    for (j = 0; j < n - 1 && !antDone; j++) {
      if (!(ferm[j + 1] && ph[j + 1] === ph[j] && /^V7?$/.test(seq[j]) && durs[j] === 1) || clean[j] || (q.seqAt >= 0 && j >= q.seqAt && j <= q.seqAt + 3) || R() > ANT_P) continue;
      var k1 = idx(V, 0, starts[j]), k2 = idx(V, 0, starts[j + 1]);
      if (k1 < 0 || k2 < 0 || !free(0, j)) continue;
      var A1 = V[0][k1], B1 = V[0][k2], dd = Math.abs(A1.m - B1.m);
      if (dd >= 1 && dd <= 2 && A1.d === 1)
        antDone = attempt((function (k1, A1, B1) { return function () { split(V, 0, k1, [[0.5, A1.m, A1.L, 'ct'], [0.5, B1.m, B1.L, 'ant']]); return true; }; })(k1, A1, B1), j, 0);
    }
    // 一般和聲外音：逐拍（不出強拍經過音、倚音）
    var OPS = { 0: ['pass', 'neigh', 'pass16', 'escape'], 1: ['pass', 'neigh', 'pass16'], 2: ['pass', 'neigh', 'pass16'], 3: ['pass', 'pass', 'oct', 'pass16', 'neigh'] };
    // 模進：四個和絃分成前後兩組。後一組照前一組加一樣節奏、一樣方向的和聲外音（四個聲部都比照）
    var sq = q.seqAt >= 0 ? q.seqAt : -99;
    function inSeq(i) { return i >= sq && i <= sq + 3; }
    function mk(op, v, i, fdir) {   // 依這一拍到下一拍的走向，做出一個和聲外音（fdir：指定方向，模進照抄用）
      var k = idx(V, v, starts[i]), kk = idx(V, v, starts[i + 1]);
      if (k < 0 || kk < 0 || V[v][k].d !== 1 || V[v][k].k !== 'ct' || V[v][kk].k !== 'ct') return null;
      var a = V[v][k], b = V[v][kk], d = b.m - a.m, dirn = d > 0 ? 1 : -1, lo = Math.min(a.m, b.m), hi = Math.max(a.m, b.m), p, p1, p2;
      if (fdir !== undefined && op !== 'neigh' && op !== 'oct' && op !== 'escape' && dirn !== fdir) return null;
      if (op === 'pass' && (Math.abs(d) === 3 || Math.abs(d) === 4)) {
        p = step(a.m, a.L, dirn, scale);
        if (p && lo < p[0] && p[0] < hi && !avoid[mod(p[0], 12)]) return { k: k, dir: dirn, parts: [[0.5, a.m, a.L, 'ct'], [0.5, p[0], p[1], 'pass']] };
      } else if (op === 'pass16' && Math.abs(d) === 5) {
        p1 = step(a.m, a.L, dirn, scale); p2 = p1 && step(p1[0], p1[1], dirn, scale);
        if (p2 && lo < p1[0] && p1[0] < hi && lo < p2[0] && p2[0] < hi && !avoid[mod(p1[0], 12)] && !avoid[mod(p2[0], 12)])
          return { k: k, dir: dirn, parts: [[0.5, a.m, a.L, 'ct'], [0.25, p1[0], p1[1], 'pass'], [0.25, p2[0], p2[1], 'pass']] };
      } else if (op === 'neigh' && d === 0) {   // 鄰音一律一顆八分音符（不用十六分音符）
        // 巴哈多用下鄰音（女高音約 95%、其他聲部約 82%），而且是小二度；上鄰音偶爾用
        var nd = fdir !== undefined ? fdir : (R() < (v === 0 ? 0.95 : 0.82) ? -1 : 1);
        if (nd === -1) {   // 下鄰音一律用調內音（小調主音的下鄰音用導音），不加調外臨時記號
          if (isMin && mod(a.m - off, 12) === 0) return { k: k, dir: -1, parts: [[0.5, a.m, a.L, 'ct'], [0.5, a.m - 1, mod(a.L - 1, 7), 'neigh']] };
          p = step(a.m, a.L, -1, scale);
          if (p && !avoid[mod(p[0], 12)]) return { k: k, dir: -1, parts: [[0.5, a.m, a.L, 'ct'], [0.5, p[0], p[1], 'neigh']] };
          return null;
        }
        p = step(a.m, a.L, 1, scale);
        if (p && !avoid[mod(p[0], 12)]) return { k: k, dir: 1, parts: [[0.5, a.m, a.L, 'ct'], [0.5, p[0], p[1], 'neigh']] };
      } else if (op === 'escape' && -d >= 1 && -d <= 2) {
        p = step(a.m, a.L, 1, scale);
        if (p && !avoid[mod(p[0], 12)]) return { k: k, dir: 1, parts: [[0.5, a.m, a.L, 'ct'], [0.5, p[0], p[1], 'esc']] };
      } else if (op === 'oct' && v === 3) {
        var os = fdir !== undefined ? [fdir * 12] : (cadAt(i) ? [-12] : [-12, 12]);
        for (var o = 0; o < os.length; o++) { var m2 = a.m + os[o]; if (m2 >= 41 && m2 <= 60 && Math.abs(b.m - m2) <= 7 && !(cadAt(i) && os[o] > 0)) return { k: k, dir: Math.sign(os[o]), parts: [[0.5, a.m, a.L, 'ct'], [0.5, m2, a.L, 'oct']] }; }
      }
      return null;
    }
    var order = shuffle(Array.from({ length: n - 1 }, function (_, i) { return i; }), R);
    order.forEach(function (i) {
      if (ferm[i] || ph[i] !== ph[i + 1] || durs[i] !== 1 || clean[i]) return;
      if (inSeq(i) && i !== sq) return;   // 模進裡只在第一個和絃決定，後一組照抄；兩組之間、模進結尾不加
      if (perSlot[i] >= 2 || R() > rate) return;
      var i2 = sq + 2, pairOK = i === sq && !ferm[i2] && ph[i2] === ph[i2 + 1] && durs[i2] === 1 && !clean[i2];
      if (i === sq && !pairOK) return;
      var vlist = shuffle([3, 0, 1, 2, 3, 0], R);
      for (var q2 = 0; q2 < vlist.length; q2++) {
        var v = vlist[q2];
        if (T(v, i) || T(v, i - 1) || T(v, i + 1)) continue;
        var ops = shuffle(OPS[v], R).sort(function (x, y) { return (/^pass/.test(y) ? 1 : 0) - (/^pass/.test(x) ? 1 : 0); }), done = false;   // 先試經過音
        for (var oi = 0; oi < ops.length && !done; oi++) {
          var op = ops[oi];
          if (op === 'neigh' && R() >= NEIGH_P) continue;   // 鄰音減少
          var r1 = mk(op, v, i);
          if (!r1) continue;
          if (i !== sq) {
            if (attempt((function (v, k, parts) { return function () { split(V, v, k, parts); return true; }; })(v, r1.k, r1.parts), i, v)) done = true;
            continue;
          }
          // 模進：前後兩組一起加，任何一組不合規則就都不加
          if (attempt((function (v, op, r1) { return function () {
            split(V, v, r1.k, r1.parts);
            var r2 = mk(op, v, i2, r1.dir);
            if (!r2) return false;
            split(V, v, r2.k, r2.parts); return true; }; })(v, op, r1), i, v)) { done = true; perSlot[i2]++; touched[v + ':' + i2] = 1; }
        }
        if (done && perSlot[i] >= 2) break;
        if (done && R() < 0.6) break;
      }
    });
    // 同一小節、同一聲部出現兩個一模一樣的下鄰音：保留後面那個（靠近延長記號），前一個改成上鄰音；改了不合規則就拿掉
    var PK = q.pickup ? 1 : 0, BT = q.beats;
    function barOf(t) { return Math.floor((t - PK + EPS) / BT); }
    function nIdx(v, t) { return V[v].findIndex(function (x) { return Math.abs(x.t - t) < EPS && x.k === 'neigh'; }); }
    function unNeigh(v, t) { var k = nIdx(v, t); if (k < 1) return false; V[v][k - 1].d += V[v][k].d; V[v].splice(k, 1); added--; return true; }
    function okNow() { return chromOK() && !check(V, total, ferm).length; }
    for (var vv = 0; vv < 4; vv++) {
      var groups = {};
      V[vv].forEach(function (e, k) { if (e.k === 'neigh' && k > 0 && e.m < V[vv][k - 1].m) { var key = barOf(e.t) + ':' + V[vv][k - 1].m + ':' + e.m; (groups[key] = groups[key] || []).push({ t: e.t, slot: e.slot }); } });
      Object.keys(groups).forEach(function (key) {
        var g = groups[key]; if (g.length < 2) return;
        g.sort(function (x, y) { return x.t - y.t; });
        var last = g[g.length - 1];
        for (var gi = 0; gi < g.length - 1; gi++) {
          var snap = clone(V), x = g[gi];
          if (inSeq(x.slot)) {   // 前一個在模進裡：為了保持模進一致，改拿掉後面那個
            if (!(unNeigh(vv, last.t) && okNow())) V = snap;
            return;
          }
          var k = nIdx(vv, x.t), a0 = V[vv][k - 1], up = step(a0.m, a0.L, 1, scale), ok = false;
          if (up && !avoid[mod(up[0], 12)]) { V[vv][k] = Object.assign({}, V[vv][k], { m: up[0], L: up[1] }); ok = okNow(); }
          if (!ok) { V = snap; if (!(unNeigh(vv, x.t) && okNow())) V = snap; }
        }
      });
    }
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
    var oct = {}; V[3].forEach(function (e) { if (e.k === 'oct') oct[e.slot] = 1; });   // 低音拍中八度跳的拍子不挖空
    var elig = seq.map(function (_, i) { return bok[i] && !na[i] && !oct[i] && i > 0 && i < n - 1; });
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
      // 聖詠的句尾會出現「三和絃」的副屬（V/V、V/vi）；四部和聲的副屬一律是七和絃，引擎因此固定回傳四個音。
      // 這裡只在本頁的引擎上補一條：沒有七和絃數字的副屬只取三個音（否則會寫成缺三音的七和絃）
      var origPcs = HE.getChordPcs;
      HE.getChordPcs = function (sym, isMinor) {
        var p = origPcs.call(this, sym, isMinor);
        if (sym && sym.indexOf('/') >= 0 && !/7|65|43|42/.test(sym)) return p.slice(0, 3);
        return p;
      };
      HE.__choraleFI = true;
      HE.__cadP = 0.07;   // ii65／ii43 → I64 → V7 → I 終止公式：聖詠每一句都有終止，機率調低避免每句都一樣
    }
    var root = function (x) { return x.replace(/[0-9]/g, ''); };
    /* 女高音的音級（1～7；其他半音回傳 0） */
    function degOf(m, keyObj) {
      var d = mod(m - keyObj.off, 12);
      var T = keyObj.isMin ? { 0: 1, 2: 2, 3: 3, 5: 4, 7: 5, 8: 6, 9: 6, 10: 7, 11: 7 } : { 0: 1, 2: 2, 4: 3, 5: 4, 7: 5, 9: 6, 11: 7 };
      return T[d] || 0;
    }
    /* 延長記號處的女高音：停在 3 音或 5 音最多連續兩次（作者規則） */
    function fermDegOK(degs) {
      for (var i = 2; i < degs.length; i++)
        if ((degs[i] === 3 || degs[i] === 5) && (degs[i - 1] === 3 || degs[i - 1] === 5) && (degs[i - 2] === 3 || degs[i - 2] === 5)) return false;
      return true;
    }
    var PRE = /^((IV|iv|ii|ii°)(6|65|7|43|42)?|N6|V7?\/V|V65\/V|V43\/V|V42\/V|V6\/V)$/;

    /* 同樣兩個和絃（不論轉位）不可 A–B–A–B 來回；A–B–A（輔助、經過）可以 */
    function noSwing(s) {
      for (var i = 3; i < s.length; i++) {
        var a = root(s[i]), b = root(s[i - 1]);
        if (a !== b && a === root(s[i - 2]) && b === root(s[i - 3])) return false;
      }
      return true;
    }
    function skeleton(cfg, R, keyObj) {
      var B = cfg.meter === '3/4' ? 3 : 4, isMin = keyObj.isMin, engLv = cfg.level + 1, T = isMin ? 'i' : 'I';
      var DENS = cfg.level >= 2 ? 1.0 : 1.0, pickup = !!cfg.pickup;   // 七和絃密度（v111.6 提高）
      var bars = cfg.bars + (cfg.bars % 2);   // 樂句工整：只出偶數小節
      /* 句尾的延長記號（巴哈聖詠的統計比例）：[句尾那一小節的時值, 下一句的弱起拍數, 機率]
         4/4：第三拍四分音符（下一句第四拍弱起）、第三拍二分音符、第一拍二分音符（下一句第三拍弱起）、第一拍附點二分音符（第四拍弱起）
         3/4：第一拍附點二分音符、第一拍二分音符（第三拍弱起）、第三拍四分音符 */
      var ENDS = B === 4 ? [[[1, 1, 1], 1, 0.5], [[1, 1, 2], 0, 0.2], [[2], 2, 0.15], [[3], 1, 0.15]]
                         : [[[3], 0, 0.45], [[2], 1, 0.45], [[1, 1, 1], 0, 0.1]];
      function pickEnd() { var w = R(), acc = 0; for (var i = 0; i < ENDS.length; i++) { acc += ENDS[i][2]; if (w < acc) return ENDS[i]; } return ENDS[0]; }
      /* 前後句規劃：前樂句多停在 V（半終止），後樂句回到 I；中段可停在其他級數（副屬＝暫時轉調） */
      function planKinds(m) {
        var ks = [];
        for (var i = 0; i < m; i++) {
          var w = R(), k;
          if (i === m - 1) k = 'final';
          else if (i === 0) k = engLv >= 4 && w < 0.15 ? 'sec' : (w < 0.25 ? 'sd' : 'hc');
          else if (i % 2 === 0) k = engLv >= 4 && w < 0.2 ? 'sec' : (w < 0.35 ? 'sd' : (w < 0.55 ? 'dc' : 'hc'));
          else k = engLv >= 4 && w < 0.3 ? 'ton' : (w < 0.55 ? 'dc' : 'pac');
          if (i > 0 && k !== 'final' && k === ks[i - 1]) k = i % 2 ? 'pac' : 'hc';   // 相鄰兩句不用同一種終止
          ks.push(k);
        }
        return ks;
      }
      /* 模進（Lv.2 起；Lv.3 可用副屬串）：四個和絃根音五度下行，女高音同一個動機往下移一級 */
      function seqPatterns() {
        // 和聲引擎要保持共同音，能寫出「女高音同一個動機往下移一級」的組合都先驗證過：[和絃, 女高音音位（0 根音、1 三音、2 五音）可用的組合]
        var P = isMin ? [[['VI', 'ii°6', 'V', 'i'], [[1, 0], [2, 1]]], [['VI', 'ii°6', 'V', 'i6'], [[1, 0], [2, 1]]]]
                      : [[['vi', 'ii6', 'V', 'I'], [[1, 0], [2, 1]]], [['vi', 'ii6', 'V7', 'I'], [[1, 0]]], [['vi', 'ii6', 'V', 'I6'], [[1, 0], [2, 1]]]];
        if (engLv >= 4) P = P.concat(isMin ? [[['V7/iv', 'iv', 'V7/III', 'III'], [[1, 0]]]] : [[['V7/vi', 'vi', 'V7/V', 'V'], [[1, 0]]], [['V/vi', 'vi', 'V/V', 'V'], [[1, 0]]]]);
        return P;
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
            if (/^(ii|ii°)$/.test(pr) && /^(I|i)$/.test(r) && !/64$/.test(x)) return false;   // ii → I 不行；ii → 終止六四可以
            if (/^(I|i)6?$/.test(p) && /^(I|i)64$/.test(x)) return false;
            if (p === 'N6' && !((/^V/.test(x) && x.indexOf('/') < 0) || /^(I|i)64$/.test(x))) return false;
            if (i >= 2 && r === pr && r === root(s[i - 2])) return false;
          }
        }
        if (s.filter(function (x) { return /^(iii|III)$/.test(root(x)); }).length > 1) return false;
        if (!noSwing(s)) return false;
        // N6 只用在終止前（作者規則）：N6 → V → 句尾 I／vi（假終止）、N6 → I64 → V → 句尾 I、N6 → I64 → V（延宕半終止）
        var isV = function (x) { return /^V7?$/.test(x || ''); }, is64 = function (x) { return /^(I|i)64$/.test(x || ''); };
        for (i = 0; i < n; i++) {
          if (s[i] !== 'N6') continue;
          var okN = (isV(s[i + 1]) && i + 2 === n - 1 && (kind === 'pac' || kind === 'final' || kind === 'dc'))
                 || (is64(s[i + 1]) && isV(s[i + 2]) && i + 3 === n - 1 && (kind === 'pac' || kind === 'final'))
                 || (is64(s[i + 1]) && isV(s[i + 2]) && i + 2 === n - 1 && kind === 'hc');
          if (!okN) return false;
        }
        if (kind === 'pac' || kind === 'final') { if (!(PRE.test(s[n - 3]) || /^(I|i)64$/.test(s[n - 3]))) return false; }
        if (kind === 'hc') { if (/^V/.test(s[n - 2]) && s[n - 2].indexOf('/') < 0) return false; if (s[n - 2] === 'N6') return false; }   // 半終止停在 V：前面不接 N6（N6 → i64 → V 可以）
        return true;
      }
      var memberPc = function (sym, idx) { var pc = HE.getChordPcs(sym, isMin); return (pc[idx] + keyObj.off) % 12; };
      /* 女高音旋律的成本：同音反覆扣分、跳進扣分、做出弧線（前段往上、後段往下） */
      /* 女高音旋律輪廓（每一句挑一種，相鄰兩句不同；後樂句偶爾模仿前樂句）
         d／u：往下／往上級進　D／U：往下／往上跳（三～五度）　h：保持　*：不限
         A 下行音階→往上跳→下行音階（E D C ↗ F E D）　B 上行到高點再下行　C 先往上跳再級進下行填補
         D 鄰音形態接下行（E F E D C）　E 先平穩、終止前級進下行 */
      function contour(id, n) {
        var t = [], m = n - 1, i;
        if (id === 'A') { for (i = 0; i < m; i++) t.push((i % 3 === 2 && i < m - 2) ? 'U' : 'd'); }
        else if (id === 'B') { var pk = Math.max(1, Math.round(m * 0.55)); for (i = 0; i < m; i++) t.push(i < pk ? 'u' : 'd'); }
        else if (id === 'C') { for (i = 0; i < m; i++) t.push(i === 0 || (m > 8 && i === 5) ? 'U' : 'd'); }
        else if (id === 'D') { for (i = 0; i < m; i++) t.push(i === 0 ? 'u' : 'd'); if (m > 6) { t[3] = 'u'; } }
        else { for (i = 0; i < m; i++) t.push(i === 0 ? 'h' : i === 1 ? 'u' : 'd'); }
        t[m - 1] = '*';   // 終止前最後一步交給終止規則
        return t;
      }
      function tplCost(w, mv) {
        var am = Math.abs(mv), sg = Math.sign(mv);
        if (w === '*') return 0;
        if (w === 'h') return am === 0 ? 0 : (am <= 2 ? 0.8 : 2);
        var dir = (w === 'u' || w === 'U') ? 1 : -1, leapW = (w === 'U' || w === 'D');
        if (am === 0) return 1.5;
        if (sg !== dir) return 2.5;
        if (leapW) return am >= 5 ? 0 : (am >= 3 ? 0.8 : 1.5);
        return am <= 2 ? 0 : (am <= 4 ? 0.5 : 2);   // 三度之後可用經過音填成級進
      }
      /* 女高音旋律的成本：照輪廓走；跳進扣分（輪廓要跳的地方除外）；同音反覆扣分；不在句尾最後一步跳四、五度 */
      function melodyCost(n, tpl) {
        return function (pv, tv, i, pp) {
          var mv = tv[0] - pv[0], am = Math.abs(mv), w = tpl ? tpl[i - 1] : '*', c = 0;
          // 抵銷引擎對女高音「少動、保持」的偏好（引擎的距離成本與保持優惠），旋律改由下面的規則決定
          c -= am; if (am === 0 && tv[1] !== pv[1]) c += 2;
          if (am === 0 && w !== 'h') c += MEL.rep;
          if (am >= 3 && w !== 'U' && w !== 'D') c += MEL.leap * (am >= 5 ? 2 : 1);
          if (am >= 5 && i === n - 1) c += 50;   // 跳進後要反向，句尾不能跳
          c += MEL.tpl * tplCost(w, mv);
          if (pp && am > 0 && pp[0] === tv[0]) c += MEL.back;   // 來回同兩個音（A–B–A）
          if (pp) { var pm = pv[0] - pp[0]; if (am >= 1 && am <= 2 && Math.abs(pm) >= 1 && Math.abs(pm) <= 2 && Math.sign(pm) === Math.sign(mv)) c -= MEL.run; }   // 同方向級進：音階線條
          return c;
        };
      }
      /* 兩句之間的銜接：上一句最後一個和絃 → 下一句第一個和絃 */
      function joinOK(pv, tv) {
        if (Math.abs(tv[0] - pv[0]) > 7 || Math.abs(tv[1] - pv[1]) > 7 || Math.abs(tv[2] - pv[2]) > 7 || Math.abs(tv[3] - pv[3]) > 12) return false;
        for (var i = 0; i < 4; i++) for (var j = i + 1; j < 4; j++) {
          if (pv[i] === tv[i] || pv[j] === tv[j]) continue;
          var a = mod(pv[i] - pv[j], 12), b = mod(tv[i] - tv[j], 12);
          if (a === b && (a === 0 || a === 7)) return false;
        }
        var s1 = tv[0] - pv[0], b1 = tv[3] - pv[3], o = mod(tv[0] - tv[3], 12);
        if (s1 * b1 > 0 && (o === 0 || o === 7) && Math.abs(s1) > 2) return false;
        if (tv[0] < pv[1] || tv[1] < pv[2] || tv[2] < pv[3] || tv[1] > pv[0] || tv[2] > pv[1] || tv[3] > pv[2]) return false;   // 聲部超越
        return true;
      }
      function joinCost(pv) {
        return function (tv) {
          var s1 = tv[0] - pv[0], b1 = Math.abs(tv[3] - pv[3]), c = 0;
          if (s1 === 0) c += 0; else if (Math.abs(s1) <= 2) c += 0.5; else if (s1 === 5 || s1 === 7) c += 0.5; else if (s1 === 3 || s1 === 4) c += 1; else c += 2.5;
          if (!(b1 === 0 || b1 === 12)) c += (b1 === 5 || b1 === 7) ? 1 : 2.5;
          return c * MEL.join;
        };
      }
      /* 解一句的聲部進行（掛鉤只在這裡設定，解完就拿掉） */
      function solvePhrase(trialSeq, s, prevLast, seqMark, lastFilter, tpl) {
        var n = s.length;
        HE.__extraCost = melodyCost(n, tpl); HE.__sopLeap = true; HE.__sopFree = true;
        HE.__startCost = prevLast ? joinCost(prevLast) : null;
        HE.__filterVoicings = function (all) {
          return all.map(function (vs, i) {
            var o = vs;
            if (i === 0 && prevLast) o = o.filter(function (v) { return joinOK(prevLast, v); });
            if (seqMark && seqMark[i] !== undefined) o = o.filter(function (v) { return v[0] % 12 === memberPc(s[i], seqMark[i]); });
            if (i === n - 1 && lastFilter) o = o.filter(lastFilter);
            return o;
          });
        };
        try { return HE.solveVoiceLeading(s, isMin, keyObj.off); }
        finally { HE.__extraCost = null; HE.__startCost = null; HE.__filterVoicings = null; HE.__sopLeap = false; HE.__sopFree = false; }
      }
      for (var attempt = 0; attempt < 60; attempt++) {
        var P = (B === 3 && bars % 4 === 0 && bars >= 8 && R() < 0.8) ? 4 : 2, m = bars / P;   // 4/4 一律兩小節一句；3/4 多半四小節
        var plan = planKinds(m), ends = [], ups = [pickup ? 1 : 0];
        for (var e = 0; e < m - 1; e++) { ends.push(pickEnd()); ups.push(ends[e][1]); }
        var seq = [], durs = [], ferm = [], phraseOf = [], kinds = [], okAll = true, startWith = null, fdeg = [], voic = [], seqDone = false, seqAt = -1, tpls = [], prevTpl = null;
        for (var p = 0; p < m; p++) {
          var fin = p === m - 1, d = [];
          for (var k = 0; k < ups[p]; k++) d.push(1);
          for (var bb = 0; bb < P - 1; bb++) for (k = 0; k < B; k++) d.push(1);
          if (fin) d.push(B - (pickup ? 1 : 0)); else d = d.concat(ends[p][0]);
          var n = d.length, kind = plan[p], got = null, gotV = null;
          // 旋律輪廓：後樂句有一半機會模仿前樂句（動機發展），其他時候和上一句不同
          var TPLS = ['A', 'B', 'C', 'D', 'E'], tplId;
          if (p % 2 === 1 && prevTpl && R() < 0.5) tplId = prevTpl;
          else { var cand = TPLS.filter(function (x) { return x !== prevTpl; }); tplId = cand[Math.floor(R() * cand.length)]; }
          for (k = 0; k < 400 && !got; k++) {
            var s;
            if (kind === 'hc' || kind === 'sec') s = HE.generateSkeleton(n + 1, isMin, engLv, DENS).slice(0, n);
            else s = HE.generateSkeleton(n, isMin, engLv, DENS);
            s = s.map(function (x) { return ({ 'iii6': 'iii', 'vi6': 'vi', 'III6': 'III', 'VI6': 'VI' })[x] || x; });
            if (kind === 'hc') s[n - 1] = 'V';
            else if (kind === 'sec') { s[n - 1] = isMin ? (R() < 0.4 ? 'V/III' : 'V/V') : (R() < 0.35 ? 'V/vi' : 'V/V'); if (/^V/.test(s[n - 2])) continue; }
            else if (kind === 'dc') { s[n - 2] = R() < 0.5 && engLv >= 3 ? 'V7' : 'V'; s[n - 1] = isMin ? 'VI' : 'vi'; }
            else if (kind === 'pac') {   // 正格終止：約一半用 V7，也可經終止六四
              if (n >= 5 && R() < 0.4 && PRE.test(s[n - 4])) s[n - 3] = isMin ? 'i64' : 'I64';
              s[n - 2] = (engLv >= 3 && R() < 0.6) ? 'V7' : 'V'; s[n - 1] = T;
            }
            else if (kind === 'sd') { s[n - 2] = T; s[n - 1] = isMin ? 'iv' : 'IV'; }
            else if (kind === 'ton') {   // 暫時轉調的終止：停在其他級數（不和上一句停在同一個和絃）
              var TG = isMin ? [['III', 0.5], ['VI', 0.2], ['iv', 0.15], ['V', 0.15]] : [['vi', 0.4], ['ii', 0.2], ['IV', 0.15], ['V', 0.25]];
              var prevEnd = seq.length ? seq[seq.length - 1] : '';
              TG = TG.filter(function (t) { return t[0] !== prevEnd; });
              var tw = R() * TG.reduce(function (a, t) { return a + t[1]; }, 0), x = TG[0][0];
              for (var ti = 0; ti < TG.length; ti++) { tw -= TG[ti][1]; if (tw < 0) { x = TG[ti][0]; break; } }
              s[n - 2] = (R() < 0.5 ? 'V7/' : 'V/') + x; s[n - 1] = x;
            }
            else {
              if (n >= 5 && R() < 0.65 && PRE.test(s[n - 4])) s[n - 3] = isMin ? 'i64' : 'I64';
              s[n - 2] = (engLv >= 3 && R() < 0.7) ? 'V7' : 'V';
              s[n - 1] = (isMin && engLv >= 4 && R() < 0.42) ? 'I' : T;   // 皮卡第終止（Lv.3，約四、五成）
            }
            if (startWith) s[0] = startWith;
            // 模進：一題最多一段，放在句子中段
            var seqMark = null;
            if (!seqDone && cfg.level >= 2 && n >= 9 && R() < 0.5) {
              var pats = seqPatterns(), pp = pats[Math.floor(R() * pats.length)], pat = pp[0], j0 = 1 + Math.floor(R() * Math.max(1, n - 4 - 3));
              if (j0 + 4 <= n - 3 && s[j0 - 1] !== pat[0] && s[j0 + 4] !== pat[3]) {   // 模進前後不和同一個和絃相連
                for (var q2 = 0; q2 < 4; q2++) s[j0 + q2] = pat[q2];
                var mem = pp[1][Math.floor(R() * pp[1].length)];   // 女高音的音位，兩個和絃一組往下移一級
                seqMark = {}; for (q2 = 0; q2 < 4; q2++) seqMark[j0 + q2] = mem[q2 % 2];
              }
            }
            if (!phraseOK(s, kind)) continue;
            var trial = seq.concat(s);
            if (trial.filter(function (x) { return x === 'N6'; }).length > 1) continue;   // 一題最多一個 N6
            if (!noSwing(trial)) continue;
            if (!HE.skeletonOK(trial, isMin, Math.min(engLv, 3))) continue;
            var lastF = fin ? function (v) { return v[0] % 12 === keyObj.off; }
              : (function (fd, soft) { return function (v) { var dg = degOf(v[0], keyObj); return fermDegOK(fd.concat([dg])) && !(soft && fd.length && dg === fd[fd.length - 1]); }; })(fdeg, k < 250);
            if (!fin && s[n - 1].indexOf('/') >= 0) {   // 停在副屬和絃：女高音不停在三音（暫時導音），改停根音或五音
              var thirdPc = (HE.getChordPcs(s[n - 1], isMin)[1] + keyObj.off) % 12, lastF0 = lastF;
              lastF = function (v) { return v[0] % 12 !== thirdPc && lastF0(v); };
            }
            var sol = solvePhrase(trial, s, voic.length ? voic[voic.length - 1] : null, seqMark, lastF, contour(tplId, n));
            if (!sol) continue;
            got = s; gotV = sol; if (seqMark) { seqDone = true; seqAt = seq.length + Number(Object.keys(seqMark)[0]); }
          }
          if (!got) { okAll = false; break; }
          if (!fin) fdeg.push(degOf(gotV[n - 1][0], keyObj));
          for (k = 0; k < n; k++) { seq.push(got[k]); durs.push(d[k]); ferm.push(k === n - 1); phraseOf.push(p); voic.push(gotV[k]); }
          kinds.push(kind); tpls.push(tplId); prevTpl = tplId;
          startWith = (kind === 'sec') ? got[n - 1].split('/')[1] : null;
        }
        if (!okAll) continue;
        if (!HE.skeletonOK(seq, isMin, engLv)) continue;
        var v = voic;
        var tl = 'CDEFGAB'.indexOf(keyObj.vfk[0].toUpperCase());
        var letters = v.map(function (ch, i) { return ch.map(function (mm) { return deps.letterIndexOfTone(mm % 12, seq[i], keyObj.off, keyObj.name, tl); }); });
        var starts = [], t0 = 0; durs.forEach(function (x) { starts.push(t0); t0 += x; });
        return { key: keyObj, meter: cfg.meter, beats: B, bars: bars, level: cfg.level, pickup: pickup, phraseBars: P, kinds: kinds, seqAt: seqAt, contours: tpls,
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
        if (check(bt.V, bt.total, q.ferm).length) continue;   // 例如反向八度：出題引擎允許、聖詠不允許 → 重出
        var best = null;
        for (var s = 0; s < 12; s++) {
          var dec = decorate(q, 0.9, Math.floor(R() * 4294967296));
          if (!dec) break;
          if (!best || dec.added > best.added) best = dec;
          if (dec.added >= q.bars * 2) break;
        }
        if (!best) continue;
        q.V = best.V; q.noAsk = best.noAsk; q.nct = best.added;
        var KS = {};
        keyObj.sigs.forEach(function (sg) { KS['CDEFGAB'.indexOf(sg[0])] = sg[1] === '#' ? 1 : -1; });
        q.figs = q.seq.map(function (_, k) { return figures(q, q.V, k, KS); });
        q.groups = chooseBlanks(q, q.V, cfg.amount, R);
        q.blank = {}; q.groups.forEach(function (g) { g.ks.forEach(function (k) { q.blank[k] = 1; }); });
        q.bassOn = q.starts.map(function (s) { return at(q.V, 3, s); });   // 每格拍點上的低音（正解）
        q.errors = check(q.V, q.total, q.ferm);
        return q;
      }
      return null;
    }
    return { generate: generate };
  }

  root.ChoraleGen = { make: make, check: check, build: build, rng: rng, chooseBlanks: chooseBlanks, figures: figures };
})(typeof window !== 'undefined' ? window : globalThis);
