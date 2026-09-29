/* chart.js — 実績タブのグラフ（外部ライブラリなし・SVG）2026-09-30
   決まりごと（dataviz スキル）：細い棒（最大24px・上だけ4px丸め）／積み上げの間は2pxの地の色のすき間／線は2px／
   目盛りは1px実線の薄い灰色／数字は色を付けず文字の色／2系列以上は凡例／触ると（hover・タップ）その列の数字を吹き出しで
   ・columns：積み上げ棒（月ごと・日ごと）。mark＝棒の上の小さな印（グレードの日など）
   ・lines：折れ線（月ごとの推移）。null の月は線を切る */
var CHART = (function () {
  var u = window.OKL.u;
  var SURF = '#fbfaf7', GRID = '#e2dfd7', INK = '#555a63', INK2 = '#8a8d93';

  // きりのいい目盛り（0から上へ3〜4本）
  function ticks(max) {
    if (!(max > 0)) return [0, 1];
    var raw = max / 3, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    var step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
    var out = [];
    for (var v = 0; v <= max + step * 0.001; v += step) out.push(v);
    if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
    return out;
  }
  function short(v) { return v >= 10000 ? (Math.round(v / 1000) / 10).toLocaleString('ja-JP') + '万' : u.yen(v); }

  // 上だけ丸めた棒（下は四角＝基準線に付く）
  function barPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }

  function legend(items) {
    return '<div class="ch-legend">' + items.map(function (s) {
      return '<span><i style="background:' + s.color + (s.line ? ';height:2px;border-radius:1px' : s.dot ? ';width:6px;height:6px;border-radius:50%' : '') + '"></i>' + u.esc(s.name) + '</span>';
    }).join('') + '</div>';
  }

  // 吹き出し：data-tip の中身をその列の上に出す
  function bindTips(box) {
    var tip = box.querySelector('.ch-tip'), hits = box.querySelectorAll('[data-tip]');
    function show(el) {
      hits.forEach(function (h) { h.classList.toggle('is-on', h === el); });
      tip.innerHTML = el.getAttribute('data-tip');
      tip.hidden = false;
      var bw = box.clientWidth, cx = +el.getAttribute('data-cx') / +box.dataset.w * bw;
      var tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(bw - tw, cx - tw / 2)) + 'px';
    }
    function hide() { tip.hidden = true; hits.forEach(function (h) { h.classList.remove('is-on'); }); }
    hits.forEach(function (h) {
      h.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') show(h); });
      // 🔄9/30 Naoto「一度出た詳細はどうやったら閉じられる？」＝同じ棒をもう一度押すと閉じる（スマホ）
      h.addEventListener('click', function () { if (!tip.hidden && h.classList.contains('is-on')) hide(); else show(h); });
    });
    box.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide(); });
    box._hide = hide;
  }
  // グラフの外を押したら、出ている吹き出しを全部閉じる
  document.addEventListener('pointerdown', function (e) {
    document.querySelectorAll('.ch-box').forEach(function (b) { if (b._hide && !b.contains(e.target)) b._hide(); });
  });

  // cols＝[{ label, tick（目盛りの字・空なら出さない）, segs:[{ v, color }], tip（吹き出しのHTML）, mark（印の色） }]
  function columns(el, cols, opt) {
    opt = opt || {};
    var W = 340, H = opt.h || 150, L = 34, R = 6, T = 14, B = 18;
    var max = opt.max || Math.max.apply(null, cols.map(function (c) { return c.segs.reduce(function (a, s) { return a + s.v; }, 0); }).concat([0]));
    var tk = ticks(max), top = tk[tk.length - 1] || 1;
    var pw = W - L - R, ph = H - T - B, band = pw / Math.max(cols.length, 1), bw = Math.min(24, band * 0.62);
    var y = function (v) { return T + ph - v / top * ph; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + u.esc(opt.title || '') + '">';
    tk.forEach(function (v) {
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + GRID + '" stroke-width="1"/>' +
        '<text x="' + (L - 4) + '" y="' + (y(v) + 3) + '" text-anchor="end" font-size="9" fill="' + INK2 + '">' + short(v) + '</text>';
    });
    cols.forEach(function (c, i) {
      var cx = L + band * i + band / 2, x = cx - bw / 2, acc = 0;
      var segs = c.segs.filter(function (sg) { return sg.v > 0; });
      segs.forEach(function (sg, j) {
        var y0 = y(acc), y1 = y(acc + sg.v), last = j === segs.length - 1;
        var gap = j > 0 ? 2 : 0;  // 積み上げの間は2pxのすき間（地の色）
        var h = Math.max(0, y0 - y1 - gap);
        s += last ? '<path d="' + barPath(x, y1, bw, h, 4) + '" fill="' + sg.color + '"/>' : '<rect x="' + x + '" y="' + y1 + '" width="' + bw + '" height="' + h + '" fill="' + sg.color + '"/>';
        acc += sg.v;
      });
      if (c.mark && acc > 0) s += '<circle cx="' + cx + '" cy="' + (y(acc) - 6) + '" r="3" fill="' + c.mark + '" stroke="' + SURF + '" stroke-width="1.5"/>';
      if (c.tick) s += '<text x="' + cx + '" y="' + (H - 5) + '" text-anchor="middle" font-size="9" fill="' + INK + '">' + u.esc(c.tick) + '</text>';
      s += '<rect class="ch-hit" x="' + (L + band * i) + '" y="' + T + '" width="' + band + '" height="' + ph + '" fill="transparent" tabindex="0" data-cx="' + cx + '" data-tip="' + u.esc(c.tip || '') + '"/>';
    });
    s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="' + INK2 + '" stroke-width="1"/></svg>';
    el.innerHTML = '<div class="ch-box" data-w="' + W + '">' + s + '<div class="ch-tip" hidden></div></div>' + (opt.legend ? legend(opt.legend) : '');
    bindTips(el.querySelector('.ch-box'));
  }

  // labels＝['2月',…]／series＝[{ name, color, values:[…|null] }]／tips＝列ごとの吹き出しHTML
  function lines(el, labels, series, opt) {
    opt = opt || {};
    var W = 340, H = opt.h || 150, L = 34, R = 34, T = 12, B = 18;
    var all = [];
    series.forEach(function (sr) { sr.values.forEach(function (v) { if (v != null) all.push(v); }); });
    var tk = ticks(Math.max.apply(null, all.concat([0]))), top = tk[tk.length - 1] || 1;
    var pw = W - L - R, ph = H - T - B, n = labels.length;
    var x = function (i) { return L + (n > 1 ? pw * i / (n - 1) : pw / 2); };
    var y = function (v) { return T + ph - v / top * ph; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + u.esc(opt.title || '') + '">';
    tk.forEach(function (v) {
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + GRID + '" stroke-width="1"/>' +
        '<text x="' + (L - 4) + '" y="' + (y(v) + 3) + '" text-anchor="end" font-size="9" fill="' + INK2 + '">' + short(v) + '</text>';
    });
    labels.forEach(function (lb, i) { s += '<text x="' + x(i) + '" y="' + (H - 5) + '" text-anchor="middle" font-size="9" fill="' + INK + '">' + u.esc(lb) + '</text>'; });
    series.forEach(function (sr) {
      var d = '', pen = false, lastI = -1;
      sr.values.forEach(function (v, i) {
        if (v == null) { pen = false; return; }
        d += (pen ? 'L' : 'M') + x(i) + ',' + y(v); pen = true; lastI = i;
      });
      s += '<path d="' + d + '" fill="none" stroke="' + sr.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
      sr.values.forEach(function (v, i) {
        if (v != null) s += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="' + (i === lastI ? 4 : 2.5) + '" fill="' + sr.color + '" stroke="' + SURF + '" stroke-width="2"/>';
      });
      // 線の右端に最後の値（文字は文字の色）
      if (lastI >= 0) s += '<text x="' + (x(lastI) + 6) + '" y="' + (y(sr.values[lastI]) + 3) + '" font-size="9" fill="' + INK + '">' + short(sr.values[lastI]) + '</text>';
    });
    labels.forEach(function (lb, i) {
      var w = n > 1 ? pw / (n - 1) : pw;
      s += '<rect class="ch-hit ch-hit-line" x="' + (x(i) - w / 2) + '" y="' + T + '" width="' + w + '" height="' + ph + '" fill="transparent" tabindex="0" data-cx="' + x(i) + '" data-tip="' + u.esc((opt.tips || [])[i] || '') + '"/>';
    });
    s += '</svg>';
    el.innerHTML = '<div class="ch-box" data-w="' + W + '">' + s + '<div class="ch-tip" hidden></div></div>' + (series.length > 1 ? legend(series.map(function (sr) { return { name: sr.name, color: sr.color, line: true }; })) : '');
    bindTips(el.querySelector('.ch-box'));
  }

  return { columns: columns, lines: lines, short: short };
})();
