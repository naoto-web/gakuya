/* wishadmin.js — 管理者の「休み希望」タブ（9/29 Naoto「休み希望が入った状態でシフトをいじりたい」）
   ・中身はシートの月シートの休み希望欄（GASが管理者の shift に edit.wish として付けて返す）＝新しく読みに行かない
   ・月はシフトのタブと同じもの（片方で切り替えるともう片方も同じ月）
   ・上＝人ごとの件数／下＝全日1日1行（希望のない日は薄く）。🔄9/29 行を押すと、その日の休み希望を直す板
     （保存は shiftedit.js の順番待ち・板の下の「この日のシフトを開く」でシフトのタブへ）
   ・「休」「撮影」＝シフトに入れない希望（候補外になる）／それ以外（例：ミッドのみ）＝メモとして灰色
   ・配信者の画面（プレビュー中も）は今までどおり「準備中」 */
var WISHADMIN = (function () {
  var u = window.OKL.u;
  // 🔄9/29 Naoto「他→半・表示順は休→半→撮影」＝種類の判定は util.js の wishInfo にまとめた
  function kind(w) { var i = u.wishInfo(w); return i ? i.k : 'half'; }
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
    // 人ごとの件数（休・半・撮影）
    var cnt = {};
    members.forEach(function (m) { cnt[m.name] = { off: 0, half: 0, shoot: 0 }; });
    Object.keys(wish).forEach(function (date) {
      Object.keys(wish[date]).forEach(function (n) { if (cnt[n]) cnt[n][kind(wish[date][n])]++; });
    });
    // 🔄9/29 アプリから編集できるようにしたので、希望のない日も並べる（薄く）＝どの日にも足せる
    var dates = (d.rows || []).map(function (r) { return r.date; });
    // その日のシフトに入っているのに「休」「撮影」＝シートでは紫になる違反
    var rowsBy = {};
    (d.rows || []).forEach(function (r) { rowsBy[r.date] = r; });
    // 🔄半休はその枠（昼＝モ・デ／夜＝ナ・ミ）が全部NGのときだけ
    var clash = function (date, n) {
      var r = rowsBy[date], i = u.wishInfo(wish[date][n]);
      if (!r || !i) return false;
      if (i.k !== 'half') return r.day.concat(r.night).indexOf(n) >= 0;
      if (!i.ng) return false;
      var full = function (qs) { return qs.every(function (q) { return i.ng.indexOf(q) >= 0; }); };
      return (r.day.indexOf(n) >= 0 && full([0, 1])) || (r.night.indexOf(n) >= 0 && full([2, 3]));
    };

    var curYm = u.ymOf(d.today);
    var shown = (d.months || []).filter(function (m) { return m.ym >= u.addMonth(curYm, -1); });
    el.innerHTML =
      '<div class="title-row"><h1 class="screen-title">休み希望</h1>' +
      '<span class="title-aside">' + (window.EDIT && EDIT.pending() ? '<b class="saving">保存中…</b>' : S.loading ? '読み込み中…' : '') + ' <button type="button" class="link-btn" id="w-reload">最新にする</button></span></div>' +
      '<div class="seg seg-sm" role="group" aria-label="月">' + shown.map(function (m) {
        return '<button type="button" data-wym="' + m.ym + '" aria-pressed="' + (m.ym === d.ym) + '">' + u.monthLabel(m.ym) + '</button>';
      }).join('') + '</div>' +
      '<div class="card wa-sum">' + members.map(function (m) {
        var c = cnt[m.name];
        return '<div class="wa-sum-row"><span class="wa-who" style="--mc:' + colorOf(m.name) + '">' + u.esc(m.name) + '</span>' +
          '<span class="wa-n' + (c.off ? '' : ' is-zero') + '"><i class="wk wk-off">休</i>' + c.off + '</span>' +
          '<span class="wa-n' + (c.half ? '' : ' is-zero') + '"><i class="wk wk-half">半</i>' + c.half + '</span>' +
          '<span class="wa-n' + (c.shoot ? '' : ' is-zero') + '"><i class="wk wk-shoot">撮影</i>' + c.shoot + '</span></div>';
      }).join('') + '</div>' +
      (dates.length ? '<div class="card wa-list">' + dates.map(function (date) {
        // 並び＝休→半→撮影、同じ種類の中はメンバーの並び
        var order = members.map(function (m) { return m.name; });
        var names = Object.keys(wish[date] || {}).sort(function (a, b) {
          return (u.WISH_ORDER[kind(wish[date][a])] - u.WISH_ORDER[kind(wish[date][b])]) || (order.indexOf(a) - order.indexOf(b));
        });
        return '<button type="button" class="wa-row' + (names.length ? '' : ' is-blank') + '" data-wdate="' + date + '">' +
          '<span class="wa-date"><b class="num ' + dayClass(date) + '">' + Number(date.slice(8)) + '</b><small class="' + dayClass(date) + '">' + u.DOW[u.dow(date)] + '</small></span>' +
          '<span class="wa-chips">' + names.map(function (n) {
            var w = wish[date][n];
            return '<span class="wa-chip wa-' + kind(w) + (clash(date, n) ? ' is-clash' : '') + '" style="--mc:' + colorOf(n) + '">' +
              u.esc(n) + '<b>' + u.esc(u.wishInfo(w) ? u.wishInfo(w).label : w) + '</b>' + (clash(date, n) ? '<em>入っています</em>' : '') + '</span>';
          }).join('') + (names.length ? '' : '<span class="wa-none">—</span>') + '</span></button>';
      }).join('') + '</div>' : '<div class="card"><p class="sub">この月のシートがありません。</p></div>') +
      '<p class="fresh">行を押すと、その日の休み希望を直せます（押したその場でシートに保存）。「休」「撮影」の人と、半休でその枠が全部NGの人はシフトの候補外になります。</p>';

    el.querySelectorAll('[data-wym]').forEach(function (b) { b.addEventListener('click', function () { SHIFT.go(b.dataset.wym); }); });
    el.querySelector('#w-reload').addEventListener('click', function () { SHIFT.reload(); });
    el.querySelectorAll('[data-wdate]').forEach(function (b) {
      b.addEventListener('click', function () {
        var date = b.dataset.wdate;
        var toShift = function () {
          SHIFT.select(date);
          APP.go('shift');
          // その日の詳細（休み希望の行つき）が見えるところまで送る
          var dd = document.querySelector('.day-detail');
          if (dd) dd.scrollIntoView({ block: 'start' });  // 'end' だと下のタブに休み希望の行が隠れる
        };
        // 行を押す＝その日の休み希望を直す板（板の下に「この日のシフトを開く」）。編集の部品が無ければシフトへ
        if (window.EDIT && EDIT.can()) EDIT.openWish(date, { toShift: toShift }); else toShift();
      });
    });
  }

  return {
    // 管理者本人の鍵のときだけ（プレビュー中は配信者と同じ「準備中」）
    can: function (me) { return !!(me && me.role === 'admin' && !me.previewBy); },
    render: function () { render(document.getElementById('view')); }
  };
})();
