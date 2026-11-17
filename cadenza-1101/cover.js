/* ===== 音樂聽力出考卷：封面（v108.1）=====
   封面和 App 的封面一樣（每次打開都先看到），按「開始出題 →」才進入工具。
   贊助、作者主頁、金色樂友的彈窗與按鈕照 App 原樣；以下函式也是從 App 的 index.html 複製。
   贊助者名單（SPONSORS）不複製：每次打開時從 App 的 index.html 讀，App 更新名單這裡就跟著更新。 */
var SPONSORS = [];
(function () {
  fetch('../index.html', { cache: 'no-cache' }).then(function (r) { return r.text(); }).then(function (t) {
    var m = t.match(/var SPONSORS = (\[[\s\S]*?\]);/);
    if (!m) return;
    try { SPONSORS = (new Function('return ' + m[1]))() || []; } catch (e) { SPONSORS = []; }
    var b = document.getElementById('sponsorEntryBtn');
    if (b && SPONSORS.length) b.style.display = '';
  }).catch(function () {});
})();
function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
function syncBodyLock(){
  var open = document.querySelectorAll('.donate-modal.open').length > 0;
  document.body.style.overflow = open ? 'hidden' : '';
}
function showPanel(which){
  var ids = ['Jko','Bank','Sponsors'];
  var ch = document.getElementById('donateChannels');
  if(ch) ch.style.display = which ? 'none' : 'flex';
  var intro = document.getElementById('donateIntro');
  if(intro) intro.style.display = which ? 'none' : 'block';
  ids.forEach(function(k){
    var el = document.getElementById('donate'+k);
    if(el) el.style.display = (which === k) ? 'flex' : 'none';
  });
  if(which === 'Sponsors') renderSponsors();
}
function renderSponsors(){
  var box = document.getElementById('sponsorList'); if(!box) return;
  var tag = function(s){ return '<span'+(s.gold ? ' class="sponsor-gold"' : '')+'>'+escapeHtml(s.name)+'</span>'; };
  var normal = [], gold = [];
  SPONSORS.forEach(function(s){ (s.gold ? gold : normal).push(s); });
  var html = normal.map(tag).join('');
  if(normal.length && gold.length) html += '<div class="sponsor-sep"></div>';
  html += gold.map(tag).join('');
  box.innerHTML = html + '<button type="button" class="sponsor-info-btn" aria-label="金色樂友說明" onclick="showGoldInfo()">i</button>';
}
function showDonate(){ showPanel(''); var m=document.getElementById('donateModal'); if(m) m.classList.add('open'); syncBodyLock(); }
function closeDonate(){ var m=document.getElementById('donateModal'); if(m) m.classList.remove('open'); syncBodyLock(); }
function showAuthor(){ var m=document.getElementById('authorModal'); if(m) m.classList.add('open'); syncBodyLock(); }
function closeAuthor(){ var m=document.getElementById('authorModal'); if(m) m.classList.remove('open'); syncBodyLock(); }
function showGoldInfo(){ var m=document.getElementById('goldInfoModal'); if(m) m.classList.add('open'); syncBodyLock(); }
function closeGoldInfo(){ var m=document.getElementById('goldInfoModal'); if(m) m.classList.remove('open'); syncBodyLock(); }
function _fallbackCopy(t){ try{ var ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }catch(_){} }
function copyText(e, text){
  if(e){ e.preventDefault(); e.stopPropagation(); }
  var btn = e && e.target;
  function done(){ if(btn){ var t=btn.textContent; btn.textContent='已複製'; setTimeout(function(){ btn.textContent=t; }, 1400); } }
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(done, function(){ _fallbackCopy(text); done(); }); }
    else { _fallbackCopy(text); done(); }
  }catch(_){ _fallbackCopy(text); done(); }
}
document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ closeDonate(); closeAuthor(); closeGoldInfo(); } });
function startMaker(){ document.getElementById('coverPage').classList.add('off'); }
function showCover(){ var c=document.getElementById('coverPage'); c.classList.remove('off'); c.scrollTop=0; }
