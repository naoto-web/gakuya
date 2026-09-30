/* presence.js — 実績タブの「出演」（2026-10-01 Naoto「出演レポートもアプリに・まずは管理者だけ」→同日「配信者にも反映」）
   ・中身＝GASの app=presence（出演ログ＝アーカイブ映像から誰が席にいたか・1行＝1配信）。全員分＝管理者／配信者＝本人の分だけ（GASが絞る・scope=mine）
   ・Y向けの出演レポート（PDF）と同じ3つ：人ごとのまとめ（昼枠・夜枠）／席の内訳／日ごとのタイムライン
   ・期間＝月・前半（1〜15日）・後半（16日〜）
   ・🔴人名はGASが返す（このファイルに書かない＝公開リポジトリ） */
var PRESENCE = (function () {
  var u = window.OKL.u;
  var MODE_LS = 'gakuya:statsMode';
  var st = { ym: '', part: 'all', tl: '昼', open: '', who: '', data: {}, months: null, loading: false, err: '' };
  var mode = 'sales';
  try { mode = localStorage.getItem(MODE_LS) === 'presence' ? 'presence' : 'sales'; } catch (e) { /* 覚えられなくても売上から */ }

  function members() { return (SHIFT.state().members || []); }
  function colorOf(n) { var m = members().filter(function (x) { return x.name === n; })[0]; return (m && m.color) || '#9aa0aa'; }
  function order(names) {
    var ms = members().map(function (m) { return m.name; });
    return names.slice().sort(function (a, b) {
      var ia = ms.indexOf(a), ib = ms.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }
  // 秒 → 「7:54」
  function hm(sec) { var m = Math.round((sec || 0) / 60); return Math.floor(m / 60) + ':' + u.pad(m % 60); }
  function mins(sec) { var m = Math.round((sec || 0) / 60); return m >= 60 ? hm(sec) : m + '分'; }   // 60分以上は「1:26」
  function pctOf(a, b) { return b ? Math.round(a / b * 100) + '%' : '—'; }
  // 配信開始（"08:08"）＋秒 → 時刻の分（夜は24時を超えてもそのまま数える）
  function clockMin(start, sec) { var p = (start || '0:0').split(':'); return +p[0] * 60 + +p[1] + Math.round(sec / 60); }
  function clockLabel(m) { return Math.floor(m / 60) + ':' + u.pad(m % 60); }
  function dayLabel(date) { return u.md(date); }

  function load(ym) {
    st.loading = true; st.err = ''; draw();
    API.presence(ym).then(function (d) {
      st.months = d.months || [];
      st.mine = d.scope === 'mine';   // 配信者＝本人の分だけ（相方の帯・席の内訳はGASが返さない）
      if (!d.ym) return;
      st.data[d.ym] = d; st.ym = d.ym;
    }).catch(function (e) { st.err = e.code === 'notyet' ? 'notyet' : 'net'; })
      .then(function () { st.loading = false; draw(); });
  }

  // 期間で絞った配信
  function rowsOf(d) {
    return (d.rows || []).filter(function (r) {
      var day = +r.date.slice(8);
      return st.part === 'all' || (st.part === 'first' ? day <= 15 : day >= 16);
    });
  }

  // 人ごとのまとめ（昼枠・夜枠を分ける＝配信の長さが違う）
  function summary(rows, slot) {
    var by = {};
    rows.filter(function (r) { return r.slot === slot; }).forEach(function (r) {
      Object.keys(r.persons).forEach(function (n) {
        var p = r.persons[n], s = by[n] || (by[n] = { n: 0, a: 0, p: 0, b: 0, o: 0, cnt: 0, max: 0, maxAt: '' });
        s.n++; s.a += p.a; s.p += p.p; s.b += p.b; s.o += p.o; s.cnt += (p.br || []).length;
        (p.br || []).forEach(function (x) { if (x[1] - x[0] > s.max) { s.max = x[1] - x[0]; s.maxAt = r.date; } });
      });
    });
    return by;
  }

  function sumTable(rows, slot) {
    var by = summary(rows, slot), names = order(Object.keys(by));
    var n = rows.filter(function (r) { return r.slot === slot; }).length;
    if (!n) return '';
    return '<div class="card s-all pr-sum"><div class="pr-cap">' + slot + '枠<small>（' + n + '本）</small></div>' +
      '<div class="pr-head"><span></span><span>本数</span><span>在席率</span><span>離席/配信</span><span>最長</span></div>' +
      names.map(function (name) {
        var s = by[name], key = slot + ':' + name, open = st.who === key;
        return '<button type="button" class="pr-row" data-prwho="' + u.esc(key) + '" aria-expanded="' + open + '">' +
          '<span class="wa-who" style="--mc:' + colorOf(name) + '">' + u.esc(name) + '</span>' +
          '<span class="num">' + s.n + '</span><span class="num">' + pctOf(s.p, s.p + s.b) + '</span>' +
          '<span class="num">' + mins(s.b / s.n) + '</span><span class="num">' + (s.max ? hm(s.max) + '<small>' + u.mdShort(s.maxAt) + '</small>' : '—') + '</span></button>' +
          (open ? '<div class="pr-more">出番 <b>' + hm(s.a) + '</b>（在席 ' + hm(s.p) + '・離席 ' + hm(s.b) + '・画面外 ' + hm(s.o) + '）<br>' +
            '1配信あたり 在席 <b>' + hm(s.p / s.n) + '</b>・離席 <b>' + s.cnt + '回</b>' + (s.cnt ? '（平均 ' + mins(s.b / s.cnt) + '）' : '') + '</div>' : '');
      }).join('') + '</div>';
  }

  // 席の内訳（2人とも・1人だけ・誰もいない・カメラなし）＋1人以下が長かった配信
  function teamCard(rows) {
    var K = [['both', '2人とも在席'], ['solo', '1人だけ在席'], ['nobody', '誰もいない'], ['nocam', 'カメラなし画面']];
    var tot = { '昼': {}, '夜': {} };
    rows.forEach(function (r) { K.forEach(function (k) { tot[r.slot][k[0]] = (tot[r.slot][k[0]] || 0) + (r.team[k[0]] || 0); }); });
    var sum = function (sl) { return K.reduce(function (a, k) { return a + (tot[sl][k[0]] || 0); }, 0); };
    var sd = sum('昼'), sn = sum('夜');
    var worst = rows.map(function (r) { return { r: r, v: (r.team.solo || 0) + (r.team.nobody || 0) }; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 5);
    return '<div class="card pr-team"><div class="pr-cap">席の内訳</div>' +
      '<div class="pr-thead"><span></span><span>昼</span><span>夜</span></div>' +
      K.map(function (k) {
        return '<div class="pr-trow"><span>' + k[1] + '</span>' +
          '<span class="num">' + hm(tot['昼'][k[0]]) + '<small>' + pctOf(tot['昼'][k[0]] || 0, sd) + '</small></span>' +
          '<span class="num">' + hm(tot['夜'][k[0]]) + '<small>' + pctOf(tot['夜'][k[0]] || 0, sn) + '</small></span></div>';
      }).join('') +
      '<div class="pr-trow is-sum"><span>配信の合計</span><span class="num">' + hm(sd) + '</span><span class="num">' + hm(sn) + '</span></div>' +
      '<div class="pr-sub">1人以下だった時間が長かった配信</div>' +
      worst.map(function (x) {
        return '<div class="pr-worst"><span>' + dayLabel(x.r.date) + ' ' + x.r.slot + '</span><span>' + order(Object.keys(x.r.persons)).map(u.esc).join('・') + '</span><span class="num">' + hm(x.v) + '</span></div>';
      }).join('') + '</div>';
  }

  // 日ごとのタイムライン（昼／夜を切り替え）。押すとその日の離席の一覧（アーカイブの時刻へのリンク）
  function timeline(rows) {
    // 選んでいる枠に1本も無く、もう片方にある（夜だけ出る人など）＝もう片方で始める
    if (!rows.some(function (r) { return r.slot === st.tl; }) && rows.length) st.tl = st.tl === '昼' ? '夜' : '昼';
    var list = rows.filter(function (r) { return r.slot === st.tl; });
    var seg = '<span class="seg seg-sm pr-tlseg" role="group" aria-label="枠">' + ['昼', '夜'].map(function (s) {
      return '<button type="button" data-prtl="' + s + '" aria-pressed="' + (st.tl === s) + '">' + s + '</button>';
    }).join('') + '</span>';
    if (!list.length) return '<div class="card pr-tl"><div class="pr-cap">タイムライン' + seg + '</div><p class="sub">この期間の' + st.tl + '枠の出演ログはありません。</p></div>';
    // 横軸＝この期間の出番の最初〜最後（1時間単位に丸める）
    var lo = 1e9, hi = 0;
    list.forEach(function (r) {
      Object.keys(r.persons).forEach(function (n) {
        var p = r.persons[n];
        lo = Math.min(lo, clockMin(r.start, p.f || 0)); hi = Math.max(hi, clockMin(r.start, p.t || r.dur));
      });
    });
    lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60;
    var span = Math.max(hi - lo, 60);
    var x = function (m) { return ((m - lo) / span * 100).toFixed(2) + '%'; };
    var step = span > 600 ? 120 : 60, ticks = [];
    for (var t = lo; t <= hi; t += step) ticks.push(t);
    return '<div class="card pr-tl"><div class="pr-cap">タイムライン' + seg + '<small>押すと離席の一覧</small></div>' +
      '<div class="pr-axis">' + ticks.map(function (t) { return '<span style="left:' + x(t) + '">' + (t / 60 % 24) + '</span>'; }).join('') + '</div>' +
      list.map(function (r) {
        var names = order(Object.keys(r.persons)), key = r.date + r.slot, open = st.open === key;
        return '<button type="button" class="pr-day" data-prday="' + key + '" aria-expanded="' + open + '"><span class="pr-date">' + u.mdShort(r.date) + '</span><span class="pr-bars">' +
          names.map(function (n) {
            var p = r.persons[n];
            return '<span class="pr-track">' + (p.s || []).map(function (sg) {
              var a = clockMin(r.start, sg[0]), b = clockMin(r.start, sg[1]);
              return '<i class="pr-' + sg[2] + '" style="left:' + x(a) + ';width:' + ((b - a) / span * 100).toFixed(2) + '%;--mc:' + colorOf(n) + '"></i>';
            }).join('') + '</span>';
          }).join('') + '</span></button>' + (open ? dayDetail(r, names) : '');
      }).join('') +
      '<div class="pr-legend"><span><i class="pr-on" style="--mc:#8a8d93"></i>在席（配信者の色）</span><span><i class="pr-off"></i>離席（5分以上）</span><span><i class="pr-nocam"></i>カメラなし画面</span></div></div>';
  }

  function dayDetail(r, names) {
    var br = [];
    names.forEach(function (n) { (r.persons[n].br || []).forEach(function (b) { br.push({ n: n, a: b[0], b: b[1] }); }); });
    br.sort(function (p, q) { return p.a - q.a; });
    return '<div class="pr-detail">' +
      names.map(function (n) {
        var p = r.persons[n];
        return '<div class="pr-dline"><span class="wa-who" style="--mc:' + colorOf(n) + '">' + u.esc(n) + '</span>' +
          clockLabel(clockMin(r.start, p.f || 0)) + '〜' + clockLabel(clockMin(r.start, p.t || r.dur)) + '　在席 ' + hm(p.p) + '・離席 ' + hm(p.b) + '</div>';
      }).join('') +
      (br.length ? br.map(function (b) {
        return '<div class="pr-br"><span>' + clockLabel(clockMin(r.start, b.a)) + '〜' + clockLabel(clockMin(r.start, b.b)) + '（' + mins(b.b - b.a) + '）</span><span>' + u.esc(b.n) + '</span>' +
          (r.id ? '<a href="https://youtu.be/' + encodeURIComponent(r.id) + '?t=' + b.a + 's" target="_blank" rel="noopener">映像</a>' : '') + '</div>';
      }).join('') : '<p class="sub">5分以上の離席はありません。</p>') + '</div>';
  }

  // 実績タブの見出しの横の［売上｜出演］（sales.js の見出しでも使う）
  function seg() {
    if (!can()) return '';
    return '<span class="seg seg-mode" role="group" aria-label="実績の中身">' +
      '<button type="button" data-smode="sales" aria-pressed="' + (mode === 'sales') + '">売上</button>' +
      '<button type="button" data-smode="presence" aria-pressed="' + (mode === 'presence') + '">出演</button></span>';
  }
  function can() { var me = APP.me(); return !!(me && me.presence); }

  function head(d) {
    var months = (st.months || []).slice().reverse();
    return '<div class="title-row"><h1 class="screen-title">実績</h1>' + seg() + '<span class="title-aside">' + (st.loading ? '読み込み中…' : d && d.months ? lastOf(d) : '') +
      ' <button type="button" class="link-btn" id="pr-reload">最新にする</button></span></div>' +
      '<div class="s-pick"><select id="pr-ym" class="date-input" aria-label="月">' + months.map(function (m) {
        return '<option value="' + m.ym + '"' + (m.ym === st.ym ? ' selected' : '') + '>' + m.ym.slice(0, 4) + '年' + u.monthLabel(m.ym) + '</option>';
      }).join('') + '</select>' +
      '<span class="seg seg-sm" role="group" aria-label="期間">' + [['all', '月'], ['first', '前半'], ['second', '後半']].map(function (p) {
        return '<button type="button" data-prpart="' + p[0] + '" aria-pressed="' + (st.part === p[0]) + '">' + p[1] + '</button>';
      }).join('') + '</span></div>';
  }
  function lastOf(d) { var m = (d.months || []).filter(function (x) { return x.ym === d.ym; })[0]; return m && m.last ? u.mdShort(m.last) + 'までの映像' : ''; }

  function draw() {
    if (APP.current() !== 'stats' || mode !== 'presence') return;
    var el = document.getElementById('view');
    var d = st.data[st.ym];
    if (st.err === 'notyet') { el.innerHTML = head(null) + '<div class="card"><p>出演はまだ準備中です。</p></div>'; bind(el); return; }
    if (st.months && !st.months.length) { el.innerHTML = head(null) + '<div class="card"><p>まだ出演ログがありません。</p></div>'; bind(el); return; }
    if (!d) { el.innerHTML = head(null) + '<p class="sub">' + (st.err ? 'つながりませんでした。「最新にする」を押してください' : '読み込んでいます…') + '</p>'; bind(el); return; }
    var rows = rowsOf(d);
    el.innerHTML = head(d) +
      (rows.length ? sumTable(rows, '昼') + sumTable(rows, '夜') + (st.mine ? '' : teamCard(rows)) + timeline(rows) : '<div class="card"><p>この期間の出演ログはありません。</p></div>') +
      '<p class="fresh">アーカイブ映像を1分ごとに見て、席の名前（予想帯の色）とカメラの顔で自動判定した目安です。5分未満の不在は在席に含む。在席率＝在席÷（在席＋離席）。画面外＝待機・広告などカメラの出ない時間（離席に数えない）。席を入れ替えずに相方の席に座ると取り違えます。' +
      (st.mine ? '見えるのは自分の分だけです。' : '配信者には本人の分だけ見えます（相方の帯・席の内訳は出しません）。') + '</p>';
    bind(el);
  }

  function bind(el) {
    var ym = el.querySelector('#pr-ym'), rl = el.querySelector('#pr-reload');
    if (ym) ym.addEventListener('change', function () { st.ym = ym.value; st.open = ''; if (st.data[st.ym]) draw(); else load(st.ym); });
    if (rl) rl.addEventListener('click', function () { if (st.loading) return; delete st.data[st.ym]; load(st.ym); });
    el.querySelectorAll('[data-prpart]').forEach(function (b) { b.addEventListener('click', function () { st.part = b.dataset.prpart; st.open = ''; draw(); }); });
    el.querySelectorAll('[data-prtl]').forEach(function (b) { b.addEventListener('click', function () { st.tl = b.dataset.prtl; st.open = ''; draw(); }); });
    el.querySelectorAll('[data-prday]').forEach(function (b) { b.addEventListener('click', function () { st.open = st.open === b.dataset.prday ? '' : b.dataset.prday; draw(); }); });
    el.querySelectorAll('[data-prwho]').forEach(function (b) { b.addEventListener('click', function () { st.who = st.who === b.dataset.prwho ? '' : b.dataset.prwho; draw(); }); });
  }

  // ［売上｜出演］の切り替え（どちらの画面の見出しからでも）
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-smode]');
    if (!b || b.dataset.smode === mode) return;
    mode = b.dataset.smode;
    try { localStorage.setItem(MODE_LS, mode); } catch (err) { /* 覚えられなくても切り替えは効く */ }
    APP.go('stats');
  });

  return {
    seg: seg,
    active: function () { return can() && mode === 'presence'; },
    render: function () { if (!st.ym && !st.loading && !st.err) load(''); else draw(); }
  };
})();
