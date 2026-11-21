/* 聖詠和聲：出題引擎（v111）
   ⚠ 下面「ALL_KEYS ～ HARMONY_ENGINE」整段原封不動複製自 four-part-trainer.html（v110），
     四部和聲頁的引擎有修改時，這裡要一起更新（聖詠專用的調整都寫在 chorale-gen.js，不改這一段）。
   可以在頁面與 Web Worker（chorale-worker.js）裡載入。 */
(function (root) {
  const ALL_KEYS = [
    { name: 'C 大調', vfk: 'C',   off: 0,  isMin: false, sigs: [] },
    { name: 'G 大調', vfk: 'G',   off: 7,  isMin: false, sigs: [['F','#']] },
    { name: 'D 大調', vfk: 'D',   off: 2,  isMin: false, sigs: [['F','#'],['C','#']] },
    { name: 'A 大調', vfk: 'A',   off: 9,  isMin: false, sigs: [['F','#'],['C','#'],['G','#']] },
    { name: 'E 大調', vfk: 'E',   off: 4,  isMin: false, sigs: [['F','#'],['C','#'],['G','#'],['D','#']] },
    { name: 'B 大調', vfk: 'B',   off: 11, isMin: false, sigs: [['F','#'],['C','#'],['G','#'],['D','#'],['A','#']] },
    { name: 'F♯ 大調',vfk: 'F#',  off: 6,  isMin: false, sigs: [['F','#'],['C','#'],['G','#'],['D','#'],['A','#'],['E','#']] },
    { name: 'D♭ 大調',vfk: 'Db',  off: 1,  isMin: false, sigs: [['B','b'],['E','b'],['A','b'],['D','b'],['G','b']] },
    { name: 'A♭ 大調',vfk: 'Ab',  off: 8,  isMin: false, sigs: [['B','b'],['E','b'],['A','b'],['D','b']] },
    { name: 'E♭ 大調',vfk: 'Eb',  off: 3,  isMin: false, sigs: [['B','b'],['E','b'],['A','b']] },
    { name: 'B♭ 大調',vfk: 'Bb',  off: 10, isMin: false, sigs: [['B','b'],['E','b']] },
    { name: 'F 大調', vfk: 'F',   off: 5,  isMin: false, sigs: [['B','b']] },
    { name: 'a 小調', vfk: 'Am',  off: 9,  isMin: true,  sigs: [] },
    { name: 'e 小調', vfk: 'Em',  off: 4,  isMin: true,  sigs: [['F','#']] },
    { name: 'b 小調', vfk: 'Bm',  off: 11, isMin: true,  sigs: [['F','#'],['C','#']] },
    { name: 'f♯ 小調',vfk: 'F#m', off: 6,  isMin: true,  sigs: [['F','#'],['C','#'],['G','#']] },
    { name: 'c♯ 小調',vfk: 'C#m', off: 1,  isMin: true,  sigs: [['F','#'],['C','#'],['G','#'],['D','#']] },
    { name: 'g♯ 小調',vfk: 'G#m', off: 8,  isMin: true,  sigs: [['F','#'],['C','#'],['G','#'],['D','#'],['A','#']] },
    { name: 'd♯ 小調',vfk: 'D#m', off: 3,  isMin: true,  sigs: [['F','#'],['C','#'],['G','#'],['D','#'],['A','#'],['E','#']] },
    { name: 'b♭ 小調',vfk: 'Bbm', off: 10, isMin: true,  sigs: [['B','b'],['E','b'],['A','b'],['D','b'],['G','b']] },
    { name: 'f 小調', vfk: 'Fm',  off: 5,  isMin: true,  sigs: [['B','b'],['E','b'],['A','b'],['D','b']] },
    { name: 'c 小調', vfk: 'Cm',  off: 0,  isMin: true,  sigs: [['B','b'],['E','b'],['A','b']] },
    { name: 'g 小調', vfk: 'Gm',  off: 7,  isMin: true,  sigs: [['B','b'],['E','b']] },
    { name: 'd 小調', vfk: 'Dm',  off: 2,  isMin: true,  sigs: [['B','b']] }
  ];

  // 依某調物件的調號（升降記號組合），找出共用同一調號的大調與關係小調兩個選項
  function getRelativeKeyPair(keyObj) {
    function sigKey(sigs) { return sigs.map(s => s[0] + s[1]).sort().join(','); }
    let target = sigKey(keyObj.sigs);
    return ALL_KEYS.filter(k => sigKey(k.sigs) === target);
  }

  // 12 Chromatic pitches mapping for 24 keys
  function getSpellingByMidiAndKey(midi, keyName) {
    const SPELL_MAP = {
        'C 大調': ['c','c#','d','eb','e','f','f#','g','g#','a','bb','b'],
        'G 大調': ['c','c#','d','d#','e','f','f#','g','g#','a','bb','b'],
        'D 大調': ['c','c#','d','d#','e','f','f#','g','g#','a','bb','b'],
        'A 大調': ['c','c#','d','d#','e','f','f#','g','g#','a','bb','b'],
        'E 大調': ['c','c#','d','d#','e','e#','f#','g','g#','a','a#','b'],
        'B 大調': ['b#','c#','d','d#','e','e#','f#','f##','g#','a','a#','b'],
        'F♯ 大調':['b#','c#','c##','d#','e','e#','f#','f##','g#','g##','a#','b'],
        'F 大調': ['c','db','d','eb','e','f','f#','g','ab','a','bb','b'],
        'B♭ 大調':['c','db','d','eb','e','f','gb','g','ab','a','bb','b'],
        'E♭ 大調':['c','db','d','eb','e','f','gb','g','ab','a','bb','cb'],
        'A♭ 大調':['c','db','d','eb','fb','f','gb','g','ab','a','bb','cb'],
        'D♭ 大調':['c','db','d','eb','fb','f','gb','g','ab','a','bb','cb'],
        'a 小調': ['c','c#','d','eb','e','f','f#','g','g#','a','bb','b'],
        'e 小調': ['c','c#','d','d#','e','f','f#','g','g#','a','a#','b'],
        'b 小調': ['c','c#','d','d#','e','e#','f#','g','g#','a','a#','b'],
        'f♯ 小調':['b#','c#','d','d#','e','e#','f#','g','g#','a','a#','b'],
        'c♯ 小調':['b#','c#','d','d#','e','e#','f#','f##','g#','a','a#','b'],
        'g♯ 小調':['b#','c#','c##','d#','e','e#','f#','f##','g#','a','a#','b'],
        'd♯ 小調':['b#','c#','c##','d#','e','e#','f#','f##','g#','g##','a#','b'],
        'd 小調': ['c','c#','d','eb','e','f','f#','g','g#','a','bb','b'],
        'g 小調': ['c','c#','d','eb','e','f','f#','g','ab','a','bb','b'],
        'c 小調': ['c','db','d','eb','e','f','f#','g','ab','a','bb','b'],
        'f 小調': ['c','db','d','eb','e','f','gb','g','ab','a','bb','cb'],
        'b♭ 小調':['c','db','d','eb','fb','f','gb','g','ab','a','bb','cb']
    };
    let map = SPELL_MAP[keyName] || SPELL_MAP['C 大調'];
    let str = map[midi % 12];
    let n = str[0];              // 第一個字元一定是音名字母（c/d/e/f/g/a/b）
    let a = str.slice(1);        // 其餘（可能是 ''、'#'、'##'、'b'、'bb'）才是升降記號
    // 正確八度：由「字母自然音 + 升降半音」反推，避免 B#/Cb/E#/Fb 等跨 C 分界的同音異名被畫錯八度
    // （例如 c#小調導音 B#，音高等於 C，但字母是 B，須歸屬低一個八度）
    let LS = { 'c':0,'d':2,'e':4,'f':5,'g':7,'a':9,'b':11 };
    let accSemi = a === '##' ? 2 : a === '#' ? 1 : a === 'bb' ? -2 : a === 'b' ? -1 : 0;
    let realOct = Math.round((midi - LS[n] - accSemi) / 12) - 1;
    return { keyStr: `${n}${a}/${realOct}`, letter: n.toUpperCase(), acc: a };
  }

  // 增六和絃專用拼寫：修正 ♯4（升四級）與 ♭6（降六級）兩個特徵音的正確記譜。
  // keyOffset = 該調主音的音級(0-11)。回傳與 getSpellingByMidiAndKey 相同格式，或 null（非特徵音則沿用預設）。
  const LETTERS = ['C','D','E','F','G','A','B'];
  const LETTER_SEMI = { 'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11 };
  function spellAug6Tone(midi, keyOffset, tonicLetterIdx) {
    let pc = midi % 12;
    let flat6 = (keyOffset + 8) % 12;   // ♭6
    let sharp4 = (keyOffset + 6) % 12;  // ♯4
    function build(letterIdx, targetPc) {
      let letter = LETTERS[letterIdx];
      let natural = LETTER_SEMI[letter];
      let diff = ((targetPc - natural + 18) % 12) - 6; // -6..+5 範圍的升降半音數
      let acc = diff === 2 ? '##' : diff === 1 ? '#' : diff === -1 ? 'b' : diff === -2 ? 'bb' : '';
      // 正確八度：由「該字母自然音 + 升降」反推，避免 B#/Cb 等跨 C 分界的同音異名被畫錯八度
      let realOct = Math.round((midi - natural - diff) / 12) - 1;
      return { keyStr: `${letter.toLowerCase()}${acc}/${realOct}`, letter: letter, acc: acc };
    }
    if (pc === sharp4) {
      // ♯4 = 第 4 級字母 + 升（第4級 = 主音字母往上數 3 個字母）
      let idx = (tonicLetterIdx + 3) % 7;
      return build(idx, pc);
    }
    if (pc === flat6) {
      // ♭6 = 第 6 級字母 + 降（第6級 = 主音字母往上數 5 個字母）
      let idx = (tonicLetterIdx + 5) % 7;
      return build(idx, pc);
    }
    return null;
  }

  // 拿坡里六和絃 N6 專用拼寫：N6 = 降二級(♭II)大三和絃，三個音為 ♭2 - 4 - ♭6。
  // 這些是調外變化音，直接依「正確的級數字母 + 升降」拼寫，繞過調性表的自然音拼法（如 B 大調誤拼成 B#、F##）。
  function spellNapolitanTone(midi, keyOffset, tonicLetterIdx) {
    let pc = midi % 12;
    let flat2 = (keyOffset + 1) % 12;   // ♭2（拿坡里根音）
    let deg4  = (keyOffset + 5) % 12;   // 4（拿坡里三音）
    let flat6 = (keyOffset + 8) % 12;   // ♭6（拿坡里五音）
    function build(letterIdx, targetPc) {
      let letter = LETTERS[letterIdx];
      let natural = LETTER_SEMI[letter];
      let diff = ((targetPc - natural + 18) % 12) - 6;
      let acc = diff === 2 ? '##' : diff === 1 ? '#' : diff === -1 ? 'b' : diff === -2 ? 'bb' : '';
      let realOct = Math.round((midi - natural - diff) / 12) - 1;
      return { keyStr: `${letter.toLowerCase()}${acc}/${realOct}`, letter: letter, acc: acc };
    }
    if (pc === flat2) return build((tonicLetterIdx + 1) % 7, pc); // ♭2 = 第2級字母 + 降
    if (pc === deg4)  return build((tonicLetterIdx + 3) % 7, pc); // 4  = 第4級字母
    if (pc === flat6) return build((tonicLetterIdx + 5) % 7, pc); // ♭6 = 第6級字母 + 降
    return null;
  }

  // 副屬和絃 V(x)/target 專用拼寫：把 target 當暫時主音，其屬和絃為
  //   根音(target上五度) - 大三度 - 完全五度 - 小七度，各音以「正確音程字母 + 升降」推算，
  //   避免本調拼寫表把臨時導音（升音）誤拼成降記號等音（如 a 小調 D♯ 誤拼成 E♭）。
  // targetDeg = 目標級數字串（如 'V','ii','IV'）；targetLetterIdx = 目標根音的字母索引(0-6)。
  function spellSecondaryDominantTone(midi, targetRootPc, targetLetterIdx) {
    let pc = midi % 12;
    // 副屬和絃根音 = 目標根音往上完全五度；其字母 = 目標字母往上 4 個字母
    let domRootPc = (targetRootPc + 7) % 12;
    let domRootLetterIdx = (targetLetterIdx + 4) % 7;
    let tones = [
      { letterIdx: domRootLetterIdx,           tpc: domRootPc },              // 根音
      { letterIdx: (domRootLetterIdx + 2) % 7, tpc: (domRootPc + 4) % 12 },   // 大三度（臨時導音）
      { letterIdx: (domRootLetterIdx + 4) % 7, tpc: (domRootPc + 7) % 12 },   // 完全五度
      { letterIdx: (domRootLetterIdx + 6) % 7, tpc: (domRootPc + 10) % 12 }   // 小七度
    ];
    function build(letterIdx, targetPc) {
      let letter = LETTERS[letterIdx];
      let natural = LETTER_SEMI[letter];
      let diff = ((targetPc - natural + 18) % 12) - 6;
      let acc = diff === 2 ? '##' : diff === 1 ? '#' : diff === -1 ? 'b' : diff === -2 ? 'bb' : '';
      let realOct = Math.round((midi - natural - diff) / 12) - 1;
      return { keyStr: `${letter.toLowerCase()}${acc}/${realOct}`, letter: letter, acc: acc };
    }
    for (let tn of tones) {
      if (pc === tn.tpc) return build(tn.letterIdx, pc);
    }
    return null;
  }

  // 取得某和絃中某個音級(pc)的「字母索引」(0=C..6=B)，供增二度偵測。
  // 依和絃類型使用對應的專用拼寫（增六/拿坡里/副屬），其餘用調性表。keyName 用於預設拼寫。
  function letterIndexOfTone(pc, sym, keyOffset, keyName, tonicLetterIdx) {
    const LI = { 'C':0,'D':1,'E':2,'F':3,'G':4,'A':5,'B':6 };
    // 用一個落在該 pc 的 midi（任意八度，字母不受八度影響）
    let midi = 60 + (pc % 12);
    let ov = null;
    if (sym === 'It6' || sym === 'Fr6' || sym === 'Ger6') ov = spellAug6Tone(midi, keyOffset, tonicLetterIdx);
    else if (sym.includes('N')) ov = spellNapolitanTone(midi, keyOffset, tonicLetterIdx);
    else if (sym.includes('/')) {
      let tgt = sym.split('/')[1];
      const DEG = {'I':[0,0],'i':[0,0],'ii':[1,2],'ii°':[1,2],'iii':[2,3],'III':[2,4],'IV':[3,5],'iv':[3,5],'V':[4,7],'v':[4,7],'vi':[5,9],'VI':[5,9],'vii':[6,11]};
      let info = DEG[tgt];
      if (info) ov = spellSecondaryDominantTone(midi, (keyOffset + info[1]) % 12, (tonicLetterIdx + info[0]) % 7);
    }
    if (!ov) ov = getSpellingByMidiAndKey(midi, keyName);
    return LI[ov.letter];
  }

  function getAccidentalToDraw(spell, mAcc, keyObj) {
    let keyId = spell.letter + spell.octave;
    let currentAcc = mAcc[keyId];
    if (currentAcc === undefined) {
        let found = keyObj.sigs.find(s => s[0] === spell.letter);
        currentAcc = found ? found[1] : '';
    }
    if (currentAcc !== spell.acc) {
        mAcc[keyId] = spell.acc;
        return spell.acc === '' ? 'n' : spell.acc;
    }
    return null;
  }

  function getDefaultAccidental(step, keyObj) {
      let sig = keyObj.sigs.find(s => s[0] === step.toUpperCase());
      return sig ? sig[1] : 'n';
  }

  // 升降記號 <-> 半音數（相對於白鍵自然音）
  function accToSemi(acc) {
    if (acc === '##') return 2;
    if (acc === '#') return 1;
    if (acc === 'bb') return -2;
    if (acc === 'b') return -1;
    return 0; // 'n' 或空字串
  }
  function semiToAcc(semi) {
    if (semi >= 2) return '##';
    if (semi === 1) return '#';
    if (semi <= -2) return 'bb';
    if (semi === -1) return 'b';
    return 'n';
  }
  // 使用者明確點擊升降按鈕時的實際套用邏輯（四鍵版）：
  //   '#'      = 在音符「目前」記號基礎上再升半音（已升高的音會變重升）
  //   'b'      = 在音符「目前」記號基礎上再降半音（已降低的音會變重降）
  //   'n'      = 強制絕對還原成自然音（取消所有升降）
  //   'default'= 復原：忽略手動升降，回到調號原本該有的記號（本調音高）
  // currentAcc 為該音符目前的記號（'', 'n', '#', '##', 'b', 'bb'）；輸入新音符時沒有既有記號，
  //   則以調號預設值作為升降疊加的基準。
  function resolveAccidental(pressedType, step, keyObj, currentAcc) {
    if (pressedType === 'n') return 'n';
    if (pressedType === 'default') return getDefaultAccidental(step, keyObj);
    let baseAcc = (currentAcc === undefined || currentAcc === null)
        ? getDefaultAccidental(step, keyObj)
        : currentAcc;
    let baseSemi = accToSemi(baseAcc);
    let delta = pressedType === '#' ? 1 : -1;
    let result = baseSemi + delta;
    if (result > 2) result = 2;   // 上限重升
    if (result < -2) result = -2; // 下限重降
    return semiToAcc(result);
  }

  /* 內部一律用 ii°／vii° 當「代號」（十幾處和聲規則都靠這個字串判斷），
     只在「顯示」與「比對」時轉成正確的記號。

     半減七（ø）與全減七（°）的差別在第七音：
       小調 ii  ＋七 = D–F–A♭–C   小三+小三+大三 → 半減七 iiø
       大調 vii ＋七 = B–D–F–A    小三+小三+大三 → 半減七 viiø
       小調 vii ＋七 = B–D–F–A♭   小三+小三+小三 → 全減七 vii°（維持不變）
     三和絃（不含七音）一律仍是減三和絃，維持 °。 */
  function isHalfDim7(sym, isMinor) {
    if (!sym) return false;
    const numerator = sym.includes('/') ? sym.split('/')[0] : sym;   // 副屬只看斜線前
    if (!/7|65|43|42/.test(numerator)) return false;                 // 沒有七音就不是七和絃
    const base = numerator.replace(/[0-9]/g, '');                    // 去掉轉位數字
    return isMinor ? (base === 'ii°' || base === 'iiø')
                   : (base === 'vii°' || base === 'viiø');
  }
  /* 顯示用：半減七的 ° 換成 ø（其餘原樣） */
  /* ===== v.109 數字低音（作者的寫法）=====
     數字＝低音往上的音程；原位三和絃的 5、3 與六和絃的 3 省略；上方的音跟調號不同時，在它的數字右邊加記號（6♯、7♭），
     原本省略的數字這時要寫回來；只有 3 被改變時不寫 3、只寫記號（放在最下層／單獨時接在級數正右方）；低音本身的變化不標；
     重升用 𝄪、降記號調裡升高的音用 ♮。增六寫 It⁺6／Fr⁺6／Ger⁺6、拿坡里寫 N6。
     只用在「正解」的顯示與導出譜例；學生作答格、評分都不變。
     ⚠ figuredBass 與出題工具（cadenza-1101/engrave.js）的同名函式完全相同，改規則兩邊要一起改。 */
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
  /* 本頁的拼寫（keyStr，例如 'c#/4'）＋調號 → 上面 figuredBass 要的小節格式 */
  function figuredBassOfSpells(spells, keyObj, sym){
    const sigs = (keyObj && keyObj.sigs) || [];
    const fifths = sigs.length ? sigs.length * (sigs[0][1] === '#' ? 1 : -1) : 0;
    const pitches = spells.map(function(sp){
      const m = String(sp.keyStr || '').match(/^([a-g])([#b]*)\/(-?\d+)$/i); if(!m) return null;
      return { step: m[1], alter: m[2].split('').reduce(function(a, c){ return a + (c === '#' ? 1 : -1); }, 0), oct: parseInt(m[3], 10) };
    }).filter(Boolean);
    return figuredBass({ fifths: fifths, staves: [[{ rest: false, pitches: pitches }]] }, sym);
  }
  function fbEsc(t){ return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function fbStack(rows){
    return '<span class="fb-s">' + rows.map(function(r){
      return '<span class="fb-row">' + (r.n ? '<span class="fb-d">' + r.n + (r.a ? '<span class="fb-a">' + r.a + '</span>' : '') + '</span>'
                                             : '<span class="fb-d fb-3">' + r.a + '</span>') + '</span>';
    }).join('') + '</span>';
  }
  /* 一般級數：羅馬數字置中、數字疊在右上（不佔寬度）；副屬和絃：整串置中 */
  function figuredHtml(f, raw){
    if(!f) return fbEsc(raw);
    if(f.special === 'aug') return fbEsc(f.roman) + '<sup class="fb-plus">+</sup>6';
    if(f.special === 'n6') return 'N6';
    const lone = f.rows.length === 1 && !f.rows[0].n;
    /* v.109.2：只有一個數字、或只有一個記號時，寫在級數的正右方（和級數字母同高置中）；兩層以上才疊放 */
    const one = f.rows.length === 1 && f.rows[0].n;
    const fig = !f.rows.length ? '' : (lone ? '<span class="fb-lone">' + f.rows[0].a + '</span>'
            : (one ? '<span class="fb-one">' + f.rows[0].n + (f.rows[0].a ? '<span class="fb-oa">' + f.rows[0].a + '</span>' : '') + '</span>' : fbStack(f.rows)));
    if(f.sec) return '<span class="fb-sec">' + fbEsc(f.roman) + fig + fbEsc(f.sec) + '</span>';
    return '<span class="fb-r">' + fbEsc(f.roman) + (fig ? '<span class="fb-x">' + fig + '</span>' : '') + '</span>';
  }
  /* 導出譜例用：同樣的排法換成畫在圖上的文字（每一段各自的位置），MusicXML 仍寫一行文字 */
  function figuredOverlays(f, raw, x, y, size, font){
    const cv = figuredOverlays._c || (figuredOverlays._c = document.createElement('canvas').getContext('2d'));
    const W = function(t, sz){ cv.font = 'bold ' + sz + 'px ' + font; return cv.measureText(t).width; };
    const fs = Math.round(size * 0.85), out = [];
    const T = function(t, xx, yy, sz, extra){ out.push(Object.assign({ x: xx, y: yy, text: t, size: sz, align: 'left', bold: true, font: font, noXml: true }, extra || {})); };
    if(!f || f.special){
      const txt = !f ? raw : (f.special === 'n6' ? 'N6' : null);
      if(txt){ out.push({ x: x, y: y, text: txt, size: size, align: 'center', bold: true, font: font, xmlText: raw }); return out; }
      const w1 = W(f.roman, size), w2 = W('+', fs), w3 = W('6', size), x0 = x - (w1 + w2 + w3) / 2;
      T(f.roman, x0, y, size, { noXml: false, xmlText: raw }); T('+', x0 + w1, y - size * 0.45, fs); T('6', x0 + w1 + w2, y, size);
      return out;
    }
    const lone = f.rows.length === 1 && !f.rows[0].n, one = f.rows.length === 1 && !!f.rows[0].n;
    const rowW = function(r){ return r.n ? W(String(r.n), fs) + (r.a ? W(r.a, fs) : 0) : W(r.a, fs); };
    const stackW = lone ? W(f.rows[0].a, fs) : f.rows.reduce(function(m, r){ return Math.max(m, rowW(r)); }, 0);
    const romW = W(f.roman, size);
    let x0;
    if(f.sec){ const secW = W(f.sec, size); x0 = x - (romW + 1 + stackW + (stackW ? 1 : 0) + secW) / 2; }
    else x0 = x - romW / 2;
    T(f.roman, x0, y, size, { noXml: false, xmlText: raw });
    const xs = x0 + romW + 1;
    const yMid = y - (size - fs) * 0.35;   // 正右方：和級數字母同高置中
    if(lone) T(f.rows[0].a, xs, yMid, fs);
    else if(one){ T(String(f.rows[0].n), xs, yMid, fs); if(f.rows[0].a) T(f.rows[0].a, xs + W(String(f.rows[0].n), fs), yMid, fs); }
    else {
      const dW = W('6', fs);
      f.rows.forEach(function(r, k){
        const yy = y - size * 0.38 + k * fs * 0.92;
        if(r.n){ T(String(r.n), xs, yy, fs); if(r.a) T(r.a, xs + dW, yy, fs); }
        else T(r.a, xs + (dW - W(r.a, fs)) / 2, yy, fs);   // 只有記號（代表 3）：放在上面數字的正下方
      });
    }
    if(f.sec) T(f.sec, xs + stackW + (stackW ? 1 : 0), y, size);
    return out;
  }

  function displayChord(sym, isMinor) {
    if (!sym) return sym;
    if (!isHalfDim7(sym, isMinor)) return sym;
    const i = sym.indexOf('/');
    const numerator = i >= 0 ? sym.slice(0, i) : sym;
    const rest = i >= 0 ? sym.slice(i) : '';
    return numerator.replace('°', 'ø') + rest;
  }

  function normalizeChord(sym, isMinor) {
    if (!sym) return '';
    let s = sym.trim();
    let upperS = s.toUpperCase();
    // 增六和絃正規化（接受 It6/It+6/IT6 等變體）
    if (/^IT/.test(upperS)) return 'It6';
    if (/^FR/.test(upperS)) return 'Fr6';
    if (/^GER/.test(upperS)) return 'Ger6';
    if (upperS.includes('K64') || upperS.includes('CAD64')) s = s.replace(/K64|CAD64/ig, 'I64');
    if (upperS === 'N' || upperS === 'N6' || upperS === 'BII6' || upperS === '♭II6') return 'N6';
    if (isMinor) {
        if (upperS.startsWith('V') || upperS.startsWith('VII')) s = s.replace(/[♮♯#]/g, '');
    }
    // 半減七一律正規化成 ø：舊資料寫 ii°7、新資料寫 iiø7，兩者視為同一個答案
    if (isHalfDim7(s, isMinor)) {
      const i = s.indexOf('/');
      const numerator = i >= 0 ? s.slice(0, i) : s;
      const rest = i >= 0 ? s.slice(i) : '';
      s = numerator.replace('°', 'ø') + rest;
    }
    return s;
  }

  // 副屬和絃借用目標（相對主音的音級數字，0-11）
  const SECDOM_TARGET_ROOT = {
      'ii': 2, 'IV': 5, 'V': 7, 'vi': 9,           // 大調可借用目標
      'iv': 5, 'VI': 8, 'III': 3                    // 小調可借用目標
  };
  function getSecondaryDominantPcs(targetDeg) {
      let R = SECDOM_TARGET_ROOT[targetDeg];
      if (R === undefined) return [7, 11, 2, 5];
      let root = (R + 7) % 12;
      return [root, (root + 4) % 12, (root + 7) % 12, (root + 10) % 12];
  }

  // ================= 和聲對位演算法引擎 (狀態機語法) =================
  const HARMONY_ENGINE = {
    getChordPcs: function(sym, isMinor) {
      let is7th = /7|65|43|42/.test(sym);
      if (sym.includes('N')) return [1, 5, 8]; // N: bII (1,5,8)
      // 增六和絃（相對主音音級，低音固定 b6 = 8）：特徵音為增六度 b6→#4(=6)
      //   It+6 = b6, 1, #4      → [8, 0, 6]（重根音 1）
      //   Fr+6 = b6, 1, 2, #4   → [8, 0, 2, 6]
      //   Ger+6 = b6, 1, b3, #4 → [8, 0, 3, 6]
      if (sym === 'It6') return [8, 0, 6];
      if (sym === 'Fr6') return [8, 0, 2, 6];
      if (sym === 'Ger6') return [8, 0, 3, 6];
      if (sym.includes('/')) {
        let target = sym.split('/')[1];
        return getSecondaryDominantPcs(target);
      }
      let clean = (sym.match(/^[a-zA-Z°]+/) || [''])[0];

      let map = {};
      if (!isMinor) {
          map = {
              'I': [0,4,7,11], 'ii': [2,5,9,0], 'iii': [4,7,11,2], 'IV': [5,9,0,4],
              'V': [7,11,2,5], 'vi': [9,0,4,7], 'vii°': [11,2,5,9]
          };
      } else {
          map = {
              'i': [0,3,7,10], 'ii°': [2,5,8,0], 'III': [3,7,10,2], 'iv': [5,8,0,3],
              'V': [7,11,2,5], 'VI': [8,0,3,7], 'vii°': [11,2,5,8]
          };
      }
      let pcs = map[clean] || [0,4,7,11];
      return is7th ? pcs : pcs.slice(0, 3);
    },

    // v.100：骨架出好後先檢查（Lv.1 全原位且不重複、不出禁用進行；不出 V/ii→N6；Lv.4 起必有副屬；增六接 V），
    // 不合格就重出一次骨架。6 小節放不下德國增六＋副屬時，自然會改出義／法增六。
    generateSkeleton: function(bars, isMinor, levelId, densityScale) {
      let seq = null;
      for (let t = 0; t < 200; t++) {
        seq = this.generateSkeletonOnce(bars, isMinor, levelId, densityScale);
        if (this.skeletonOK(seq, isMinor, levelId)) return seq;
      }
      return seq;
    },

    skeletonOK: function(seq, isMinor, levelId) {
      const n = seq.length;
      const base = s => s.replace(/[0-9]/g, '');
      for (let i = 0; i < n; i++) {
        if (seq[i] === 'vii°') return false; // 不出原位 vii°
        // 副屬和絃可以接非目標和絃（由聲部規則判斷寫不寫得出來），唯獨 V/ii → N6 不行：
        // 臨時導音（升一級）在 N6 裡只能異名同音保留成降二級，沒有真正解決
        if (seq[i].includes('/') && seq[i].split('/')[1] === 'ii' && seq[i + 1] === 'N6') return false;
        // v.111：N6 前面只接 I／i、I6／i6、vi／VI、IV／iv、IV6／iv6、V/IV 類（不接 ii° 類：♮2 接 ♭2 聽起來像更正）
        if (i > 0 && seq[i] === 'N6' && !/^((I|i)6?|vi|VI|(IV|iv)6?|V(7|6|65|43|42)?\/(IV|iv))$/.test(seq[i - 1])) return false;
        // v.100：V 類接 vi64／VI64 不出（第二轉位不在經過、輔助、終止六四的用法裡）
        if (i > 0 && /^V/.test(seq[i - 1]) && !seq[i - 1].includes('/') && (seq[i] === 'vi64' || seq[i] === 'VI64')) return false;
      }
      // v.100：六四和絃只用在三種地方，其他一律不出
      for (let i = 0; i < n; i++) {
        if (!/64$/.test(seq[i]) || seq[i].includes('/')) continue;
        if (!this.sixFourKind(seq[i], seq[i - 1], seq[i + 1])) return false;
      }
      if (levelId === 1) {
        for (let i = 0; i < n; i++) {
          if (/[0-9\/N]/.test(seq[i])) return false;           // 只有原位三和絃
          if (i > 0 && seq[i] === seq[i - 1]) return false;     // 相鄰不重複
          if (i > 0 && isMinor && seq[i - 1] === 'VI' && (seq[i] === 'ii°' || seq[i] === 'V')) return false;
        }
      }
      if (levelId >= 4 && !seq.some(s => s.includes('/'))) return false; // Lv.4 起必有副屬
      if (levelId >= 5) {
        let hasAug = false;
        for (let i = 0; i < n; i++) {
          if (!(seq[i] === 'It6' || seq[i] === 'Fr6' || seq[i] === 'Ger6')) continue;
          hasAug = true;
          let nx = seq[i + 1] || '';
          let ok = base(nx) === 'V' || (seq[i] === 'Ger6' && /^(I|i)64$/.test(nx) && base(seq[i + 2] || '') === 'V');
          if (!ok) return false;
        }
        if (!hasAug) return false;
      }
      return true;
    },

    // v.100：判斷六四和絃的用法——'cad' 終止（I64→V／V7）、'pass' 經過（I–V64–I6、IV–I64–IV6 及反向）、
    //   'pedal' 持續（I–IV64–I）；都不是就回傳 null（＝不該出現的單獨六四）
    sixFourKind: function(sym, prevSym, nextSym) {
      prevSym = prevSym || ''; nextSym = nextSym || '';
      if (/^(I|i)64$/.test(sym) && /^V7?$/.test(nextSym)) return 'cad';
      let pair = function (a, b) { return (prevSym === a && nextSym === b) || (prevSym === b && nextSym === a); };
      if (sym === 'V64' && (pair('I', 'I6') || pair('i', 'i6'))) return 'pass';
      if (sym === 'I64' && pair('IV', 'IV6')) return 'pass';
      if (sym === 'i64' && pair('iv', 'iv6')) return 'pass';
      if ((sym === 'IV64' && prevSym === 'I' && nextSym === 'I') || (sym === 'iv64' && prevSym === 'i' && nextSym === 'i')) return 'pedal';
      return null;
    },

    generateSkeletonOnce: function(bars, isMinor, levelId, densityScale) {
      if (densityScale === undefined) densityScale = 1.0;
      const TONIC = isMinor ? 'i' : 'I';
      const SUBDOM = isMinor ? 'iv' : 'IV';

      // 正向功能進行表：每個和絃 -> 下一個常見的和絃（依古典 T→S→D→T 功能邏輯）
      // v.100：拿掉原位 vii°（原位減三和絃無法正確接原位 I；vii°6 只在 Lv.2 起的固定套組出現），原本的位置改用 V
      const NEXT_MAJ = {
          'I':   ['ii', 'IV', 'V', 'vi', 'iii', 'vi'],
          'ii':  ['V'],
          'iii': ['vi', 'IV'],
          'IV':  ['V', 'ii', 'I', 'V'],
          'V':   ['I', 'vi'],
          'vi':  ['ii', 'IV', 'V', 'iii']
      };
      const NEXT_MIN = {
          'i':   ['ii°', 'iv', 'V', 'VI', 'iv', 'VI'],
          'ii°': ['V'],
          'iv':  ['V', 'ii°', 'i', 'V'],
          'V':   ['i', 'VI'],
          // v.100：Lv.1 全原位時，VI→ii°（低音必為三全音）與 VI→V（上聲部須反向，降六級只能增二度到導音）無解，只接 iv
          'VI':  (levelId === 1) ? ['iv'] : ['ii°', 'iv', 'V', 'ii°']
      };
      let nextMap = isMinor ? NEXT_MIN : NEXT_MAJ;

      // 結尾盡量用 V 類（各種轉位）接 I；變格終止 IV-I 只保留極低機率（阿們終止另由套組處理）
      let cadType = Math.random() < 0.97 ? 'auth' : 'plag';
      let picardy = isMinor && levelId >= 4 && Math.random() < 0.2;

      let seq = Array(bars).fill('');
      seq[0] = TONIC;
      seq[bars - 1] = isMinor ? (picardy ? 'I' : 'i') : 'I';
      seq[bars - 2] = (cadType === 'auth') ? 'V' : SUBDOM;
      // 屬前若空間足夠，倒數第三格用下屬功能鋪陳（S→D→T）
      if (cadType === 'auth' && bars >= 6) {
        seq[bars - 3] = (Math.random() < 0.5) ? (isMinor ? 'ii°' : 'ii') : SUBDOM;
      }

      // 正向填中段（從第 1 格推到接近終止式前），嚴格避免與前一格、前兩格、以及後方預置終止和絃造成來回擺盪
      let fillEnd = (cadType === 'auth' && bars >= 6) ? bars - 4 : bars - 3;
      let afterFill = seq[fillEnd + 1]; // 填充區之後第一個已預置的和絃（下屬或屬）
      for (let i = 1; i <= fillEnd; i++) {
        let prev = seq[i - 1];
        let prev2 = seq[i - 2] || '';
        let candidates = (nextMap[prev] || [isMinor ? 'iv' : 'IV', 'V']).slice();
        // 過濾：不與前一格、前兩格相同（避免 X-Y-X 擺盪）
        let filtered = candidates.filter(c => c !== prev && c !== prev2);
        // 若這是填充區最後一格，額外避免與後方終止和絃相同（避免銜接處 Y-X-Y）
        if (i === fillEnd && afterFill) {
          let f2 = filtered.filter(c => c !== afterFill && !(nextMap[c] && !nextMap[c].includes(afterFill) && c === afterFill));
          // 傾向選能順接到終止和絃的候選（其 next 清單包含 afterFill）
          let leadsToCad = f2.filter(c => (nextMap[c] || []).includes(afterFill));
          if (leadsToCad.length > 0) filtered = leadsToCad;
          else if (f2.length > 0) filtered = f2;
        }
        if (filtered.length === 0) filtered = candidates.filter(c => c !== prev);
        if (filtered.length === 0) filtered = candidates;
        seq[i] = filtered[Math.floor(Math.random() * filtered.length)];
      }

      return this.dedupeAdjacent(this.applyLevelFeatures(seq, isMinor, levelId, densityScale), isMinor, levelId);
    },

    // 消除「完全一模一樣」的相鄰和絃（連轉位都相同，如 I-I、V7-V7）；同根音不同轉位（I-I6）保留
    dedupeAdjacent: function(seq, isMinor, levelId) {
      const n = seq.length;
      for (let i = 1; i < n; i++) {
        if (seq[i] !== seq[i - 1]) continue; // 只處理完全相同
        if (seq[i] === 'It6' || seq[i] === 'Fr6' || seq[i] === 'Ger6') continue; // 增六不動
        // 頭尾主和絃不動；其餘嘗試改成不同轉位或換和絃
        let base = seq[i].replace(/[0-9]/g, '');
        let is7 = /7|65|43|42/.test(seq[i]);
        let hasSlashOrN = seq[i].includes('/') || seq[i].includes('N');
        let alt = null;
        if (hasSlashOrN) {
          // 副屬/拿坡里若重複，改成後續的目標和絃本身即可（罕見）
          alt = base;
        } else if (is7) {
          // 七和絃：換一個不同的轉位
          let cur = seq[i].replace(base, '');
          let opts = ['7', '65', '43', '42'].filter(x => x !== cur);
          alt = base + opts[Math.floor(Math.random() * opts.length)];
        } else {
          // 三和絃：換一個不同的轉位（原位/6/64）
          let cur = seq[i].replace(base, '');
          let opts = (levelId >= 2 ? ['', '6'] : ['']).filter(x => x !== cur); // v.100：不再改成六四（六四只用在終止、經過、持續）
          if (opts.length === 0) opts = ['6'];
          alt = base + opts[Math.floor(Math.random() * opts.length)];
        }
        // 若改完仍與前一格相同（例如原位三和絃在 Lv.1 無其他轉位可選），退而換成鄰近功能和絃
        if (alt === seq[i - 1] || alt === seq[i]) {
          let subs = isMinor ? { 'i':'VI','iv':'ii°','V':'V','VI':'iv','ii°':'iv','III':'i' }
                             : { 'I':'vi','IV':'ii','V':'V','vi':'IV','ii':'IV','iii':'I' };
          let repl = subs[base] || (isMinor ? 'iv' : 'IV');
          alt = repl + (levelId >= 2 && Math.random() < 0.4 ? '6' : '');
        }
        seq[i] = alt;
      }
      // ii65（低音為七音）接 V7 時容易逼壞聲部：降回 ii7 原位（同功能、聲部更乾淨）。
      // ii65 接 V 原位則沒問題，維持不變。
      for (let i = 0; i < n - 1; i++) {
        let base = seq[i].replace(/[0-9]/g, '');
        let isII65 = (base === 'ii' || base === 'ii°') && /65/.test(seq[i]);
        if (!isII65) continue;
        let nb = seq[i + 1].replace(/[0-9]/g, '');
        let nextIsV7 = (nb === 'V') && /7/.test(seq[i + 1]) && !seq[i + 1].includes('/');
        // v.111：ii65 → V7 已可依共同音保持規則寫出，不再自動改成 ii7
        if (nextIsV7 && false) seq[i] = base + '7';
      }
      return seq;
    },

    // 依照難度，在根音骨架上疊加轉位／固定套組／七和絃／副屬和絃／拿坡里，並保底至少出現一次該級別的新元素
    applyLevelFeatures: function(seq, isMinor, levelId, densityScale) {
      if (densityScale === undefined) densityScale = 1.0;
      const n = seq.length;
      const TONIC = isMinor ? 'I' : 'I'; // 皮卡第後最終小節可能已經是 'I'
      const usedIdx = new Set([0, n - 1]); // 頭尾（起始主和絃、終止主和絃）不做額外裝飾

      if (levelId === 1) return seq; // Lv.1：全部維持原位，不做任何裝飾
      // v.111：七和絃轉位的比例參考巴哈聖詠（六五最多）；ii 類以 ii65 為主
      const pickW = arr => { let r = Math.random() * arr.reduce((a, x) => a + x[1], 0); for (const x of arr) { r -= x[1]; if (r < 0) return x[0]; } return arr[0][0]; };
      const SEV_W = [['65', 0.35], ['7', 0.3], ['42', 0.2], ['43', 0.15]];
      const SEV_II = [['65', 0.4], ['43', 0.2], ['42', 0.2], ['7', 0.2]];
      const SEC_W = [['65', 0.3], ['7', 0.25], ['42', 0.25], ['43', 0.2]];

      // ---------- Lv.2：三和絃所有轉位 + 四組固定套組 ----------
      const BUNDLES = isMinor ? [
        ['i','V64','i6'], ['i6','V64','i'], ['i64','V','i'], ['i','iv64','i'],
        ['i','vii°6','i6'], ['i6','vii°6','i'],
        ['iv','i64','iv6'], ['iv6','i64','iv']   // v.100：經過六四（下屬和絃的兩個位置之間）
      ] : [
        ['I','V64','I6'], ['I6','V64','I'], ['I64','V','I'], ['I','IV64','I'],
        ['I','vii°6','I6'], ['I6','vii°6','I'],
        ['IV','I64','IV6'], ['IV6','I64','IV']   // v.100：經過六四（下屬和絃的兩個位置之間）
      ];
      let hasLv2Feature = false;
      if (n - 3 >= 3) {
        let startMax = (n - 2) - 3; // 可放置套組的內部起點上限（保留頭尾兩小節）
        if (startMax >= 1 && Math.random() < 0.22) {
          let start = 1 + Math.floor(Math.random() * startMax);
          let bundle = BUNDLES[Math.floor(Math.random() * BUNDLES.length)];
          for (let k = 0; k < 3; k++) { seq[start + k] = bundle[k]; usedIdx.add(start + k); }
          hasLv2Feature = true;
        }
      }
      // 其餘未被套組佔用的中段三和絃，較高機率升級成第一轉位；第二轉位 64 僅少量（避免假套組特徵）
      // vii° 排除在外：vii° 是減三和絃、含減五度，只以 vii°6 形式出現在 I–vii°6–I6 組合包內，其他位置不加轉位
      for (let i = 1; i < n - 2; i++) {
        if (usedIdx.has(i)) continue;
        if (seq[i].replace(/[0-9]/g, '') === 'vii°') continue;
        let r = Math.random();
        if (r < 0.58) { seq[i] = seq[i] + '6'; hasLv2Feature = true; }
      }
      // 保底：Lv.2 至少要有一個轉位或固定套組
      if (!hasLv2Feature) {
        let candidates = [];
        for (let i = 1; i < n - 2; i++) if (!usedIdx.has(i) && seq[i].replace(/[0-9]/g, '') !== 'vii°') candidates.push(i);
        if (candidates.length > 0) {
          let idx = candidates[Math.floor(Math.random() * candidates.length)];
          seq[idx] = seq[idx] + '6';
        }
      }

      if (levelId === 2) return seq;

      // ---------- Lv.3／Lv.4：三和絃＋七和絃所有轉位 ----------
      // Lv.4 大幅提高七和絃與轉位密度、盡量減少光禿禿的原位三和絃
      let sevProb = ((levelId >= 4) ? 0.72 : 0.5) * densityScale;   // 升級成七和絃的機率
      let invProb = (levelId >= 4) ? 0.95 : 0.75;  // 剩下的三和絃再加轉位的機率門檻
      let hasLv3Feature = false;
      if (seq[n - 2].replace(/[0-9]/g, '') === 'V' && Math.random() < (levelId >= 4 ? 0.85 : 0.75)) {
        seq[n - 2] = 'V7';
        hasLv3Feature = true;
      }
      for (let i = 1; i < n - 2; i++) {
        if (usedIdx.has(i)) continue; // 固定套組的和絃不額外升級成七和絃，避免破壞慣用進行
        let base = seq[i].replace(/[0-9]/g, '');
        if (base === 'vii°') continue; // vii° 只以 vii°6 形式出現在組合包內，其他位置不升級/加轉位
        let hadInv = /6|64/.test(seq[i]);
        let r = Math.random();
        if (r < sevProb) {
          // 升級成七和絃（含各種轉位）
          let variant = pickW((base === 'ii' || base === 'ii°') ? SEV_II : SEV_W);
          seq[i] = base + variant;
          hasLv3Feature = true;
        } else if (r < invProb) {
          // 保留三和絃但加轉位（Lv.4 幾乎一定加轉位，減少原位三和絃）。
          // 以第一轉位 6 為主，大幅降低第二轉位 64（64 是「經過六四」等假套組特徵的主因）。
          if (!hadInv) seq[i] = base + '6'; // v.100：不再隨機改成六四
        }
      }
      // v.111：終止公式 ii65（或 ii43）→ I64 → V7 → I，以及中段 ii42 → V6／V65（大調）
      {
        const iiB = isMinor ? 'ii°' : 'ii', T64 = isMinor ? 'i64' : 'I64';
        if (n >= 6 && !usedIdx.has(n - 4) && !usedIdx.has(n - 3) && Math.random() < (this.__cadP !== undefined ? this.__cadP : (levelId >= 4 ? 0.4 : 0.35))) {   // 聖詠和聲：每句的終止機率另外設定
          if (Math.random() < 0.5) {   // ii65（或 ii43）→ I64 → V7 → I
            seq[n - 4] = iiB + (Math.random() < 0.65 ? '65' : '43'); seq[n - 3] = T64; seq[n - 2] = 'V7';
            usedIdx.add(n - 4); usedIdx.add(n - 3); usedIdx.add(n - 2);
          } else {                     // ii65（或 ii43、ii7）→ V7 → I
            let r = Math.random(); seq[n - 3] = iiB + (r < 0.6 ? '65' : r < 0.8 ? '43' : '7'); seq[n - 2] = 'V7';
            usedIdx.add(n - 3); usedIdx.add(n - 2);
          }
          hasLv3Feature = true;
        }
        if (!isMinor && Math.random() < 0.3) {
          let spots = [];
          for (let i = 1; i < n - 3; i++) if (!usedIdx.has(i) && !usedIdx.has(i + 1) && seq[i + 1].replace(/[0-9]/g, '') === 'V' && !seq[i + 1].includes('/')) spots.push(i);
          if (spots.length) { let i = spots[Math.floor(Math.random() * spots.length)]; seq[i] = 'ii42'; seq[i + 1] = Math.random() < 0.5 ? 'V6' : 'V65'; usedIdx.add(i); usedIdx.add(i + 1); hasLv3Feature = true; }
        }
      }
      if (!hasLv3Feature) {
        seq[n - 2] = seq[n - 2].replace(/[0-9]/g, '') + '7';
      }

      if (levelId === 3) return seq;

      // ---------- Lv.4：副屬和絃／拿坡里六和絃／皮卡第三度 ----------
      let hasLv4Feature = seq[n - 1] === 'I' && isMinor; // 皮卡第三度也算 Lv.4 專屬元素
      const TARGETS = isMinor ? ['V', 'iv', 'VI'] : ['ii', 'IV', 'V', 'vi'];

      let chromaticChoices = [];
      for (let i = 1; i < n - 1; i++) {
        if (usedIdx.has(i)) continue;
        let nextBase = (seq[i + 1] || '').replace(/[0-9]/g, '');
        if (TARGETS.includes(nextBase)) chromaticChoices.push(i);
      }
      // Lv.4 提高副屬和絃出現量：每個可銜接點都有較高機率插入（不再只插一個）
      let secDomInserted = 0;
      for (let idx of chromaticChoices) {
        if (usedIdx.has(idx)) continue;
        // 避免兩個副屬和絃緊鄰
        if (usedIdx.has(idx - 1) || usedIdx.has(idx + 1)) continue;
        if (Math.random() < 0.38) {
          let target = seq[idx + 1].replace(/[0-9]/g, '');
          let inv = pickW(SEC_W);
          // 副屬四二和絃的低音（七音）要下行解決：目標和絃改成第一轉位（vi6／VI6 不用，改別的轉位）
          if (inv === '42') { if (/^(vi|VI)$/.test(target) || usedIdx.has(idx + 1) || idx + 1 >= n - 1) inv = '65'; else seq[idx + 1] = target + '6'; }
          seq[idx] = 'V' + inv + '/' + target;
          usedIdx.add(idx);
          hasLv4Feature = true;
          secDomInserted++;
        }
      }

      // 拿坡里六和絃 N6：屬於下屬功能，古典上必須解決到屬功能 V。
      // 只在「本格是下屬和絃(ii°/iv系列) 且 下一格是 V 級」的位置插入；沒有這種位置就不硬塞。
      // 機率約 25%（設 0.28，因部分題目無銜接點而實際落點會略低）。
      if (Math.random() < 0.28) {
        // 先找現成的「下屬和絃 → V」銜接點
        let n6spots = [];
        for (let i = 1; i < n - 1; i++) {
          if (usedIdx.has(i)) continue;
          let base = seq[i].replace(/[0-9]/g, '');
          let nextBase = (seq[i + 1] || '').replace(/[0-9]/g, '');
          let isSubdom = base === (isMinor ? 'ii°' : 'ii') || base === (isMinor ? 'iv' : 'IV');
          if (isSubdom && nextBase === 'V') n6spots.push(i);
        }
        if (n6spots.length > 0) {
          let idx = n6spots[Math.floor(Math.random() * n6spots.length)];
          seq[idx] = 'N6';
          usedIdx.add(idx);
          hasLv4Feature = true;
        } else if (!hasLv4Feature) {
          // 沒有現成銜接點，主動製造一組 N6 → V（挑一個非頭尾、下一格可改成 V 的位置）
          for (let i = 1; i < n - 2; i++) {
            if (usedIdx.has(i) || usedIdx.has(i + 1)) continue;
            let nextBase = (seq[i + 1] || '').replace(/[0-9]/g, '');
            // 下一格若本來就是 V，或可安全改成 V（避免破壞終止式主和絃）
            if (nextBase === 'V' || (i + 1 < n - 1)) {
              seq[i] = 'N6';
              seq[i + 1] = 'V';
              usedIdx.add(i); usedIdx.add(i + 1);
              hasLv4Feature = true;
              break;
            }
          }
        }
      }

      // 下屬功能色彩強化：把未被使用的原位 ii/iv（小調 ii°/iv）較高機率升級成轉位或七和絃，
      // 補足 N6 減少後的下屬色彩（ii6 / ii65 / iv7 等）。
      for (let i = 1; i < n - 1; i++) {
        if (usedIdx.has(i)) continue;
        let base = seq[i].replace(/[0-9]/g, '');
        let isSubdom = base === (isMinor ? 'ii°' : 'ii') || base === (isMinor ? 'iv' : 'IV');
        if (!isSubdom) continue;
        if (/6|64|7|65|43|42/.test(seq[i])) continue; // 已經是轉位/七和絃就跳過
        let r = Math.random();
        if (r < 0.4) seq[i] = base + '65';
        else if (r < 0.6) seq[i] = base + '7';
        else if (r < 0.85) seq[i] = base + '6';
        // 其餘 15% 維持原位
      }

      // 假終止 V→vi / V→VI：中段主動製造，至少 30% 題目出現一次。
      {
        let submediant = isMinor ? 'VI' : 'vi';
        let alreadyHas = false;
        for (let i = 1; i < n - 2; i++) {
          let a = seq[i].replace(/[0-9]/g, '');
          let b = seq[i + 1].replace(/[0-9]/g, '');
          if (a === 'V' && b === submediant) { alreadyHas = true; break; }
        }
        if (!alreadyHas && Math.random() < 0.5) {
          // 優先找現成的中段 V 級位置
          let vSpots = [];
          for (let i = 1; i < n - 2; i++) {
            if (usedIdx.has(i) || usedIdx.has(i + 1)) continue;
            if (seq[i].replace(/[0-9]/g, '') === 'V' && i + 1 < n - 1) vSpots.push(i);
          }
          if (vSpots.length > 0) {
            let idx = vSpots[Math.floor(Math.random() * vSpots.length)];
            if (!/7|65|43|42/.test(seq[idx]) && Math.random() < 0.5) seq[idx] = 'V7';
            seq[idx + 1] = submediant;
            usedIdx.add(idx); usedIdx.add(idx + 1);
          } else {
            // 沒有現成 V：主動把中段一對相鄰、未被使用的格子改成 V(7)→vi/VI
            let pairSpots = [];
            for (let i = 1; i < n - 2; i++) {
              if (usedIdx.has(i) || usedIdx.has(i + 1)) continue;
              if (i + 1 < n - 1) pairSpots.push(i);
            }
            if (pairSpots.length > 0) {
              let idx = pairSpots[Math.floor(Math.random() * pairSpots.length)];
              seq[idx] = (Math.random() < 0.5) ? 'V7' : 'V';
              seq[idx + 1] = submediant;
              usedIdx.add(idx); usedIdx.add(idx + 1);
            }
          }
        }
      }

      // 最終保底：一定要有副屬和絃（v.100：原本只要有任一 Lv.4 元素即可，拿坡里／皮卡第也算，所以偶爾整題沒有副屬）
      if (!seq.some(s => s.includes('/'))) {
        // 找出所有「下一格正好是可借用目標」的位置，隨機挑一個插入副屬和絃
        // 必須排除 usedIdx（組合包等已鎖定的格子）與其相鄰，避免破壞 I–vii°6–I6 等慣用進行
        let spots = [];
        for (let i = 1; i < n - 1; i++) {
          if (usedIdx.has(i) || usedIdx.has(i + 1)) continue;
          let nb = (seq[i + 1] || '').replace(/[0-9]/g, '');
          if (TARGETS.includes(nb)) spots.push(i);
        }
        if (spots.length > 0) {
          let idx = spots[Math.floor(Math.random() * spots.length)];
          let target = seq[idx + 1].replace(/[0-9]/g, '');
          let inv = pickW(SEC_W);
          // 副屬四二和絃的低音（七音）要下行解決：目標和絃改成第一轉位（vi6／VI6 不用，改別的轉位）
          if (inv === '42') { if (/^(vi|VI)$/.test(target) || usedIdx.has(idx + 1) || idx + 1 >= n - 1) inv = '65'; else seq[idx + 1] = target + '6'; }
          seq[idx] = 'V' + inv + '/' + target;
          usedIdx.add(idx);
        } else {
          // 真的沒有現成銜接點，才強制造一組（位置也隨機化，且避開已鎖定格子）
          let freePairs = [];
          for (let i = 1; i < n - 2; i++) if (!usedIdx.has(i) && !usedIdx.has(i + 1)) freePairs.push(i);
          if (freePairs.length > 0) {
            let target = TARGETS[Math.floor(Math.random() * TARGETS.length)];
            let pos = freePairs[Math.floor(Math.random() * freePairs.length)];
            let inv = pickW(SEC_W); if (inv === '42') inv = '65';
            seq[pos] = 'V' + inv + '/' + target;
            seq[pos + 1] = target;
            usedIdx.add(pos); usedIdx.add(pos + 1);
          }
        }
      }

      if (levelId < 5) return seq;

      // ---------- Lv.5：在 Lv.4 基礎上，強制加入一個增六和絃（每題 100% 出現一次） ----------
      // 增六取代 IV 類功能，一定解決到 V：義/法 直接接原位 V 或 V7；德國增六先接 I64 再到 V（避平行五）。
      {
        const TONIC_UP = isMinor ? 'i' : 'I';
        let augType = ['It6', 'Fr6', 'Ger6'][Math.floor(Math.random() * 3)];
        let placed = false;
        if (augType === 'Ger6') {
          let spots = [];
          for (let i = 1; i <= n - 4; i++) {
            if (usedIdx.has(i) || usedIdx.has(i + 1) || usedIdx.has(i + 2)) continue;
            spots.push(i);
          }
          if (spots.length > 0) {
            let idx = spots[Math.floor(Math.random() * spots.length)];
            seq[idx] = 'Ger6'; seq[idx + 1] = TONIC_UP + '64'; seq[idx + 2] = 'V';
            usedIdx.add(idx); usedIdx.add(idx + 1); usedIdx.add(idx + 2);
            placed = true;
          }
        }
        if (!placed) {
          if (augType === 'Ger6') augType = (Math.random() < 0.5 ? 'It6' : 'Fr6');
          let spots = [];
          for (let i = 1; i <= n - 3; i++) {
            if (usedIdx.has(i) || usedIdx.has(i + 1)) continue;
            spots.push(i);
          }
          if (spots.length > 0) {
            let idx = spots[Math.floor(Math.random() * spots.length)];
            seq[idx] = augType;
            seq[idx + 1] = (Math.random() < 0.5) ? 'V' : 'V7';
            usedIdx.add(idx); usedIdx.add(idx + 1);
            placed = true;
          }
        }
        if (!placed && n >= 3) {
          if (augType === 'Ger6') augType = 'It6';
          seq[n - 3] = augType; seq[n - 2] = 'V';
        }
      }

      return seq;
    },

    // 依和絃記號判斷低音應該落在和絃第幾個音（0=根音,1=三音,2=五音,3=七音）
    getBassIndex: function(sym) {
      if (sym === 'It6' || sym === 'Fr6' || sym === 'Ger6') return 0; // 增六低音固定 b6 (pcs[0])
      if (/65/.test(sym)) return 1;
      if (/43/.test(sym)) return 2;
      if (/42/.test(sym)) return 3;
      if (/64/.test(sym)) return 2;
      if (sym.includes('N')) return 1; // 拿坡里六和絃固定第一轉位
      if (/7/.test(sym)) return 0;
      if (/6/.test(sym)) return 1;
      return 0;
    },

    // 取得該和絃中「不可重複」的音級（導音；副屬和絃另計自己的臨時導音）
    getNoDoublePcs: function(sym, isMinor, keyOffset) {
      let rootLetters = (sym.match(/^[a-zA-Z°]+/) || [''])[0];
      let noDouble = [];
      let globalLeadingTone = (keyOffset + 11) % 12;
      let pcsRaw = this.getChordPcs(sym, isMinor);
      if (pcsRaw.map(p => (p + keyOffset) % 12).includes(globalLeadingTone)) {
        noDouble.push(globalLeadingTone);
      }
      if (sym.includes('/')) {
        // 副屬和絃自己的臨時導音（該和絃的三音）
        noDouble.push((pcsRaw[1] + keyOffset) % 12);
      }
      return noDouble;
    },

    // 取得該和絃「優先重複」的音級（回傳 {pc, second} — 首選重複音級與次選，或 null）。
    // 依古典重複音慣例區分主要/次要三和絃：
    //   I6/V6(i6/V6)  → 重根音，次選五音
    //   ii6/iv6/vi6/vii°6/N6 → 重三音（低音）
    //   I64/中止六四  → 重五音（低音）
    getPreferredDoublePc: function(sym, isMinor, keyOffset) {
      let pcsRaw = this.getChordPcs(sym, isMinor);
      let is7th = /7|65|43|42/.test(sym);
      if (is7th) return null; // 七和絃四音齊全，不談重複
      let rootLetters = (sym.match(/^[a-zA-Z°]+/) || [''])[0];
      let root = (pcsRaw[0] + keyOffset) % 12;
      let third = (pcsRaw[1] + keyOffset) % 12;
      let fifth = (pcsRaw[2] + keyOffset) % 12;

      if (sym.includes('N')) return { pc: third, second: null };  // N6 重三音
      let figure = sym.replace(/^[a-zA-Z°]+/, '').split('/')[0];  // 數字部分

      if (figure === '64') {
        // 第二轉位（含中止六四 I64）：重複五音（低音）
        return { pc: fifth, second: null };
      }
      if (figure === '6') {
        // 第一轉位：主要三和絃(I/IV/V)重根音、可重五音；次要三和絃(ii/vi/vii°)重三音
        let isMajorPrimary = (rootLetters === 'I' || rootLetters === 'i' ||
                              rootLetters === 'IV' || rootLetters === 'iv' ||
                              rootLetters === 'V');
        if (isMajorPrimary) return { pc: root, second: fifth };   // I6/IV6/V6 重根音，次選五音
        return { pc: third, second: null };                       // ii6/vi6/vii°6 重三音
      }
      return null;
    },

    generateLegalVoicings: function(sym, isMinor, keyOffset) {
      let is7th = /7|65|43|42/.test(sym);
      let isAug6 = (sym === 'It6' || sym === 'Fr6' || sym === 'Ger6');
      let pcs = this.getChordPcs(sym, isMinor);
      let bassPc = pcs[this.getBassIndex(sym)];
      if (bassPc === undefined) bassPc = pcs[0];

      // V7 原位（且僅原位）允許省略五音、改重複根音；其餘七和絃一律四音完整
      let rootLetters = (sym.match(/^[a-zA-Z°]+/) || [''])[0];
      let isDomV7Root = is7th && rootLetters === 'V' && !/6|65|43|42|64/.test(sym);
      let fifthPc = pcs[2];

      pcs = pcs.map(p => (p + keyOffset) % 12); 
      bassPc = (bassPc + keyOffset) % 12;
      fifthPc = (fifthPc + keyOffset) % 12;
      let noDoublePcs = this.getNoDoublePcs(sym, isMinor, keyOffset);
      let requiredPcs = pcs.slice(); // 這些和絃音都必須出現
      // 增六：It6 重複根音(1)、四聲部三音；Fr6/Ger6 四音各一
      let augRootPc = isAug6 ? (0 + keyOffset) % 12 : null; // 增六的「1」音

      let voicings = [];
      // 四聲部標準合唱音域 (MIDI)：S:C4-G5, A:G3-C5, T:C3-G4, B:F2-C4
      const B_RANGE = [41, 60], T_RANGE = [48, 67], A_RANGE = [55, 72], S_RANGE = [60, 79];
      for (let b = B_RANGE[0]; b <= B_RANGE[1]; b++) {
        if (b % 12 !== bassPc) continue;
        for (let t = Math.max(T_RANGE[0], b + 1); t <= Math.min(T_RANGE[1], b + 24); t++) {
          if (!pcs.includes(t % 12)) continue;
          for (let a = Math.max(A_RANGE[0], t + 1); a <= Math.min(A_RANGE[1], t + 12); a++) {
            if (!pcs.includes(a % 12)) continue;
            for (let s = Math.max(S_RANGE[0], a + 1); s <= Math.min(S_RANGE[1], a + 12); s++) {
              if (!pcs.includes(s % 12)) continue;
              let counts = {};
              [b, t, a, s].forEach(x => { let p = x % 12; counts[p] = (counts[p] || 0) + 1; });
              let presentPcs = Object.keys(counts).length;

              if (isAug6) {
                // 增六完整性：所有和絃音都必須出現；It6(3音)重複根音1、Fr6/Ger6(4音)各一
                let missingCount = requiredPcs.filter(p => counts[p] === undefined).length;
                if (missingCount !== 0) continue;
                if (sym === 'It6') {
                  // It6 只有 3 種音，第 4 個聲部必須是重複根音(1)，不可重複 b6 或 #4（特徵音不重複）
                  if ((counts[augRootPc] || 0) < 2) continue;
                }
                // 特徵音 b6(低音) 與 #4 都不可重複（張力音）
                let sharp4Pc = (6 + keyOffset) % 12;
                let flat6Pc = (8 + keyOffset) % 12;
                if ((counts[sharp4Pc] || 0) >= 2) continue;
                if ((counts[flat6Pc] || 0) >= 2) continue;
              } else if (is7th) {
                // 七和絃完整性：四音必須全到；唯 V7 原位可省略五音（此時允許只有 3 種音）
                let missing = requiredPcs.filter(p => !(p in counts) && !(counts[p] === undefined ? false : true));
                let missingCount = requiredPcs.filter(p => counts[p] === undefined).length;
                if (isDomV7Root) {
                  // 允許：四音全到，或缺五音（且此時必然重複根音）
                  let missingFifth = (counts[fifthPc] === undefined);
                  if (missingCount === 0) { /* ok，四音全到 */ }
                  else if (missingCount === 1 && missingFifth) { /* ok，僅省略五音 */ }
                  else continue;
                } else {
                  if (missingCount !== 0) continue; // 其餘七和絃：任何和絃音缺一律淘汰
                }
              } else {
                // 三和絃：預設三音齊全。例外——原位主和絃 I/i 允許省略五音、三倍根音
                // （供 V7→I 完整解決，導音上行、七音下行時的標準寫法）。
                let isRootTonicTriad = (rootLetters === 'I' || rootLetters === 'i') && !/6|64/.test(sym);
                if (presentPcs < 3) {
                  if (isRootTonicTriad && (counts[bassPc] || 0) >= 3 && (counts[(pcs[1]) % 12] || 0) >= 1) {
                    // 允許：三倍根音 + 三音（省略五音）
                  } else {
                    continue;
                  }
                }
              }

              if (sym.includes('64') && (b%12 !== t%12 && b%12 !== a%12 && b%12 !== s%12)) continue;
              if (sym.includes('N') && (b%12 !== t%12 && b%12 !== a%12 && b%12 !== s%12)) continue;
              // vii°6 強制重複三音（=低音）：減三和絃的三音就是低音，重複它可自然避免減五度攤在兩聲部間
              if (rootLetters === 'vii°' && /6/.test(sym) && !/7|65|43|42/.test(sym)) {
                let thirdPc = (pcs[1]) % 12; // 三音（第一轉位的低音）
                if ((counts[thirdPc] || 0) < 2) continue; // 沒有重複三音就淘汰
              }
              // 原位主和絃 I/i：硬性禁止重複五音（只能重根音，最穩定；I6 才可重五音）
              if ((rootLetters === 'I' || rootLetters === 'i') && !/6|64|7|65|43|42/.test(sym)) {
                if ((counts[fifthPc] || 0) >= 2) continue; // 重五音一律淘汰
              }
              if (noDoublePcs.some(p => (counts[p] || 0) >= 2)) continue; // 不重複導音
              voicings.push([s, a, t, b]);
            }
          }
        }
      }
      return voicings.slice(0, 120);
    },

    // 取得該和絃的導音音級與應解決到的音級（供聲部進行規則檢查用）
    getResolutionMeta: function(sym, isMinor, keyOffset) {
      let rootLetters = (sym.match(/^[a-zA-Z°]+/) || [''])[0];
      let isDom = rootLetters === 'V' || rootLetters === 'vii°' || sym.includes('/');
      let is7th = /7|65|43|42/.test(sym);
      let pcsRaw = this.getChordPcs(sym, isMinor);
      let pcs = pcsRaw.map(p => (p + keyOffset) % 12);

      let leadingTonePc = null, resolvePc = null;
      if (isDom) {
        leadingTonePc = (rootLetters === 'vii°') ? pcs[0] : pcs[1];
        resolvePc = (leadingTonePc + 1) % 12;
      }
      let seventhPc = is7th ? pcs[3] : null;

      // 增六和絃特徵音解決：b6(低音) 下行半音、#4 上行半音，兩者一起收到 V 的根音(=屬音)
      let aug6 = null;
      if (sym === 'It6' || sym === 'Fr6' || sym === 'Ger6') {
        let flat6Pc = (8 + keyOffset) % 12;
        let sharp4Pc = (6 + keyOffset) % 12;
        let dominantRootPc = (7 + keyOffset) % 12; // V 的根音 = 屬音
        aug6 = { flat6Pc, sharp4Pc, resolveToPc: dominantRootPc };
      }
      return { leadingTonePc, resolvePc, seventhPc, aug6 };
    },

    // v.100 規則 3：原位三和絃一律重複根音、三音齊全。
    //   例外：V 類（任何轉位，副屬除外）接 vi／VI 重複三音。
    //   （正格終止 V7→I 由屬七省五重根、I 維持完整，見 dominantSeventhOK）
    isRootTriad: function(sym) { return /^(I|ii|iii|IV|V|vi|vii°|i|ii°|III|iv|VI)$/.test(sym || ''); },
    rootTriadDoublingOK: function(v, sym, prevSym, isMinor, keyOffset) {
      // v.100：V 類（任何轉位，副屬除外）接 vi6／VI6 也一律重複三音（＝低音、主音），三音齊全
      if ((sym === 'vi6' || sym === 'VI6') && /^V/.test(prevSym || '') && !(prevSym || '').includes('/')) {
        let q = this.getChordPcs(sym, isMinor).map(x => (x + keyOffset) % 12);
        let c = {}; v.forEach(x => { let r = x % 12; c[r] = (c[r] || 0) + 1; });
        return q.every(x => c[x]) && c[q[1]] === 2;
      }
      if (!this.isRootTriad(sym)) return true;
      let p = this.getChordPcs(sym, isMinor).map(x => (x + keyOffset) % 12);
      let cnt = {}; v.forEach(x => { let q = x % 12; cnt[q] = (cnt[q] || 0) + 1; });
      let afterV = /^V/.test(prevSym || '') && !(prevSym || '').includes('/'); // V 類（任何轉位）接 vi／VI 都重複三音
      // v.111：四音完整的 V7 接 I，I 可以省五音（三個根音＋一個三音）；只接在完整的 V7 後面（聲部進行時再確認）
      if (/^V7(\/|$)/.test(prevSym || '') && this.isAuthenticV7(prevSym, sym) && cnt[p[0]] === 3 && cnt[p[1]] === 1 && !cnt[p[2]]) return true;
      if (!p.every(x => cnt[x])) return false;
      let want = (afterV && (sym === 'vi' || sym === 'VI')) ? p[1] : p[0];
      return cnt[want] === 2;
    },

    // v.100：原位屬七（V7、V7/x）在正格終止——V7 接原位 I／i、V7/x 接原位 x（他調的正格終止）——用省五重根；
    //   其他情況（假終止、接轉位、接 N6 或增六等）一律四音完整。轉位的屬七本來就要求四音完整。
    isAuthenticV7: function(sym, nextSym) {
      if (!/^V7(\/|$)/.test(sym || '') || !nextSym) return false;
      if (sym === 'V7') return nextSym === 'I' || nextSym === 'i';
      return nextSym === sym.split('/')[1];
    },
    dominantSeventhOK: function(v, sym, nextSym, isMinor, keyOffset) {
      if (!/^V7(\/|$)/.test(sym || '')) return true;
      let p = this.getChordPcs(sym, isMinor).map(x => (x + keyOffset) % 12);
      let cnt = {}; v.forEach(x => { let q = x % 12; cnt[q] = (cnt[q] || 0) + 1; });
      // v.111：正格終止的 V7 可以省五重根，也可以四音完整（完整時接的 I 省五音）
      if (this.isAuthenticV7(sym, nextSym)) return (cnt[p[0]] === 2 && !cnt[p[2]] && cnt[p[1]] === 1 && cnt[p[3]] === 1) || p.every(x => cnt[x] === 1);
      return p.every(x => cnt[x] === 1);
    },

    solveVoiceLeading: function(degSeq, isMinor, keyOffset) {
      let allVoicings = degSeq.map(sym => this.generateLegalVoicings(sym, isMinor, keyOffset));
      allVoicings = allVoicings.map((vs, i) => vs.filter(v => this.rootTriadDoublingOK(v, degSeq[i], degSeq[i - 1], isMinor, keyOffset)
                                                        && this.dominantSeventhOK(v, degSeq[i], degSeq[i + 1], isMinor, keyOffset)));
      if (this.__filterVoicings) allVoicings = this.__filterVoicings(allVoicings, degSeq);   // 聖詠和聲專用掛鉤（四部和聲頁面不用）
      if (allVoicings.some(v => v.length === 0)) return null; // 有和絃完全找不到可用聲位
      // v.100：音域偏好（軟性）——高音聲部低於 A4（69）時，每低一個半音加成本，避免整題貼著 C4 寫
      const REG_W = 2.0;
      const regPen = v => REG_W * Math.max(0, 69 - v[0]);
      let dp = allVoicings[0].map(v => ({ cost: regPen(v) + (this.__startCost ? this.__startCost(v) : 0), path: [v], last: v }));
      // 供增二度偵測用：此調的名稱與主音字母索引
      let _keyObj = (typeof ALL_KEYS !== 'undefined') ? ALL_KEYS.find(k => k.off === keyOffset && k.isMin === isMinor) : null;
      let _keyName = _keyObj ? _keyObj.name : 'C 大調';
      const _LI = { 'C':0,'D':1,'E':2,'F':3,'G':4,'A':5,'B':6 };
      let _tonicLetterIdx = _keyObj ? _LI[(_keyObj.vfk || 'C')[0].toUpperCase()] : 0;
      
      for (let i = 1; i < degSeq.length; i++) {
        let nextDp = []; let targetVoicings = allVoicings[i];
        let prevSym = degSeq[i - 1]; let currSym = degSeq[i];
        let prevBase = prevSym.replace(/[0-9]/g, ''); let currBase = currSym.replace(/[0-9]/g, '');
        let isDeceptive = (prevBase === 'V' && (currBase === 'vi' || currBase === 'VI'));
        // v.100：原位三和絃接原位三和絃（規則 1、2、5）；原位 V／V7 接原位 vi／VI（規則 4）
        let rootToRoot = this.isRootTriad(prevSym) && this.isRootTriad(currSym);
        let deceptiveRoot = /^V7?$/.test(prevSym) && (currSym === 'vi' || currSym === 'VI');
        let minorIIV = rootToRoot && isMinor && prevSym === 'ii°' && currSym === 'V';
        let rtPrevPcs = this.getChordPcs(prevSym, isMinor).map(x => (x + keyOffset) % 12);
        let rtCommon = rtPrevPcs.filter(x => this.getChordPcs(currSym, isMinor).map(y => (y + keyOffset) % 12).includes(x));
        let keyLeadingTone = (keyOffset + 11) % 12;
        // v.100：經過／持續六四的低音（終止六四沿用原本的「可原音或往下跳八度」）
        let k64Curr = /64$/.test(currSym) && !currSym.includes('/') ? this.sixFourKind(currSym, prevSym, degSeq[i + 1]) : null;
        let k64Prev = /64$/.test(prevSym) && !prevSym.includes('/') ? this.sixFourKind(prevSym, degSeq[i - 2], currSym) : null;
        let meta = this.getResolutionMeta(prevSym, isMinor, keyOffset);
        // 當前和絃「優先重複」的音級（首選/次選）
        let prefDbl = this.getPreferredDoublePc(currSym, isMinor, keyOffset);
        if (isDeceptive && prefDbl === null) {
          // 假終止：vi/VI 重複三音（三音 = 該和絃 pcs[1]，也就是調的主音）
          let curPcs = this.getChordPcs(currSym, isMinor);
          prefDbl = { pc: (curPcs[1] + keyOffset) % 12, second: null };
        }

        // 原則 1：ii 類 → V 類的反向進行判斷
        let prevIsII = (prevBase === 'ii' || prevBase === 'ii°');
        let currIsV = (currBase === 'V');
        let iiToV = prevIsII && currIsV;
        let iiToV_is7 = iiToV && /7|65|43|42/.test(prevSym) && /7|65|43|42/.test(currSym);
        // ii7→V7 需保持的共同音三音（前和絃的三音 pc）
        let iiSeventhCommonPc = null;
        if (iiToV_is7) {
          let iiPcs = this.getChordPcs(prevSym, isMinor);
          iiSeventhCommonPc = (iiPcs[1] + keyOffset) % 12; // ii7 的三音 = V7 的七音，是共同保持音
        }

        // V7→I 省五重根優先：偵測 prevSym 是否為原位 V7、curr 是否為 I/i
        // 若前一格 V7 用「省略五音、重複根音」的配置，給成本優惠（軟性優先，最順的解決法）
        let prevIsDomV7Root = /^V/.test(prevBase) && /7/.test(prevSym) && !/6|65|43|42|64/.test(prevSym);
        let currIsTonic = (currBase === 'I' || currBase === 'i');
        let v7ToI = prevIsDomV7Root && currIsTonic;
        let v7RootPc = null, v7FifthPc = null;
        if (v7ToI) {
          let vp = this.getChordPcs(prevSym, isMinor);
          v7RootPc = (vp[0] + keyOffset) % 12;
          v7FifthPc = (vp[2] + keyOffset) % 12;
        }

        for (let tv of targetVoicings) {
          // v.100：同一個聲位，依「這一步各聲部有沒有跳四／五度、往哪個方向」分開各留一條最佳路徑。
          // 「四度跳進後要反向、不可再跳四度」要看前一步；只留成本最低的一條，會把其實接得下去的路丟掉，誤判成無解。
          let bestBySig = {};
          // 重複音偏好成本：重複到首選音=0；次選音=小懲罰；其他音=大懲罰（軟性引導）
          let doublingPenalty = 0;
          if (prefDbl !== null) {
            let counts = {};
            tv.forEach(x => { let p = x % 12; counts[p] = (counts[p] || 0) + 1; });
            let doubledPc = Object.keys(counts).find(p => counts[p] >= 2);
            if (doubledPc !== undefined) {
              let dp2 = Number(doubledPc);
              if (dp2 === prefDbl.pc) doublingPenalty = 0;
              else if (prefDbl.second !== null && dp2 === prefDbl.second) doublingPenalty = 3;
              else doublingPenalty = 10;
            }
          }
          for (let prevNode of dp) {
            let pv = prevNode.last;
            // 防聲部超越
            if (tv[0] < pv[1] || tv[1] < pv[2] || tv[2] < pv[3]) continue;
            
            // 上三聲部（S/A/T, index 0-2）跳進規則：
            //   - 不可三全音、不可超過完全五度（7 半音）
            //   - 四度(5)或五度(7)跳進後，下一步必須反向
            let leapViolation = false;
            let prevPrev = (prevNode.path.length >= 2) ? prevNode.path[prevNode.path.length - 2] : null;
            for (let v = 0; v < 3; v++) {
                let move = tv[v] - pv[v];
                let leap = Math.abs(move);
                // 聖詠和聲掛鉤（__sopLeap）：女高音可以跳到完全五度（不含三全音），跳完一定要反向
                let lim = (v === 0 && this.__sopLeap) ? 7 : 5;
                if (leap > lim || leap === 6) { leapViolation = true; break; } // v.100：超過完全四度（含三全音、五度）一律不行
                // 四度或五度跳進後反向：檢查「前一步」是否為四/五度跳進，若是，這一步必須反向
                if (prevPrev !== null) {
                  let prevMove = pv[v] - prevPrev[v];
                  let pl = Math.abs(prevMove);
                  if (pl === 5 || pl === 7) {
                    if (move !== 0 && Math.sign(move) === Math.sign(prevMove)) { leapViolation = true; break; }
                    if (v === 0 && this.__sopLeap && move === 0) { leapViolation = true; break; }   // 聖詠：女高音跳四、五度後不可停在原音
                    if (leap === 5 || leap === 7) { leapViolation = true; break; } // v.100：四度跳進後不可馬上再跳四度
                  }
                }
            }
            if (leapViolation) continue;

            // 禁止增二度旋律進行：任一聲部移動 3 半音，若兩音拼寫為「相鄰字母」(二度關係)即為增二度，淘汰
            let aug2 = false;
            for (let v = 0; v < 4; v++) {
              if (Math.abs(tv[v] - pv[v]) !== 3) continue; // 只有 3 半音移動才可能是增二度
              let l1 = letterIndexOfTone(pv[v] % 12, prevSym, keyOffset, _keyName, _tonicLetterIdx);
              let l2 = letterIndexOfTone(tv[v] % 12, currSym, keyOffset, _keyName, _tonicLetterIdx);
              let gap = Math.abs(l1 - l2); gap = Math.min(gap, 7 - gap);
              if (gap === 1) { aug2 = true; break; } // 字母相鄰 + 3半音 = 增二度
            }
            if (aug2) continue;

            // 低音聲部（index 3）避免跳進超過完全五度，但保留合理大跳：
            //   (a) 終止式 V→I 的低音四/五度跳
            //   (b) 低音八度跳（同音名不同八度）——I64→V 的八度跳只允許下行（由高接低）
            let bassLeap = Math.abs(tv[3] - pv[3]);
            if (bassLeap === 6) continue; // 低音也不可三全音跳
            if (bassLeap > 7) {
              let isVtoI = (prevBase === 'V') && (currBase === 'I' || currBase === 'i');
              let isOctaveJump = (bassLeap === 12) && (tv[3] % 12 === pv[3] % 12);
              // I64→V 的八度跳：只允許低音下行（tv[3] < pv[3]，由高接低）
              let prevIs64 = /64/.test(prevSym);
              if (isOctaveJump && prevIs64 && currBase === 'V') {
                if (tv[3] >= pv[3]) continue; // 上行八度跳不允許
              }
              if (!(isVtoI || isOctaveJump)) continue;
            }
            // 低音四/五度跳進後也必須反向（多用轉位讓低音級進、避免低音跳來跳去）
            if (prevPrev !== null) {
              let prevBassMove = pv[3] - prevPrev[3];
              let pbl = Math.abs(prevBassMove);
              let curBassMove = tv[3] - pv[3];
              if ((pbl === 5 || pbl === 7) && curBassMove !== 0 && Math.sign(curBassMove) === Math.sign(prevBassMove)) continue;
            }

            // 防平行五度/八度 ＋ 外聲部隱伏五度/隱伏八度 ＋ 減五度→完全五度
            let hasParallel = false;
            for (let v1 = 0; v1 < 3; v1++) {
              for (let v2 = v1 + 1; v2 < 4; v2++) {
                let rawPrev = Math.abs(pv[v1] - pv[v2]);
                let rawCurr = Math.abs(tv[v1] - tv[v2]);
                let ivPrev = rawPrev % 12;
                let ivCurr = rawCurr % 12;
                let sameDir = (tv[v1] - pv[v1]) * (tv[v2] - pv[v2]) > 0;
                if ((ivPrev === 7 && ivCurr === 7) || (ivPrev === 0 && ivCurr === 0)) {
                  if (sameDir) { hasParallel = true; break; }
                }
                // 減五度(6)→完全五度(7) 同向進行：一律禁止（不分聲部）
                if (ivPrev === 6 && ivCurr === 7 && sameDir) { hasParallel = true; break; }
                // 外聲部（S=0, B=3）隱伏五度/隱伏八度：同向進行且到達完全協和音程，且高音（S）為跳進
                if (v1 === 0 && v2 === 3 && (ivCurr === 7 || ivCurr === 0) && ivPrev !== ivCurr) {
                  if (sameDir && Math.abs(tv[0] - pv[0]) > 2) { hasParallel = true; break; }
                }
              }
              if (hasParallel) break;
            }
            if (hasParallel) continue;

            // 假終止（V/V7 -> vi/VI）：外聲部不可同向擴大到完全音程
            if (isDeceptive) {
              if ((tv[3] - pv[3]) > 0 && (tv[0] - pv[0]) > 0) continue;
            }

            // 導音解決規則
            if (meta.leadingTonePc !== null) {
              let leadingViolation = false;
              for (let v = 0; v < 4; v++) {
                if (pv[v] % 12 !== meta.leadingTonePc) continue;
                let nextPc = tv[v] % 12;
                if (nextPc === meta.resolvePc && tv[v] - pv[v] === 1) continue; // 正確上行解決到主音（v.100：要實際上行半音，不可跨八度）
                if (isDeceptive) {
                  // 假終止 V→vi/VI：導音「一定要」上行到主音，不允許任何例外
                  leadingViolation = true; break;
                }
                if ((v === 1 || v === 2) && tv[v] === pv[v]) { // v.100：保留＝原音高不動
                  // 一般情況內聲部可保留共同音。v.100：副屬的臨時導音必須是「同音名」保留；
                  // 異名同音（例如 V/vi 的升五級在增六裡變成降六級）等於沒有解決，不行
                  if (!prevSym.includes('/')) continue;
                  let l1 = letterIndexOfTone(pv[v] % 12, prevSym, keyOffset, _keyName, _tonicLetterIdx);
                  let l2 = letterIndexOfTone(tv[v] % 12, currSym, keyOffset, _keyName, _tonicLetterIdx);
                  if (l1 === l2) continue;
                }
                leadingViolation = true; break;
              }
              if (leadingViolation) continue;
            }

            // 七和絃的七音必須下行一步解決（允許同和絃延續保留）
            if (meta.seventhPc !== null) {
              let seventhViolation = false;
              for (let v = 0; v < 4; v++) {
                if (pv[v] % 12 !== meta.seventhPc) continue;
                let nextPc = tv[v] % 12;
                let downStep = ((meta.seventhPc - nextPc + 12) % 12);
                if ((downStep === 1 || downStep === 2) && pv[v] - tv[v] === downStep) continue; // 下行一個半音或全音（v.100：要實際下行，不可跨八度）
                if (tv[v] === pv[v]) continue; // 同和絃延續保留（v.100：原音高不動，跳八度不算）
                seventhViolation = true; break;
              }
              if (seventhViolation) continue;
            }

            // 增六和絃特徵音強制解決：b6 下行半音、#4 上行半音，一起收到 V 的根音(屬音)
            if (meta.aug6 !== null) {
              let aug6Violation = false;
              for (let v = 0; v < 4; v++) {
                let pPc = pv[v] % 12;
                if (pPc === meta.aug6.flat6Pc) {
                  // b6 必須下行半音到屬音
                  if (!((pv[v] - tv[v]) === 1 && tv[v] % 12 === meta.aug6.resolveToPc)) { aug6Violation = true; break; }
                }
                if (pPc === meta.aug6.sharp4Pc) {
                  // #4 必須上行半音到屬音
                  if (!((tv[v] - pv[v]) === 1 && tv[v] % 12 === meta.aug6.resolveToPc)) { aug6Violation = true; break; }
                }
              }
              if (aug6Violation) continue;
            }

            // v.100：經過六四低音級進同向、持續六四低音原音高不動
            {
              let bm = tv[3] - pv[3];
              if (k64Curr === 'pedal' && bm !== 0) continue;
              if (k64Curr === 'pass' && !(Math.abs(bm) === 1 || Math.abs(bm) === 2)) continue;
              if (k64Prev === 'pedal' && bm !== 0) continue;
              if (k64Prev === 'pass') {
                let pbm = prevPrev ? pv[3] - prevPrev[3] : 0;
                if (!((Math.abs(bm) === 1 || Math.abs(bm) === 2) && Math.sign(bm) === Math.sign(pbm))) continue;
              }
            }

            // v.100 規則 1、2、4、5（上方三聲部）
            {
              let bd = Math.sign(tv[3] - pv[3]);
              let rv = false;
              const v0 = this.__sopFree ? 1 : 0;   // 聖詠和聲試用：女高音不受「共同音保持」「無共同音反向」限制（導音仍要上行）
              if (deceptiveRoot) {
                // 假終止：導音上行到主音，其餘聲部與低音反向
                for (let v = 0; v < 3; v++) {
                  if (pv[v] % 12 === keyLeadingTone) { if (tv[v] - pv[v] !== 1) { rv = true; break; } }
                  else if (v >= v0 && Math.sign(tv[v] - pv[v]) !== -bd) { rv = true; break; }
                }
              } else if (minorIIV) {
                // 小調 ii°→V：低音只能上行，上方三聲部無條件反向（下行）
                if (bd <= 0) rv = true;
                else for (let v = v0; v < 3; v++) if (tv[v] >= pv[v]) { rv = true; break; }
              } else if (rootToRoot && rtCommon.length > 0) {
                // 有共同音：共同音保持在原聲部。同一共同音若在兩個聲部（假終止後 vi 重三音、V7 後 I 三倍根音），
                // 保持其中一個即可，另一個可以離開，否則下一個和絃會被迫重複錯的音（例如 V→vi→IV 的 IV 重五音）
                for (let c of rtCommon) {
                  let had = 0, kept = 0;
                  for (let v = v0; v < 3; v++) if (pv[v] % 12 === c) { had++; if (tv[v] === pv[v]) kept++; }
                  if (had > 0 && kept === 0) { rv = true; break; }
                }
              } else if (rootToRoot) {
                // 沒有共同音：上方三聲部全部與低音反向
                for (let v = v0; v < 3; v++) if (Math.sign(tv[v] - pv[v]) !== -bd) { rv = true; break; }
              }
              if (rv) continue;
            }

            let dist = Math.abs(tv[0]-pv[0]) + Math.abs(tv[1]-pv[1]) + Math.abs(tv[2]-pv[2]) + Math.abs(tv[3]-pv[3]) * 0.5;
            if (tv[0] === pv[0] || tv[1] === pv[1]) dist -= 2;
            dist += doublingPenalty; // 重複音偏好
            dist += regPen(tv);      // v.100：音域偏好

            // V7→I 省五重根優先（軟性）：若前一格 V7 省略五音、重複根音，給成本優惠。
            // 這會讓 V7 傾向省五重根配置，使 ii→V7 共同音自然保持、V7→I 無跳進。
            if (v7ToI) {
              let pcnt = {};
              pv.forEach(x => { let p = x % 12; pcnt[p] = (pcnt[p] || 0) + 1; });
              let omitsFifth = !(v7FifthPc in pcnt);
              let doublesRoot = (pcnt[v7RootPc] || 0) >= 2;
              if (omitsFifth && doublesRoot) dist -= 4; // 優惠，優先選省五重根的 V7 配置
            }

            // v.111：省五音的 I 只能接在四音完整的 V7 後面（省五的 V7 一定接完整的 I）
            if (/^V7(\/|$)/.test(prevSym) && this.isAuthenticV7(prevSym, currSym)) {
              let cp = this.getChordPcs(currSym, isMinor).map(x => (x + keyOffset) % 12), pp = this.getChordPcs(prevSym, isMinor).map(x => (x + keyOffset) % 12);
              if (!tv.some(x => x % 12 === cp[2]) && !pv.some(x => x % 12 === pp[2])) continue;
            }
            // 原則 1（硬性）：ii 類 → V 類，上三聲部必須與低音反向，違反直接淘汰
            if (iiToV_is7) {   // v.111：ii 類七和絃接 V 類七和絃：共同音（2 級、4 級）保持；共同音若成為 V 的低音，上方聲部不必保持。其他聲部照一般規則
              let cpcs = this.getChordPcs(currSym, isMinor).map(x => (x + keyOffset) % 12);
              let ppcs = this.getChordPcs(prevSym, isMinor).map(x => (x + keyOffset) % 12);
              let common = ppcs.filter(x => cpcs.includes(x)), bad = false;
              for (let vv = 0; vv < 3; vv++) if (common.includes(pv[vv] % 12) && pv[vv] % 12 !== tv[3] % 12 && tv[vv] !== pv[vv]) { bad = true; break; }
              if (bad) continue;
            } else if (iiToV && !rootToRoot) { // v.100：原位 ii→V 改由規則 1／5 處理（大調保持共同音）
              let bassDir = Math.sign(tv[3] - pv[3]); // 低音方向
              if (bassDir !== 0) {
                let viol = false;
                for (let vv = 0; vv < 3; vv++) { // S/A/T 三個上聲部
                  if (iiToV_is7 && pv[vv] % 12 === iiSeventhCommonPc && tv[vv] % 12 === iiSeventhCommonPc) {
                    // ii7→V7：共同音三音保持不動，合規
                    continue;
                  }
                  let vDir = Math.sign(tv[vv] - pv[vv]);
                  // 保持不動（呆滯）或與低音同向 → 違反反向原則，淘汰
                  if (vDir === 0 || vDir === bassDir) { viol = true; break; }
                }
                if (viol) continue;
              }
            }

            let sig = '';
            for (let v = 0; v < 4; v++) { let m = tv[v] - pv[v], am = Math.abs(m); sig += (am === 5 || am === 7) ? m + ',' : '0,'; }
            if (k64Curr === 'pass') sig += 'b' + Math.sign(tv[3] - pv[3]); // 經過六四：下一步要同方向，方向不同的路徑分開留
            let cand = prevNode.cost + dist + (this.__extraCost ? this.__extraCost(pv, tv, i, prevPrev) : 0);
            if (!bestBySig[sig] || cand < bestBySig[sig].cost) bestBySig[sig] = { cost: cand, path: prevNode.path.concat([tv]) };
          }
          for (let sig in bestBySig) nextDp.push({ cost: bestBySig[sig].cost, path: bestBySig[sig].path, last: tv });
        }
        
        // 找不到任何合規路徑：不再放行違規和絃，直接回傳 null，由出題流程換一組級數重新出題
        if (nextDp.length === 0) return null;
        dp = nextDp;
      }
      dp.sort((a,b) => a.cost - b.cost);
      return dp[0] ? dp[0].path : null;
    }
  };


  root.ChoraleEngine = { HARMONY_ENGINE: HARMONY_ENGINE, ALL_KEYS: ALL_KEYS, displayChord: displayChord, normalizeChord: normalizeChord,
    letterIndexOfTone: letterIndexOfTone, getDefaultAccidental: getDefaultAccidental, resolveAccidental: resolveAccidental, accToSemi: accToSemi,
    getSpellingByMidiAndKey: getSpellingByMidiAndKey, isHalfDim7: isHalfDim7 };
})(typeof window !== 'undefined' ? window : self);
