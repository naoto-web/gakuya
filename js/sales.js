/* sales.js — 管理者の「実績」タブ＝note売上（2026-09-30 Naoto「note売上との連携」「いったん管理者だけ見える形で」）
   ・中身＝GASの app=sales（人×記事の集計値）。GASは管理者の鍵にだけ返す（配信者・プレビュー中は準備中のまま）
   ・月＝レース日の月。出勤日数＝シフト（実際に誰が出た）。シートが無い月は「その枠の記事が売れた日」で数える
   ・全員＝人ごとの一覧（押すとその人）／個人＝売上（手数料の前・後）・出勤日数・1出勤あたり（昼・夜・グレード）＋記事ごとの一覧
   ・🔴人名・金額はGASが返す（このファイルに書かない＝公開リポジトリ） */
var SALES = (function () {
  var u = window.OKL.u;
  var st = { ym: '', who: '', data: {}, shift: {}, loading: false, err: '' };
  // 列＝GASの SALES_COLS と同じ並び
  var C = { who: 0, day: 1, slot: 2, waku: 3, place: 4, races: 5, g: 6, title: 7, n: 8, gross: 9, tip: 10, fee: 11 };
  var WAKU = { 'モ': 'モーニング', 'デ': 'デイ', 'ナ': 'ナイター', 'ミ': 'ミッド' };

  function members() { return (SHIFT.state().members || []); }
  function colorOf(n) { var m = members().filter(function (x) { return x.name === n; })[0]; return (m && m.color) || '#9aa0aa'; }
  function yen(n) { return u.yen(n) + '円'; }
  function dateOf(ym, day) { return ym + '-' + ('0' + day).slice(-2); }
  function dayClass(date) { var dw = u.dow(date); return dw === 0 || u.holidayOf(date) ? 'sun' : dw === 6 ? 'sat' : ''; }

  function load(ym) {
    st.loading = true; st.err = ''; draw();
    API.sales(ym).then(function (d) {
      st.data[d.ym] = d; st.ym = d.ym; st.months = d.months;
      // 出勤日数のためにその月のシフト（管理者は全月読める）。シートが無い月は失敗する＝売れた日で数える
      if (st.shift[d.ym] === undefined) {
        return API.shift(d.ym).then(function (s) { st.shift[d.ym] = s.rows ? s : null; }, function () { st.shift[d.ym] = null; });
      }
    }).catch(function (e) { st.err = e.code === 'notyet' ? 'notyet' : 'net'; })
      .then(function () { st.loading = false; draw(); });
  }

  // 人ごとの数字。シフトがあれば出勤日＝シフト、無ければ売れた日
  function stats(rows, who, shift) {
    var mine = rows.filter(function (r) { return r[C.who] === who; });
    var s = { gross: 0, tip: 0, fee: 0, n: 0, arts: mine.length, by: { '昼': 0, '夜': 0, G: 0 }, days: {}, dayD: {}, dayN: {}, dayG: {}, basis: shift ? 'shift' : 'sold' };
    mine.forEach(function (r) {
      var v = r[C.gross] + r[C.tip];
      s.gross += r[C.gross]; s.tip += r[C.tip]; s.fee += r[C.fee]; s.n += r[C.n];
      s.by[r[C.slot]] += v;
      if (r[C.g]) s.by.G += v;
      if (!shift) {
        s.days[r[C.day]] = 1;
        (r[C.slot] === '昼' ? s.dayD : s.dayN)[r[C.day]] = 1;
        if (r[C.g]) s.dayG[r[C.day]] = 1;
      }
    });
    if (shift) {
      // noteのデータが途中までの月（例：9/18まで）は、その日までの出勤だけ数える（1出勤あたりが薄まらないように）
      var upto = st.data[st.ym] && st.data[st.ym].asof && st.data[st.ym].asof.slice(0, 7) === st.ym ? st.data[st.ym].asof : '9999';
      shift.rows.forEach(function (r) {
        if (r.date > upto) return;
        var d = +r.date.slice(8), inD = r.day.indexOf(who) >= 0, inN = r.night.indexOf(who) >= 0;
        if (inD || inN) s.days[d] = 1;
        if (inD) s.dayD[d] = 1;
        if (inN) s.dayN[d] = 1;
        if (r.grade && ((r.grade.slot === '夜' && inN) || (r.grade.slot !== '夜' && inD))) s.dayG[d] = 1;
      });
    }
    s.total = s.gross + s.tip;
    s.net = s.total - s.fee;
    s.nd = Object.keys(s.days).length; s.nD = Object.keys(s.dayD).length; s.nN = Object.keys(s.dayN).length; s.nG = Object.keys(s.dayG).length;
    return s;
  }
  function per(v, n) { return n ? yen(v / n) : '—'; }

  function head(d) {
    var months = (st.months || []).slice().reverse();
    return '<div class="title-row"><h1 class="screen-title">実績</h1><span class="title-aside">' + (st.loading ? '読み込み中…' : d && d.asof ? u.mdShort(d.asof) + 'までのnote' : '') +
      ' <button type="button" class="link-btn" id="s-reload">最新にする</button></span></div>' +
      '<div class="s-pick"><select id="s-ym" class="date-input" aria-label="月">' + months.map(function (m) {
        return '<option value="' + m.ym + '"' + (m.ym === st.ym ? ' selected' : '') + '>' + m.ym.slice(0, 4) + '年' + u.monthLabel(m.ym) + '</option>';
      }).join('') + '</select>' +
      '<select id="s-who" class="date-input" aria-label="人"><option value="">全員</option>' + members().map(function (m) {
        return '<option value="' + u.esc(m.name) + '"' + (m.name === st.who ? ' selected' : '') + '>' + u.esc(m.name) + '</option>';
      }).join('') + '</select></div>';
  }

  // 全員＝人ごとに1行（押すとその人）
  function allView(d, shift) {
    var list = members().map(function (m) { return { m: m, s: stats(d.rows, m.name, shift) }; }).filter(function (x) { return x.s.arts || x.s.nd; });
    var sum = list.reduce(function (a, x) { a.total += x.s.total; a.net += x.s.net; return a; }, { total: 0, net: 0 });
    return '<div class="card s-all"><div class="s-all-head"><span></span><span>売上</span><span>手取り</span><span>出勤</span><span>1出勤</span></div>' +
      list.map(function (x) {
        return '<button type="button" class="s-all-row" data-swho="' + u.esc(x.m.name) + '">' +
          '<span class="wa-who" style="--mc:' + colorOf(x.m.name) + '">' + u.esc(x.m.name) + '</span>' +
          '<span class="num">' + u.yen(x.s.total) + '</span><span class="num">' + u.yen(x.s.net) + '</span>' +
          '<span class="num">' + x.s.nd + '日</span><span class="num">' + (x.s.nd ? u.yen(x.s.total / x.s.nd) : '—') + '</span></button>';
      }).join('') +
      '<div class="s-all-row is-sum"><span>合計</span><span class="num">' + u.yen(sum.total) + '</span><span class="num">' + u.yen(sum.net) + '</span><span></span><span></span></div></div>';
  }

  // 個人＝数字のまとめ＋昼・夜・グレード＋記事ごと（日付の新しい順・その日の中は昼→夜）
  function oneView(d, shift, who) {
    var s = stats(d.rows, who, shift);
    var mine = d.rows.filter(function (r) { return r[C.who] === who; });
    var byDay = {};
    mine.forEach(function (r) { (byDay[r[C.day]] = byDay[r[C.day]] || []).push(r); });
    var days = Object.keys(byDay).map(Number).sort(function (a, b) { return b - a; });
    var line = function (label, cls, v, n) {
      return '<div class="s-br"><span class="lg ' + cls + '">' + label + '</span><span class="num">' + yen(v) + '</span><span class="num">' + n + '日</span><span class="num">' + per(v, n) + '</span></div>';
    };
    return '<div class="card s-kpi" style="--mc:' + colorOf(who) + '">' +
      '<div class="s-k"><small>売上（手数料の前）</small><b class="num">' + yen(s.total) + '</b>' + (s.tip ? '<small>うちチップ ' + yen(s.tip) + '</small>' : '') + '</div>' +
      '<div class="s-k"><small>手取り（手数料の後）</small><b class="num">' + yen(s.net) + '</b><small>手数料 ' + yen(s.fee) + '</small></div>' +
      '<div class="s-k"><small>出勤日数</small><b class="num">' + s.nd + '日</b><small>昼' + s.nD + '・夜' + s.nN + '・G' + s.nG + '</small></div>' +
      '<div class="s-k"><small>1出勤あたり</small><b class="num">' + per(s.total, s.nd) + '</b><small>記事' + s.arts + '本・' + u.yen(s.n) + '件</small></div></div>' +
      '<div class="card s-brk"><div class="s-br s-br-head"><span></span><span>売上</span><span>出勤</span><span>1出勤あたり</span></div>' +
      line('昼', 'lg-day', s.by['昼'], s.nD) + line('夜', 'lg-night', s.by['夜'], s.nN) + line('G', 'gb gb-day', s.by.G, s.nG) + '</div>' +
      '<div class="card s-arts">' + (days.length ? days.map(function (day) {
        var date = dateOf(st.ym, day);
        var rs = byDay[day].sort(function (a, b) { return (a[C.slot] === b[C.slot] ? 0 : a[C.slot] === '昼' ? -1 : 1) || b[C.gross] - a[C.gross]; });
        var dayTot = rs.reduce(function (a, r) { return a + r[C.gross] + r[C.tip]; }, 0);
        return '<div class="s-day"><div class="s-day-head"><b class="' + dayClass(date) + '">' + u.md(date) + '</b><span class="num">' + yen(dayTot) + '</span></div>' +
          rs.map(function (r) {
            return '<div class="s-art"><span class="lg ' + (r[C.slot] === '昼' ? 'lg-day' : 'lg-night') + '">' + (WAKU[r[C.waku]] ? r[C.waku] : r[C.slot]) + '</span>' +
              '<span class="s-art-t"><b>' + u.esc(r[C.place] || '—') + (r[C.g] ? ' <i class="gb ' + (r[C.slot] === '夜' ? 'gb-night' : 'gb-day') + '">G</i>' : '') + ' <small>' + u.esc(String(r[C.races] || '')) + 'R</small></b>' +
              '<small class="s-art-full">' + u.esc(r[C.title]) + '</small></span>' +
              '<span class="s-art-n num">' + r[C.n] + '件</span><span class="s-art-v num">' + u.yen(r[C.gross] + r[C.tip]) + (r[C.tip] ? '<small>チップ' + u.yen(r[C.tip]) + '</small>' : '') + '</span></div>';
          }).join('') + '</div>';
      }).join('') : '<p class="sub">この月の記事はありません。</p>') + '</div>';
  }

  function draw() {
    if (APP.current() !== 'stats') return;
    var el = document.getElementById('view');
    var d = st.data[st.ym];
    if (st.err === 'notyet') { el.innerHTML = '<h1 class="screen-title">実績</h1><div class="card"><p>準備中です。</p></div>'; return; }
    if (!d) {
      el.innerHTML = head(null) + '<p class="sub">' + (st.err ? 'つながりませんでした。「最新にする」を押してください' : '読み込んでいます…') + '</p>';
      bind(el); return;
    }
    var shift = st.shift[st.ym];
    el.innerHTML = head(d) + (st.who ? oneView(d, shift, st.who) : allView(d, shift)) +
      '<p class="fresh">月＝レースの日の月（収支表は決済日の月なので、月末の前売り分だけずれます）。出勤日数＝' +
      (shift ? 'シフト（実際に出た人）' : 'この月はシフト表が無いので、その枠の記事が売れた日') +
      (d.asof && d.asof.slice(0, 7) === st.ym ? '。この月はnoteのデータが' + u.mdShort(d.asof) + 'までなので、出勤もその日まで数えています' : '') + '。手数料は決済方法ごとの推定（収支表と±0.3%）。</p>';
    bind(el);
  }

  function bind(el) {
    var ym = el.querySelector('#s-ym'), who = el.querySelector('#s-who'), rl = el.querySelector('#s-reload');
    if (ym) ym.addEventListener('change', function () { st.ym = ym.value; if (st.data[st.ym]) draw(); else load(st.ym); });
    if (who) who.addEventListener('change', function () { st.who = who.value; draw(); window.scrollTo(0, 0); });
    if (rl) rl.addEventListener('click', function () { if (st.loading) return; delete st.data[st.ym]; delete st.shift[st.ym]; load(st.ym); });
    el.querySelectorAll('[data-swho]').forEach(function (b) { b.addEventListener('click', function () { st.who = b.dataset.swho; draw(); window.scrollTo(0, 0); }); });
  }

  return {
    // 管理者本人の鍵のときだけ（プレビュー中は配信者と同じ「準備中」）
    can: function (me) { return !!(me && me.role === 'admin' && !me.previewBy); },
    render: function () { if (!st.ym && !st.loading && !st.err) load(''); else draw(); }
  };
})();
