/* wishadmin.js — 管理者の「休み希望」タブ（9/29 Naoto「休み希望が入った状態でシフトをいじりたい」）
   ・中身はシートの月シートの休み希望欄（GASが管理者の shift に edit.wish として付けて返す）＝新しく読みに行かない
   ・月はシフトのタブと同じもの（片方で切り替えるともう片方も同じ月）
   ・上＝人ごとの件数／下＝希望がある日だけ1日1行。行を押すと、その日を選んだ状態でシフトのタブへ
   ・「休」「撮影」＝シフトに入れない希望（候補外になる）／それ以外（例：ミッドのみ）＝メモとして灰色
   ・配信者の画面（プレビュー中も）は今までどおり「準備中」 */
var WISHADMIN = (function () {
  var u = window.OKL.u;
  var HARD = /休|撮影/;

  function kind(w) { return /撮影/.test(w) ? 'shoot' : /休/.test(w) ? 'off' : 'note'; }
  function dayClass(date) {
    var dw = u.dow(date);
    if (dw === 0 || u.holidayOf(date)) return 'sun';
    return dw === 6 ? 'sat' : '';
  }

  function render(el) {
    var S = SHIFT.state();
    var d = S.data;
    if (!d || !d.edit) {
      el.innerHTML = '<div class="title-row"><h1 class="screen-title">休み希望</h1></div><p class="sub">' + (S.loading ? '読み込んでいます…' : '読み込めませんでした。シフトのタブで「最新にする」を押してください') + '</p>';
      return;
    }
    var wish = d.edit.wish || {};
    var members = S.members;
    var colorOf = function (n) { var m = members.filter(function (x) { return x.name === n; })[0]; return (m && m.color) || '#9aa0aa'; };
    // 人ごとの件数（休・撮影・その他）
    var cnt = {};
    members.forEach(function (m) { cnt[m.name] = { off: 0, shoot: 0, note: 0 }; });
    Object.keys(wish).forEach(function (date) {
      Object.keys(wish[date]).forEach(function (n) { if (cnt[n]) cnt[n][kind(wish[date][n])]++; });
    });
    var dates = Object.keys(wish).sort();
    // その日のシフトに入っているのに「休」「撮影」＝シートでは紫になる違反
    var rowsBy = {};
    (d.rows || []).forEach(function (r) { rowsBy[r.date] = r; });
    var clash = function (date, n) { var r = rowsBy[date]; return r && HARD.test(wish[date][n]) && r.day.concat(r.night).indexOf(n) >= 0; };

    var curYm = u.ymOf(d.today);
    var shown = (d.months || []).filter(function (m) { return m.ym >= u.addMonth(curYm, -1); });
    el.innerHTML =
      '<div class="title-row"><h1 class="screen-title">休み希望</h1>' +
      '<span class="title-aside">' + (S.loading ? '読み込み中…' : '') + ' <button type="button" class="link-btn" id="w-reload">最新にする</button></span></div>' +
      '<div class="seg seg-sm" role="group" aria-label="月">' + shown.map(function (m) {
        return '<button type="button" data-wym="' + m.ym + '" aria-pressed="' + (m.ym === d.ym) + '">' + u.monthLabel(m.ym) + '</button>';
      }).join('') + '</div>' +
      '<div class="card wa-sum">' + members.map(function (m) {
        var c = cnt[m.name];
        return '<div class="wa-sum-row"><span class="wa-who" style="--mc:' + colorOf(m.name) + '">' + u.esc(m.name) + '</span>' +
          '<span class="wa-n' + (c.off ? '' : ' is-zero') + '"><i class="wk wk-off">休</i>' + c.off + '</span>' +
          '<span class="wa-n' + (c.shoot ? '' : ' is-zero') + '"><i class="wk wk-shoot">撮影</i>' + c.shoot + '</span>' +
          (c.note ? '<span class="wa-n"><i class="wk wk-note">他</i>' + c.note + '</span>' : '') + '</div>';
      }).join('') + '</div>' +
      (dates.length ? '<div class="card wa-list">' + dates.map(function (date) {
        var names = Object.keys(wish[date]).sort(function (a, b) {
          return members.map(function (m) { return m.name; }).indexOf(a) - members.map(function (m) { return m.name; }).indexOf(b);
        });
        return '<button type="button" class="wa-row" data-wdate="' + date + '">' +
          '<span class="wa-date"><b class="num ' + dayClass(date) + '">' + Number(date.slice(8)) + '</b><small class="' + dayClass(date) + '">' + u.DOW[u.dow(date)] + '</small></span>' +
          '<span class="wa-chips">' + names.map(function (n) {
            var w = wish[date][n];
            return '<span class="wa-chip wa-' + kind(w) + (clash(date, n) ? ' is-clash' : '') + '" style="--mc:' + colorOf(n) + '">' +
              u.esc(n) + '<b>' + u.esc(w) + '</b>' + (clash(date, n) ? '<em>入っています</em>' : '') + '</span>';
          }).join('') + '</span></button>';
      }).join('') + '</div>' : '<div class="card"><p class="sub">この月の休み希望はまだありません。</p></div>') +
      '<p class="fresh">行を押すと、その日のシフトを開きます。「休」「撮影」の人はシフトの候補外（理由つきの灰色）になります。</p>';

    el.querySelectorAll('[data-wym]').forEach(function (b) { b.addEventListener('click', function () { SHIFT.go(b.dataset.wym); }); });
    el.querySelector('#w-reload').addEventListener('click', function () { SHIFT.reload(); });
    el.querySelectorAll('[data-wdate]').forEach(function (b) {
      b.addEventListener('click', function () {
        SHIFT.select(b.dataset.wdate);
        APP.go('shift');
        // その日の詳細（休み希望の行つき）が見えるところまで送る
        var dd = document.querySelector('.day-detail');
        if (dd) dd.scrollIntoView({ block: 'start' });  // 'end' だと下のタブに休み希望の行が隠れる
      });
    });
  }

  return {
    // 管理者本人の鍵のときだけ（プレビュー中は配信者と同じ「準備中」）
    can: function (me) { return !!(me && me.role === 'admin' && !me.previewBy); },
    render: function () { render(document.getElementById('view')); }
  };
})();
