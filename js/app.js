/* app.js — 起動・鍵の確認・下のタブ
   いま本物につながっているのはシフトだけ（2026-09-29〜）。ほかのタブは準備中の案内を出す。 */
var APP = (function () {
  var u = window.OKL.u;
  var me = null;
  var tab = 'shift';

  var ICON = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    shift: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    wish: '<path d="M4 20V5a1 1 0 0 1 1-1h11l4 4v12z"/><path d="M8 13l3 3 5-6"/>',
    stats: '<path d="M4 20h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/>'
  };
  var TABS = [
    { id: 'home', label: 'ホーム', soon: '次の出番・休み希望の締切・自分の数字をここにまとめます。' },
    { id: 'shift', label: 'シフト' },
    { id: 'wish', label: '休み希望', soon: '休みたい日をカレンダーで選んで、管理者に送れるようになります。締切もここに出ます。' },
    { id: 'stats', label: '実績', soon: '自分のnote売上と的中率・回収率を見られるようになります（本人の分だけ）。' }
  ];

  function renderTabs() {
    document.getElementById('tabs').innerHTML = '<div class="tabs-inner">' + TABS.map(function (t) {
      return '<button type="button" class="tab" data-tab="' + t.id + '"' + (t.id === tab ? ' aria-current="page"' : '') + '>' +
        '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[t.id] + '</svg>' + t.label + '</button>';
    }).join('') + '</div>';
  }

  function render() {
    renderTabs();
    var t = TABS.filter(function (x) { return x.id === tab; })[0];
    var view = document.getElementById('view');
    if (t.id === 'shift') { SHIFT.render(); return; }
    view.innerHTML = '<h1 class="screen-title">' + t.label + '</h1><div class="card"><span class="pill dim" style="justify-self:start">準備中</span><p>' + t.soon + '</p></div>';
  }

  function toast(msg, isErr) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' is-err' : '');
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, isErr ? 5000 : 2400);
  }

  // 「配信者として見る」の切り替え。選んだ人を覚えて開き直す（画面の状態を全部作り直すのが一番確実）
  function setAs(name) {
    try { if (name) localStorage.setItem(CONFIG.AS_LS, name); else localStorage.removeItem(CONFIG.AS_LS); } catch (e) { /* 覚えられない端末では切り替えない */ }
    location.reload();
  }

  function renderViewAs(m) {
    var box = document.getElementById('viewas');
    var opts = function (cur) {
      return m.members.map(function (x) { return '<option value="' + u.esc(x.name) + '"' + (x.name === cur ? ' selected' : '') + '>' + u.esc(x.name) + '</option>'; }).join('');
    };
    // 🔑帯は1行・アプリ本体と違う濃い色＝「ここから下が配信者の見え方」とひと目でわかるように
    if (m.previewBy) {
      box.className = 'viewas is-preview';
      box.innerHTML = '<span class="viewas-cap">配信者の画面（プレビュー）</span>' +
        '<select id="as-sel" aria-label="表示する配信者">' + opts(m.name) + '</select>' +
        '<button type="button" class="viewas-back" id="as-back">管理者に戻る</button>';
    } else if (m.role === 'admin') {
      box.className = 'viewas';
      box.innerHTML = '<span class="viewas-cap">管理者</span>' +
        '<select id="as-sel" aria-label="配信者として見る"><option value="">配信者として見る…</option>' + opts('') + '</select>';
    } else { box.hidden = true; return; }
    box.hidden = false;
    document.getElementById('as-sel').addEventListener('change', function (e) { if (e.target.value) setAs(e.target.value); });
    var back = document.getElementById('as-back');
    if (back) back.addEventListener('click', function () { setAs(''); });
  }

  function boot() {
    KEYGATE.bind();
    if (!CONFIG.KEY) { KEYGATE.show(''); document.getElementById('view').innerHTML = ''; return; }
    API.me().then(function (m) {
      me = m;
      // プレビュー中は配信者本人の画面と同じ（名前だけ）。管理者の印は上の帯が持つ
      document.getElementById('who-now').innerHTML = u.esc(m.name);
      renderViewAs(m);
      render();
      SHIFT.init(m);
    }).catch(function (e) {
      if (e.code === 'as') { setAs(''); return; }  // 覚えていた配信者が設定シートから消えた＝管理者に戻す
      if (e.code === 'key') { KEYGATE.show('このリンクは使えなくなっています。管理者に新しいリンクをもらってください。'); document.getElementById('view').innerHTML = ''; return; }
      document.getElementById('view').innerHTML = '<div class="card"><p>つながりませんでした。電波のよいところで開き直してください。</p><button type="button" class="btn" onclick="location.reload()">開き直す</button></div>';
    });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (b && me) { tab = b.dataset.tab; render(); window.scrollTo(0, 0); }
  });

  // アプリに戻ってきたらシフトを取り直す（シートは管理者が随時直すため）
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && me && tab === 'shift') SHIFT.reload();
  });

  boot();
  return { toast: toast, current: function () { return tab; } };
})();
