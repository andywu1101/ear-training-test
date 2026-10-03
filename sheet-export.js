/* 免費版：停用版空殼（導出為贊助者專屬） */
(function (global) {
  'use strict';
  function nope() { return Promise.reject(new Error('export disabled')); }
  global.SheetExport = { exportSheets: nope, buildCanvas: nope, svgToImage: nope,
                         fileName: function () { return ''; }, PER_ROW: 5 };
})(window);
