/* pl.js — ホームの「収支発表（投稿用）」カード（2026-10-02 Naoto「アプリに出して、そこから簡単にコピペできるように」）
   ・YouTubeの「投稿」タブに載せる「収支発表 ◯月◯日現在」の文面をGASが作る（OBSに入れた予想の投資・払戻＝その月の累計）
   ・ここは「見せる」と「コピー」だけ。🔴投稿タブは公式APIが無い＝貼るのは人（投稿タブで今月の投稿を開いて本文を貼り替える）
   ・読み込みは共有タブと同じ型（前回の控えをすぐ出し、裏で最新を取る）
   ・🔴人名・金額はGASが返す（このファイルに書かない＝公開リポジトリ） */
var PL = (function () {
  var u = window.OKL.u;
  var st = { data: null, loading: false, err: '', at: 0, cached: false };
  var LS = 'gakuya:pl:' + (CONFIG.KEY || '').slice(0, 6) + ':' + (CONFIG.AS || '');
  try { var c0 = JSON.parse(localStorage.getItem(LS) || 'null'); if (c0 && c0.d) { st.data = c0.d; st.at = c0.at || 0; st.cached = true; } } catch (e) { /* 控えが無くても読む */ }

  function can(me) { return !!(me && me.pl); }

  var seq = 0;
  function load(force) {
    if (st.loading && !force) return;
    var my = ++seq;
    st.loading = true; st.err = ''; draw();
    API.pl().then(function (d) {
      if (my !== seq) return;
      st.data = d; st.at = Date.now(); st.cached = false;
      try { localStorage.setItem(LS, JSON.stringify({ d: d, at: st.at })); } catch (e) { /* 控えられなくても表示は続ける */ }
    }, function (e) { if (my === seq) st.err = (e && e.code) || 'net'; })
      .then(function () { if (my !== seq) return; st.loading = false; draw(); });
  }
  // ホームに置かれた直後（app.js）。1分以内に読んだものがあればそのまま
  function mounted() { if (!st.data || !st.at || Date.now() - st.at > 60000) load(); }

  function md(s) { return (+s.slice(5, 7)) + '/' + (+s.slice(8, 10)); }
  function yen(n) { return u.yen(n) + '円'; }
  function pm(n) { return '<span class="' + (n > 0 ? 'plus' : n < 0 ? 'minus' : '') + '">' + (n > 0 ? '+' : n < 0 ? '−' : '±') + u.yen(Math.abs(n)) + '</span>'; }

  // 今日の分（人ごと）＝文面の検算用。予想のある人だけ
  function todayTable(d) {
    var rows = d.people.filter(function (p) { return p.today && (p.today.settled || p.today.unsettled); });
    if (!rows.length) return '<p class="sub">今日はまだ予想がありません。</p>';
    return '<table class="pl-tbl"><thead><tr><th>人</th><th>投資</th><th>回収</th><th>収支</th><th>的中</th></tr></thead><tbody>' +
      rows.map(function (p) {
        var t = p.today;
        return '<tr><td>' + u.esc(p.name) + '</td><td>' + u.yen(t.invest) + '</td><td>' + u.yen(t.refund) + '</td><td>' + pm(t.refund - t.invest) + '</td>' +
          '<td>' + t.hits + '/' + t.settled + (t.unsettled ? '<small>（未確定' + t.unsettled + '）</small>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function card() {
    var d = st.data, body = '';
    if (!d) {
      body = st.loading ? '<p class="sub">読み込んでいます…</p>'
        : '<p class="sub">取れませんでした。電波のよいところでもう一度。</p><button type="button" class="btn ghost btn-sm" data-pl-reload>もう一度</button>';
    } else {
      var pend = 0, pendYen = 0;
      d.people.forEach(function (p) { pend += p.unsettled || 0; pendYen += p.pending || 0; });
      body =
        // 🔄10/3 Naoto「配信中は前日までの集計に」＝文面は前日（asof）までの月の累計。今日の配信の分は翌日に入る
        '<p class="sub">' + md(d.asof) + 'までの月の累計（今日の配信分は明日から入ります）' +
          (st.cached ? '（前回の控え）' : '') + (st.loading ? '・読み込み中…' : '') + '</p>' +
        '<textarea class="pl-text" id="pl-text" readonly rows="9" spellcheck="false">' + u.esc(d.text) + '</textarea>' +
        '<div class="btn-row"><button type="button" class="btn" data-pl-copy>文面をコピー</button>' +
          '<button type="button" class="btn ghost" data-pl-reload' + (st.loading ? ' disabled' : '') + '>最新にする</button></div>' +
        (pend ? '<p class="pl-warn">⚠️ 結果がまだ入っていないレースが ' + pend + ' レース（投資 ' + yen(pendYen) + '）。結果が入ると数字が変わります。</p>' : '') +
        '<details class="pl-today"><summary>今日（' + md(d.today || d.asof) + '）の途中経過を見る（文面には入りません）</summary>' + todayTable(d) + '</details>' +
        '<p class="fresh">数字＝OBSに入れた予想の投資と払戻の合計（結果が入ったレースだけ・前日までのその月の累計）。コピーしたら、YouTubeの「投稿」タブで今月の収支発表を開いて本文を貼り替えてください。</p>';
    }
    return '<div class="card pl-card" id="pl-card"><div class="pr-cap">💴 収支発表（投稿用）</div>' + body + '</div>';
  }
  function draw() { var el = document.getElementById('pl-card'); if (el) el.outerHTML = card(); }

  // コピー＝クリップボードAPI → だめなら欄を選んで execCommand → それもだめなら長押しの案内
  function copy() {
    var d = st.data;
    if (!d || !d.text) return;
    var done = function () { APP.toast('コピーしました。YouTubeの投稿に貼ってください'); };
    var fallback = function () {
      var ta = document.getElementById('pl-text');
      if (!ta) return;
      ta.focus(); ta.select();
      try { ta.setSelectionRange(0, ta.value.length); } catch (e) { /* 選べない端末 */ }
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      if (ok) done(); else APP.toast('文面を長押しして「すべて選択」→コピーしてください', true);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(d.text).then(done, fallback);
    else fallback();
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-pl-copy]')) copy();
    else if (e.target.closest('[data-pl-reload]')) load(true);
  });

  return { can: can, card: card, mounted: mounted, load: load };
})();
