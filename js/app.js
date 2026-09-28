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
    // 管理者の休み希望＝シートに入っている希望の一覧（wishadmin.js）。配信者は今までどおり準備中
    if (t.id === 'wish' && window.WISHADMIN && WISHADMIN.can(me)) { WISHADMIN.render(); return; }
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

  // ロゴの右。配信者＝名前の文字だけ／管理者・プレビュー中＝同じ場所に切り替えメニュー
  //   🔑ロゴの行の高さを変えない（帯を足すと下が全部ずれる＝9/29 Naoto「そのずれもない方がいい」）
  function renderWho(m) {
    var box = document.getElementById('who-now');
    // 誰で見ているかの札＝その人のメンバーカラー（9/29 Naoto）。管理者本人は色なし
    var mc = (m.members || []).filter(function (x) { return x.name === m.name; })[0];
    var paint = mc && mc.color ? 'background:' + mc.color + ';color:' + u.inkOn(mc.color) + ';border-color:' + mc.color : '';
    if (!m.previewBy && m.role !== 'admin') {
      box.innerHTML = '<span class="who-name"' + (paint ? ' style="' + paint + '"' : '') + '>' + u.esc(m.name) + '</span>';
      return;
    }
    var names = m.members.map(function (x) {
      return '<option value="' + u.esc(x.name) + '"' + (m.previewBy && x.name === m.name ? ' selected' : '') + '>' + u.esc(x.name) + '</option>';
    }).join('');
    var ADMIN = '__admin';
    var adminLabel = u.esc(m.previewBy || m.name) + '（管理者）';
    box.innerHTML = '<select id="as-sel" class="who-sel' + (m.previewBy ? ' is-preview' : '') + '"' + (m.previewBy && paint ? ' style="' + paint + '"' : '') + ' aria-label="' + (m.previewBy ? '表示する配信者を切り替える' : '配信者として見る') + '">' +
      (m.previewBy
        ? '<optgroup label="配信者の画面（プレビュー）">' + names + '</optgroup><option value="' + ADMIN + '">↩ 管理者に戻る</option>'
        : '<option value="" selected>' + adminLabel + '</option><optgroup label="配信者として見る">' + names + '</optgroup>') +
      '</select>';
    document.getElementById('as-sel').addEventListener('change', function (e) {
      var v = e.target.value;
      if (v === ADMIN) setAs('');
      else if (v && v !== (m.previewBy ? m.name : '')) setAs(v);
    });
  }

  function boot() {
    KEYGATE.bind();
    if (!CONFIG.KEY) { KEYGATE.show(''); document.getElementById('view').innerHTML = ''; return; }
    API.me().then(function (m) {
      me = m;
      renderWho(m);
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
    if (document.visibilityState === 'visible' && me && (tab === 'shift' || tab === 'wish')) SHIFT.reload();
  });

  boot();
  // ほかの画面からタブを切り替える（休み希望の行→その日のシフト）
  function go(id) { tab = id; render(); window.scrollTo(0, 0); }

  return { toast: toast, current: function () { return tab; }, go: go };
})();
