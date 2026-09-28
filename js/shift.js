/* shift.js — シフト（本物のシフト表を読む）
   ・月カレンダー。マスには「自分（管理者は強調する人）の枠」だけ、全員はタップした日の詳細で見る
   ・配信者＝管理者が公開した月だけ（GASが公開済みの月しか返さない）
   ・管理者＝全月＋「配信者に公開する／やめる」＋メモ全文と🔒確定の印
   ・シートの空欄＝「未定」、シートに「空き」＝その枠は人を入れない（1人配信など） */
var SHIFT = (function () {
  var u = window.OKL.u;
  var st = { me: null, data: null, ym: null, sel: null, focus: '', loading: false, err: '', confirm: false, fetchedAt: null };

  function isAdmin() { return st.me && st.me.role === 'admin'; }
  function target() { return isAdmin() ? st.focus : st.me.name; }
  function limitOf(name) {
    var m = (st.me.members || []).filter(function (x) { return x.name === name; })[0];
    return m ? m.limit : null;
  }

  function load(ym) {
    st.loading = true; st.err = '';
    SHIFT.render();
    return API.shift(ym).then(function (d) {
      st.data = d; st.ym = d.ym; st.fetchedAt = new Date(); st.confirm = false;
      if (!st.sel || u.ymOf(st.sel) !== d.ym) st.sel = d.ym && d.today && u.ymOf(d.today) === d.ym ? d.today : (d.rows[0] && d.rows[0].date);
    }).catch(function (e) {
      st.err = e.code === 'not published' ? 'この月はまだ公開されていません' : '読み込めませんでした。電波のよいところで「最新にする」を押してください';
    }).then(function () { st.loading = false; SHIFT.render(); });
  }

  // メンバーカラー（GASが名前と一緒に返す。コードには対応表を書かない）
  function colorOf(name) {
    var m = (st.me.members || []).filter(function (x) { return x.name === name; })[0];
    return m && m.color ? m.color : null;
  }
  // 塗りの上の字の色：明るい色（黄など）は黒字、それ以外は白字
  function inkOn(hex) { return u.inkOn(hex); }
  function colorStyle(name) {
    var c = colorOf(name);
    return c ? ' style="background:' + c + ';color:' + inkOn(c) + '"' : '';
  }

  function chip(name, me, locked) {
    if (!name) return '<span class="name is-empty">未定</span>';
    if (name === '空き') return '<span class="name is-aki">空き</span>';
    return '<span class="name mc' + (name === me ? ' is-me' : '') + '"' + colorStyle(name) + '>' + (locked ? '<span class="lock" aria-label="確定">🔒</span>' : '') + u.esc(name) + '</span>';
  }

  // その日の自分の枠（昼／夜）。通しはシートの違反なので出ない前提だが、あれば昼を優先
  function mySlot(r, me) {
    if (!me) return null;
    if (r.day.indexOf(me) >= 0) return '昼';
    if (r.night.indexOf(me) >= 0) return '夜';
    return null;
  }
  // 相方（同じ枠のもう1人）。空欄＝未定、「空き」＝1人配信
  function partnerOf(r, me, slot) {
    var pair = slot === '昼' ? r.day : r.night;
    var other = pair.filter(function (x, i) { return !(x === me && pair.indexOf(me) === i); })[0];
    if (other === undefined || other === '') return { label: '未定', cls: 'is-empty' };
    if (other === '空き') return { label: '1人', cls: 'is-solo' };
    return { label: other, name: other };
  }

  // マスの下半分。自分の出勤日＝相方の名前（メンバーカラー）／管理者で強調なし＝未定の数
  function cellBody(r, me, slot) {
    if (me) {
      if (!slot) return '';
      var p = partnerOf(r, me, slot);
      return '<span class="pc ' + (p.cls || '') + '"' + (p.name ? colorStyle(p.name) : '') + '>' + u.esc(p.label) + '</span>';
    }
    var open = r.day.concat(r.night).filter(function (x) { return x === ''; }).length;
    return open ? '<span class="sm aki">未定' + open + '</span>' : '';
  }

  // グレードの札：昼開催＝「昼G」（金地）／夜開催＝「夜G」（紺地に金字）（9/29 Naoto「夜グレードと昼グレードが分かりづらい」）
  function gradeBadge(g) {
    if (!g) return '';
    return '<span class="gb ' + (g.slot === '夜' ? 'gb-night' : 'gb-day') + '">' + g.slot + 'G</span>';
  }

  // 🔑月曜始まり（9/29 Naoto）。u.dow は日曜=0 なので (曜日+6)%7 で月曜=0 に直す
  var HEAD = ['月', '火', '水', '木', '金', '土', '日'];
  function calendar(rows, me, today) {
    var first = (u.dow(rows[0].date) + 6) % 7;
    var h = '';
    for (var i = 0; i < first; i++) h += '<span class="scal-cell is-blank"></span>';
    rows.forEach(function (r) {
      var dw = u.dow(r.date);
      var slot = mySlot(r, me);
      // 自分の出勤日はマスごと塗る：昼＝薄い黄／夜＝紺（9/29 Naoto）
      var cls = ['scal-cell', slot === '昼' ? 'is-mine-day' : slot === '夜' ? 'is-mine-night' : '',
        r.date === today ? 'is-today' : '', r.date === st.sel ? 'is-sel' : ''].join(' ');
      h += '<button type="button" class="' + cls + '" data-date="' + r.date + '" aria-pressed="' + (r.date === st.sel) + '" aria-label="' + u.md(r.date) + (slot ? '・' + slot + 'の出番' : '') + (r.grade ? '・' + u.esc(r.grade.name) : '') + '">' +
        '<span class="scal-top"><span class="scal-d num ' + (dw === 0 ? 'sun' : dw === 6 ? 'sat' : '') + '">' + Number(r.date.slice(8)) + '</span>' + gradeBadge(r.grade) + '</span>' +
        '<span class="scal-body">' + cellBody(r, me, slot) + '</span></button>';
    });
    return '<div class="cal-head mon">' + HEAD.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div><div class="scal">' + h + '</div>';
  }
  function detail(r, me, today) {
    var lk = r.locked || [false, false, false, false];
    return '<div class="card day-detail">' +
      '<div class="row" style="justify-content:space-between"><strong class="day-detail-date">' + u.md(r.date) + (r.date === today ? ' 今日' : '') + '</strong>' +
      (r.grade ? '<span class="grade-line">' + gradeBadge(r.grade) + u.esc(r.grade.name) + '</span>' : '') + '</div>' +
      '<div class="slot-row"><span class="pill day">昼</span>' + chip(r.day[0], me, lk[0]) + chip(r.day[1], me, lk[1]) + '</div>' +
      '<div class="slot-row"><span class="pill night">夜</span>' + chip(r.night[0], me, lk[2]) + chip(r.night[1], me, lk[3]) + '</div>' +
      (isAdmin() && r.memo ? '<p class="memo">メモ：' + u.esc(r.memo) + '</p>' : '') +
      '</div>';
  }

  // 管理者だけ：この月を配信者に見せるかどうか
  function publishBar(d) {
    var label = u.monthLabel(d.ym);
    if (st.confirm) {
      return '<div class="card pub-bar is-confirm">' +
        '<p><b>' + label + 'のシフトを' + (d.published ? '非公開に戻しますか？' : '配信者に公開しますか？') + '</b></p>' +
        '<p class="sub">' + (d.published ? '配信者の画面からこの月が消えます。' : '配信者全員の画面に、この月のシフトがそのまま表示されます。公開したあとにシート側で直した分も、次に開いたときに反映されます。') + '</p>' +
        '<div class="btn-row"><button type="button" class="btn ghost" id="pub-no">やめる</button><button type="button" class="btn" id="pub-yes">' + (d.published ? '非公開に戻す' : '公開する') + '</button></div></div>';
    }
    // 🔑1行に収める（公開の状態＋ボタン＋強調する人）＝1画面に収めるため（9/29 Naoto「スクロール無しで全部表示」）
    return '<div class="admin-bar">' +
      (d.published ? '<span class="pill ok">公開中</span>' : '<span class="pill dim">非公開</span>') +
      '<button type="button" class="btn ' + (d.published ? 'ghost' : '') + ' btn-sm" id="pub-ask">' + (d.published ? '非公開に戻す' : '配信者に公開') + '</button>' +
      '<select id="focus" class="date-input focus-sel" aria-label="強調する人"><option value="">強調：なし</option>' +
      st.me.members.map(function (m) { return '<option value="' + u.esc(m.name) + '"' + (m.name === st.focus ? ' selected' : '') + '>強調：' + u.esc(m.name) + '</option>'; }).join('') +
      '</select></div>';
  }

  function render(el) {
    el = el || document.getElementById('view');
    var d = st.data;
    if (!d) {
      el.innerHTML = '<div class="title-row"><h1 class="screen-title">シフト</h1></div>' + (st.err ? '<div class="card"><p>' + u.esc(st.err) + '</p><button type="button" class="btn" id="reload">最新にする</button></div>' : '<p class="sub">読み込んでいます…</p>');
      bind(el);
      return;
    }
    var months = d.months || [];
    if (!months.length || !d.rows || !d.rows.length) {
      el.innerHTML = '<div class="title-row"><h1 class="screen-title">シフト</h1></div><div class="card"><p>まだ公開されたシフトはありません。</p><p class="sub">管理者が公開すると、ここに表示されます。</p><button type="button" class="btn ghost" id="reload">最新にする</button></div>';
      bind(el);
      return;
    }
    var me = target();
    var today = d.today;
    var rows = d.rows;
    var selRow = rows.filter(function (r) { return r.date === st.sel; })[0];
    var count = 0;
    if (me) rows.forEach(function (r) { count += (r.day.indexOf(me) >= 0 ? 1 : 0) + (r.night.indexOf(me) >= 0 ? 1 : 0); });
    var lim = me ? limitOf(me) : null;
    // 月の切り替えは直近だけ（前の月〜）。古い月は出さない
    var curYm = u.ymOf(today);
    var shown = months.filter(function (m) { return m.ym >= u.addMonth(curYm, -1); });
    if (!shown.some(function (m) { return m.ym === d.ym; })) shown.push(months.filter(function (m) { return m.ym === d.ym; })[0]);

    // 🔑1画面に収める並び（9/29 Naoto）：見出し行 → 月 → （管理者だけ1行） → カレンダー（凡例と出勤数は枠の中の1行） → その日の詳細
    //   「シフト」の見出しの位置は管理者・配信者で同じ（管理者の追加分は月の切り替えより下にだけ入る）
    var at = st.fetchedAt ? u.pad(st.fetchedAt.getHours()) + ':' + u.pad(st.fetchedAt.getMinutes()) + '時点' : '';
    el.innerHTML =
      '<div class="title-row"><h1 class="screen-title">シフト</h1>' +
      '<span class="title-aside">' + (st.loading ? '読み込み中…' : at) + ' <button type="button" class="link-btn" id="reload">最新にする</button></span></div>' +
      '<div class="seg seg-sm" role="group" aria-label="月">' + shown.map(function (m) {
        return '<button type="button" data-ym="' + m.ym + '" aria-pressed="' + (m.ym === d.ym) + '">' + u.monthLabel(m.ym) + (isAdmin() && !m.published ? '<small class="seg-note">非公開</small>' : '') + '</button>';
      }).join('') + '</div>' +
      (isAdmin() ? publishBar(d) : '') +
      // 選んだ日の枠＝見ている人（管理者は強調中の人）のメンバーカラー（9/29 Naoto）
      '<div class="card cal-card"' + (me && colorOf(me) ? ' style="--sel:' + colorOf(me) + '"' : '') + '>' + calendar(rows, me, today) +
      '<div class="legend">' +
      (me ? '<span><span class="lg lg-day">昼</span><span class="lg lg-night">夜</span>＝' + (isAdmin() ? 'その人' : '自分') + 'の出番（中は相方）</span>' : '<span><span class="sm aki">未定</span>＝人が入っていない枠</span>') +
      '<span><span class="gb gb-day">昼G</span><span class="gb gb-night">夜G</span>＝グレード</span>' +
      (me ? '<span class="legend-count">' + (isAdmin() ? u.esc(me) + ' ' : '') + '<b class="num">' + count + '</b>枠' + (lim ? '/' + lim : '') + '</span>' : '') +
      '</div></div>' +
      (selRow ? detail(selRow, me, today) : '');
    bind(el);
  }

  function bind(el) {
    var q = function (s) { return el.querySelector(s); };
    if (q('#reload')) q('#reload').addEventListener('click', function () { if (!st.loading) load(st.ym); });
    el.querySelectorAll('[data-ym]').forEach(function (b) { b.addEventListener('click', function () { st.sel = null; load(b.dataset.ym); }); });
    el.querySelectorAll('.scal-cell[data-date]').forEach(function (b) { b.addEventListener('click', function () { st.sel = b.dataset.date; render(el); }); });
    if (q('#focus')) q('#focus').addEventListener('change', function () { st.focus = q('#focus').value; render(el); });
    if (q('#pub-ask')) q('#pub-ask').addEventListener('click', function () { st.confirm = true; render(el); });
    if (q('#pub-no')) q('#pub-no').addEventListener('click', function () { st.confirm = false; render(el); });
    if (q('#pub-yes')) q('#pub-yes').addEventListener('click', function () {
      var on = !st.data.published;
      q('#pub-yes').disabled = true;
      API.publish(st.ym, on).then(function (d) {
        st.data = d; st.confirm = false;
        APP.toast(on ? u.monthLabel(d.ym) + 'を配信者に公開しました' : u.monthLabel(d.ym) + 'を非公開に戻しました');
        render(el);
      }).catch(function () {
        APP.toast('切り替えられませんでした。もう一度お試しください', true);
        st.confirm = false; render(el);
      });
    });
  }

  return {
    init: function (me) { st.me = me; return load(null); },
    // 🔑読み込みの完了は別のタブを開いている最中に来ることがある＝シフトを表示中のときだけ描く
    render: function () { if (APP.current() === 'shift') render(); },
    reload: function () { return load(st.ym); }
  };
})();
