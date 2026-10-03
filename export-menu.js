/* 免費版：導出功能為贊助者專屬，這裡是停用版的空殼。
   各練習頁的程式碼完全相同，只是按鈕被隱藏、呼叫不會有作用。 */
(function (global) {
  'use strict';
  var css = document.createElement('style');
  css.textContent = '.exp-btn, .exp-mini, [id$="-ansExport"], [id$="-dictExport"],' +
                    ' [data-rev-export], .rev-export { display: none !important; }';
  (document.head || document.documentElement).appendChild(css);
  global.ExportMenu = { open: function () {}, close: function () {} };
})(window);
