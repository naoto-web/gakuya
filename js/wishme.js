/* wishme.js — 配信者の「休み希望」タブ（2026-10-01 Naoto決定）
   ・出した希望はそのままシフト表の休み希望欄（本人の列）へ＝GAS wish.gs。ひとことは記録のシートだけ（管理者が見る）
   ・締切＝その月の前月20日。過ぎた月は見るだけ（変更は管理者へ）
   ・種類＝休／半休（出られない時間帯＝モ・デ・ナ・ミを選ぶ＝シートには「半（モ・デNG）」）＋ひとこと。撮影は管理者が入れる
   ・この月は希望なし＝ボタン1つ（未提出と区別する）
   ・プレビュー（管理者の「配信者として見る」）は見るだけ */
var WISHME = (function () {
  var u = window.OKL.u;
  var st = { data: null, loading: false, err: '', sel: '', busy: false, draft: null };

  function load(ym) {
    st.loading = true; draw();
    API.wish(ym).then(function (d) { st.data = d; st.err = ''; }, function (e) { st.err = e.code || 'net'; })
      .then(function () { st.loading = false; draw(); });
  }
  function me() { return APP.me() || {}; }
  function color() { var m = (me().members || []).filter(function (x) { return x.name === me().name; })[0]; return (m && m.color) || '#7a6fd0'; }
  function dayClass(date) { var dw = u.dow(date); return dw === 0 || u.holidayOf(date) ? 'sun' : dw === 6 ? 'sat' : ''; }
  function dateOf(ym, i) { return ym + '-' + u.pad(i); }
  function gb(g) { return '<span class="gb ' + (g.slot === '夜' ? 'gb-night' : 'gb-day') + '">' + g.slot + 'G</span>'; }

  // 締切の帯（あと何日）
  function deadline(d) {
    var left = u.daysBetween(d.today, d.due);
    var cls = !d.open ? ' is-done' : left <= 3 ? ' is-urgent' : '';
    return '<div class="deadline' + cls + '"><div class="deadline-title">' + u.monthLabel(d.ym) + '分の休み希望</div>' +
      '<div class="deadline-left">' + (d.open ? (left ? '<span class="wm-left">あと<span class="num">' + left + '</span>日</span>' : '<span class="wm-left">今日まで</span>') : '<span class="wm-left">締切済み</span>') + '</div>' +
      '<div class="deadline-when">締切 ' + u.md(d.due) + (d.open ? '' : '・変更は管理者に連絡してください') + '</div></div>';
  }

  function cal(d) {
    var mine = d.mine || {}, mc = color();
    var first = (u.dow(dateOf(d.ym, 1)) + 6) % 7, h = '';
    for (var i = 0; i < first; i++) h += '<span class="scal-cell is-blank"></span>';
    for (var day = 1; day <= d.days; day++) {
      var date = dateOf(d.ym, day), w = mine[date], info = u.wishInfo(w);
      // 塗り＝休み（休＝マス全体／半休＝出られない時間帯だけ・左からモ・デ・ナ・ミの4等分）
      var tint = 'color-mix(in srgb, ' + mc + ' 35%, #ffffff)';
      var ngBg = info && info.ng ? 'linear-gradient(90deg,' + [0, 1, 2, 3].map(function (x) { return (info.ng.indexOf(x) >= 0 ? tint : '#ffffff') + ' ' + x * 25 + '% ' + (x + 1) * 25 + '%'; }).join(',') + ')' : '';
      var bg = info && info.k === 'half' && info.ng ? ' style="background:' + ngBg + '"'
        : info && info.k === 'off' ? ' style="background:color-mix(in srgb, ' + mc + ' 35%, #ffffff)"' : '';
      h += '<button type="button" class="scal-cell wm-cell' + (date === st.sel ? ' is-sel' : '') + (date === d.today ? ' is-today' : '') + '" data-wm="' + date + '"' + bg + '>' +
        '<span class="scal-top"><span class="scal-d num ' + dayClass(date) + '">' + day + '</span>' + ((d.grades[day - 1] || []).length === 2 ? '<span class="gb gb-both">昼夜G</span>' : (d.grades[day - 1] || []).map(gb).join('')) + '</span>' +
        '<span class="scal-body wm-body">' + (info ? '<b class="wm-mark wm-' + info.k + '">' + (info.k === 'off' ? '休' : info.k === 'shoot' ? '撮影' : '半') + '</b>' : '') + '</span></button>';
    }
    return '<div class="card cal-card" style="--sel:' + mc + '"><div class="cal-head mon">' + ['月', '火', '水', '木', '金', '土', '日'].map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
      '<div class="scal">' + h + '</div>' +
      '<div class="legend"><span><b class="wm-mark wm-off">休</b> 休み <b class="wm-mark wm-half">半</b> 半休（塗り＝出られない時間帯・左からモ・デ・ナ・ミ）</span></div></div>';
  }

  // 日付を押した板：［なし｜休｜半休］＋半休の時間帯＋ひとこと
  function board(d) {
    if (!st.sel) return '<p class="sub">休みたい日を押してください。</p>';
    var cur = (d.mine || {})[st.sel] || '', info = u.wishInfo(cur);
    if (!st.draft) st.draft = { k: info ? info.k : 'none', ng: info && info.ng ? info.ng.slice() : [], note: (d.notes || {})[st.sel] || '' };
    var dr = st.draft, canEdit = d.open && !me().previewBy && !(info && info.k === 'shoot');
    var races = ((d.races || {})[st.sel] || []).map(function (x) { return x.v + ' ' + x.g; }).join('・');
    var h = '<div class="card wm-board"><div class="wm-bhead"><b class="' + dayClass(st.sel) + '">' + u.md(st.sel) + '</b><small>' + u.esc(races) + '</small></div>';
    if (info && info.k === 'shoot') return h + '<p class="sub">この日は撮影の予定が入っています（変更は管理者に連絡してください）。</p></div>';
    if (!canEdit) return h + '<p>' + (cur ? '出した希望：<b>' + u.esc(info ? info.label : cur) + '</b>' : '希望は出していません') + '</p>' +
      (dr.note ? '<p class="sub">ひとこと：' + u.esc(dr.note) + '</p>' : '') +
      '<p class="fresh">' + (me().previewBy ? 'プレビュー中は見るだけです。' : '締切を過ぎたので変えられません。変更は管理者に連絡してください。') + '</p></div>';
    h += '<div class="wm-kinds">' + [['none', 'なし'], ['off', '休'], ['half', '半休']].map(function (k) {
      return '<button type="button" class="wm-k' + (dr.k === k[0] ? ' is-on' : '') + '" data-wk="' + k[0] + '">' + k[1] + '</button>';
    }).join('') + '</div>';
    if (dr.k === 'half') {
      h += '<div class="field-cap">出られない時間帯（押して選ぶ）</div><div class="wm-q">' + u.Q4.map(function (q, i) {
        return '<button type="button" class="wm-qb' + (dr.ng.indexOf(i) >= 0 ? ' is-ng' : '') + '" data-wq="' + i + '">' + q + '</button>';
      }).join('') + '</div><p class="fresh">' + (dr.ng.length ? u.halfSay(dr.ng) : '出られない時間帯を1つ以上選んでください') + '</p>';
    }
    h += '<input class="date-input wm-note" id="wm-note" maxlength="100" placeholder="ひとこと（なくてもOK・管理者だけが見ます）" value="' + u.esc(dr.note) + '">' +
      '<button type="button" class="btn" id="wm-save"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? '送っています…' : 'この日の希望を出す') + '</button></div>';
    return h;
  }

  function draw() {
    if (APP.current() !== 'wish') return;
    var el = document.getElementById('view'), d = st.data;
    var head = '<div class="title-row"><h1 class="screen-title">休み希望</h1><span class="title-aside">' + (st.loading ? '読み込み中…' : '') +
      ' <button type="button" class="link-btn" id="wm-reload">最新にする</button></span></div>';
    if (!d) { el.innerHTML = head + '<p class="sub">' + (st.err ? 'つながりませんでした。「最新にする」を押してください。' : '読み込んでいます…') + '</p>'; bind(el); return; }
    if (!d.ym) { el.innerHTML = head + '<div class="card"><p>休み希望を出せる月はまだありません。</p></div>'; bind(el); return; }
    var mine = d.mine || {}, n = { off: 0, half: 0 };
    Object.keys(mine).forEach(function (k) { var i = u.wishInfo(mine[k]); if (i && n[i.k] != null) n[i.k]++; });
    el.innerHTML = head +
      '<div class="seg seg-sm" role="group" aria-label="月">' + d.months.map(function (m) {
        return '<button type="button" data-wmym="' + m.ym + '" aria-pressed="' + (m.ym === d.ym) + '">' + u.monthLabel(m.ym) + '<small class="seg-note">' + (m.open ? '受付中' : '締切済') + '</small></button>';
      }).join('') + '</div>' +
      deadline(d) + cal(d) + board(d) +
      '<div class="card wm-sum"><div>出した希望：休 <b class="num">' + n.off + '</b>日・半休 <b class="num">' + n.half + '</b>日' +
        (d.none ? '<small>（この月は希望なしで出しました）</small>' : '') + '</div>' +
        (d.open && !me().previewBy && !Object.keys(mine).length && !d.none ? '<button type="button" class="btn ghost btn-sm" id="wm-none">この月は希望なしで出す</button>' : '') +
        '<p class="fresh">押したその場でシフト表に入ります。締切を過ぎたら変更は管理者に連絡してください。撮影の日は管理者が入れます。</p></div>';
    bind(el);
  }

  function save(body, msg) {
    st.busy = true; draw();
    return API.wishMe(body).then(function (d) {
      st.busy = false; st.draft = null; st.data = d; APP.toast(msg); draw();
    }, function (e) {
      st.busy = false;
      if (e.code === 'conflict') { APP.toast('ほかで変わっていたので読み直しました', true); st.draft = null; load(st.data.ym); return; }
      draw(); APP.toast((e.data && e.data.error) || '送れませんでした', true);
    });
  }

  function bind(el) {
    var q = function (s) { return el.querySelector(s); };
    var rl = q('#wm-reload'); if (rl) rl.addEventListener('click', function () { st.draft = null; load(st.data && st.data.ym); });
    el.querySelectorAll('[data-wmym]').forEach(function (b) { b.addEventListener('click', function () { st.sel = ''; st.draft = null; load(b.dataset.wmym); }); });
    el.querySelectorAll('[data-wm]').forEach(function (b) {
      b.addEventListener('click', function () {
        st.sel = st.sel === b.dataset.wm ? '' : b.dataset.wm; st.draft = null; draw();
        var bd = q('.wm-board'); if (bd) bd.scrollIntoView({ block: 'nearest' });
      });
    });
    var keepNote = function () { var n = q('#wm-note'); if (n && st.draft) st.draft.note = n.value; };
    el.querySelectorAll('[data-wk]').forEach(function (b) { b.addEventListener('click', function () { keepNote(); st.draft.k = b.dataset.wk; draw(); }); });
    el.querySelectorAll('[data-wq]').forEach(function (b) {
      b.addEventListener('click', function () {
        keepNote();
        var i = +b.dataset.wq, ng = st.draft.ng, at = ng.indexOf(i);
        if (at >= 0) ng.splice(at, 1); else ng.push(i);
        draw();
      });
    });
    var sv = q('#wm-save');
    if (sv) sv.addEventListener('click', function () {
      keepNote();
      var dr = st.draft, d = st.data;
      if (dr.k === 'half' && !dr.ng.length) { APP.toast('出られない時間帯を選んでください', true); return; }
      var value = dr.k === 'off' ? '休' : dr.k === 'half' ? u.wishText(dr.ng) : '';
      save({ ym: d.ym, date: st.sel, value: value, note: dr.note, expect: (d.mine || {})[st.sel] || '' }, value ? '出しました' : '取り消しました');
    });
    var nb = q('#wm-none');
    if (nb) nb.addEventListener('click', function () { save({ ym: st.data.ym, none: true }, '「希望なし」で出しました'); });
  }

  return {
    render: function () { if (!st.data && !st.loading) load(); else draw(); }
  };
})();
