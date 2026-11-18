const CACHE_NAME = 'ear-training-shell-v109'; // v.109：四部和聲正解改數字低音寫法、增六按鈕；出題工具和聲作業模式、間距移到預覽頁；v.108：出題工具「音聽出考卷」手機版、PDF 匯出、主畫面圖示；App 各頁加分頁小圖示；v.107：模擬測驗調整（大學檔和絃含轉位、兩聲部拍號隨機、四部和聲 80；高中檔速度放慢、連結線 0～1 條）；v.106.8：出題工具套用模板、配分、找錯音解答顏色、四部和聲 C 拍號；練習頁加 fromExam 接口（?maker=1）；v.106.7：出題工具的音程、和絃、音堆每格改終止線、播放鈕縮小；v.106.6：出題工具的音堆改成大譜表連續格子；v.106.5：兩聲部、找錯音、音堆頁加入出題模式接口；v.106.3：和絃、單旋律、四部和聲頁加入出題模式接口；v.106.2：音程、節奏頁加入出題模式接口（?maker=1，出題工具 cadenza-1101 專用）；v.106.1：節奏、單旋律、兩聲部（找錯音出題）新增三種兩拍節奏型；v.106：音程／和絃不出音高相同的題目、速度標 ♩／♪、錯題本拉桿、贊助者版 MusicXML 匯出

/* 你自己的頁面與程式：採「網路優先」，一更新使用者下次開啟就是新版 */
const APP_SHELL = [
  './',
  './index.html',
  './exam.html',
  './exam-common.js',
  './chord-trainer.html',
  './interval-trainer.html',
  './rhythm-trainer.html',
  './melody-trainer.html',
  './two-part-trainer.html',
  './four-part-trainer.html',
  './pitch-error-trainer.html',
  './pitch-stack-trainer.html',
  './manifest.json'
];

/* 固定不變的資源：採「快取優先」，只下載一次，之後離線也能用、開啟更快。
   要更新這些檔案時，把上面的 CACHE_NAME 版號一升即可全部重抓。 */
const STATIC_ASSETS = [
  './vexflow-min.js',
  './soundfont-player.min.js',
  './piano-engine.js',
  './audio-export.js',
  './sheet-export.js',
  './export-menu.js',
  './acoustic_grand_piano-mp3.js',
  './salamander-piano-mp3.js',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './og-image.png',
  './jkopay-qr.png'
];

/* 這些外部來源（本機檔案不存在時的備援）也快取起來，讓沒有本機檔案的情況一樣能離線 */
const CDN_HOSTS = ['cdn.jsdelivr.net', 'gleitz.github.io', 'fonts.googleapis.com', 'fonts.gstatic.com'];

function isStaticAsset(url) {
  if (CDN_HOSTS.indexOf(url.hostname) !== -1) return true;
  return STATIC_ASSETS.some(p => url.pathname.endsWith(p.replace('./', '/')) || url.pathname.endsWith(p.replace('./', '')));
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // 逐一快取並容許個別失敗：任何一個檔案缺少都不會導致整個 Service Worker 安裝失敗
      Promise.all(APP_SHELL.concat(STATIC_ASSETS).map(u =>
        cache.add(u).catch(() => null)
      ))
    )
  );
});

self.addEventListener('activate', event => {
  self.clients.claim();
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const sameOrigin = (url.origin === self.location.origin);
  if (!sameOrigin && CDN_HOSTS.indexOf(url.hostname) === -1) return;

  // 1) 固定資源（函式庫、鋼琴音色、圖示、字型）→ 快取優先
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then(hit => {
        if (hit) return hit;
        return fetch(event.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone)).catch(() => {});
          return res;
        });
      })
    );
    return;
  }

  // 2) 你自己的頁面與程式 → 網路優先（確保永遠拿到最新版），離線時才用快取
  event.respondWith(
    fetch(event.request).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {});
      return response;
    }).catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html')))
  );
});
