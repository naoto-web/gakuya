/* share.js — 「共有」タブ（2026-10-01 Yの要望・Naoto決定）
   ・誰でも投稿（題・内容・回答が欲しい人・期限）→対象者が 賛成／反対／どちらでも＋ひとこと
   ・配信者に見えるのは「回答 4/6」の人数と自分の回答だけ。🔴誰がどう答えたか・集計・ひとことは管理者だけ（GASが管理者本人にしか返さない）
   ・並び＝①回答してください（自分が対象でまだ）②進行中（答えた・自分の投稿）③決定事項 ④プログラマーへの要望
   ・管理者＝投稿ごとに集計・回答の内訳・未回答の人／［決定にする］［非表示］、決定事項を直接書く、要望の状態と返事
   ・🔴名前はGASが返す（このファイルに書かない） */
var SHARE = (function () {
  var u = window.OKL.u;
  var st = { data: null, loading: false, err: '', form: false, busy: false, showHidden: false, open: {}, type: '相談' };
  // 🔄10/1 種類＝相談（賛成・反対・どちらでも）／お願い（了解・難しい→あとで完了）。回答の色は字で決める（字でも区別できる）
  var ACLS = { '賛成': 'ok', '反対': 'ng', 'どちらでも': 'mid', '了解': 'ok', '難しい': 'ng', '完了': 'done' };
  function acls(a) { return 'sh-a sh-a-' + (ACLS[a] || 'mid'); }
  function alabel(d) { return u.esc((d && d.adminLabel) || '管理者'); }

  function load(quiet) {
    if (st.loading) return;
    st.loading = true; if (!quiet) draw();
    API.share().then(function (d) { st.data = d; st.err = ''; }, function (e) { st.err = e.code || 'net'; })
      .then(function () { st.loading = false; draw(); badge(); });
  }
  // 下のタブの赤丸＝自分が対象でまだ答えていない数
  function badge() {
    var n = st.data ? st.data.todo : 0;
    var t = document.querySelector('.tab[data-tab="share"]');
    if (!t) return;
    var b = t.querySelector('.badge');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'badge'; t.appendChild(b); }
    b.textContent = n;
  }

  function send(body, okMsg) {
    if (st.busy) return Promise.resolve();
    st.busy = true; draw();
    return API.shareDo(body).then(function () { APP.toast(okMsg); st.busy = false; load(true); return true; },
      function (e) { st.busy = false; draw(); APP.toast((e.data && e.data.error) || e.message || '送れませんでした', true); return false; });
  }

  function when(s) { return s ? u.stamp(s) : ''; }
  function dueTxt(p) {
    if (!p.due) return '期限なし';
    return u.md(p.due) + 'まで' + (p.overdue ? '（過ぎました）' : '');
  }

  // ── 投稿のフォーム ──
  function form(d) {
    if (!st.form) return '<button type="button" class="btn sh-new" id="sh-new">＋ 相談・お願いを投稿する</button>';
    var def = u.ymd(new Date(Date.now() + 3 * 86400000));
    var ask = st.type === 'お願い';
    var chip = function (n, on) { return '<label class="sh-chip"><input type="checkbox" name="sh-t" value="' + u.esc(n) + '"' + (on ? ' checked' : '') + '><span>' + u.esc(n) + '</span></label>'; };
    return '<div class="card sh-form"><h3>投稿する</h3>' +
      '<div class="sh-types">' + ['相談', 'お願い'].map(function (t) {
        return '<button type="button" class="sh-type' + (st.type === t ? ' is-on' : '') + '" data-type="' + t + '"><b>' + t + '</b><small>' +
          (t === '相談' ? '賛成・反対で意見を聞く' : '「〇〇してください」') + '</small></button>';
      }).join('') + '</div>' +
      '<label class="field-cap" for="sh-title">' + (ask ? '何をしてほしいか（題）' : '何をしたいか（題）') + '</label><input id="sh-title" class="date-input" maxlength="80">' +
      '<label class="field-cap" for="sh-body">くわしく（なくてもOK）</label><textarea id="sh-body" class="date-input sh-ta" rows="4" maxlength="2000"></textarea>' +
      '<div class="field-cap">' + (ask ? 'お願いする相手' : '回答が欲しい人') + '</div><div class="sh-chips">' +
        // 相談＝配信者全員にチェック済み／お願い＝相手を選ぶ（最初は誰も選ばない）
        d.people.members.filter(function (n) { return n !== d.me; }).map(function (n) { return chip(n, !ask); }).join('') +
        d.people.others.filter(function (n) { return n !== d.me; }).map(function (n) { return chip(n, false); }).join('') + '</div>' +
      '<label class="field-cap" for="sh-due">' + (ask ? 'いつまでに' : '回答の期限') + '</label><input id="sh-due" type="date" class="date-input" value="' + def + '">' +
      // 説明文の「管理者」＝GASの adminLabel（10/1 Naoto「管理者（名前）」に。🔴名前はここに書かない）
      '<p class="fresh">' + (ask ? '相手は「了解・難しい」で返事をして、終わったら「完了」を押します。誰がどう返事したかは、あなたと' + alabel(d) + 'が見られます。'
        : '回答は「賛成・反対・どちらでも」＋ひとこと。誰がどう答えたかは' + alabel(d) + 'だけが見られます（投稿した人にも見えません）。') + '</p>' +
      '<div class="sh-row"><button type="button" class="btn" id="sh-post"' + (st.busy ? ' disabled' : '') + '>投稿する</button><button type="button" class="link-btn" id="sh-cancel">やめる</button></div></div>';
  }

  // ── 投稿1件 ──
  function postCard(p, d) {
    var ans = p.target && !p.hidden, ask = p.type === 'お願い';
    var h = '<div class="card sh-post' + (p.hidden ? ' is-hidden' : '') + (p.target && !p.mine ? ' is-todo' : '') + '" data-pid="' + p.id + '">' +
      '<div class="sh-head"><span class="sh-kind' + (ask ? ' is-ask' : '') + '">' + p.type + '</span><b class="sh-title">' + u.esc(p.title) + '</b>' + (p.hidden ? '<span class="pill dim">非表示</span>' : '') + '</div>' +
      '<div class="sh-meta">' + u.esc(p.by) + '・' + when(p.at) + '<span class="sh-due' + (p.overdue ? ' is-over' : '') + '">' + dueTxt(p) + '</span></div>' +
      (p.body ? '<p class="sh-body">' + u.esc(p.body).replace(/\n/g, '<br>') + '</p>' : '') +
      '<div class="sh-count"><span class="num">' + (ask ? '返事 ' : '回答 ') + p.answered + '/' + p.n + '</span>' +
        (ask ? '<span class="num sh-done">完了 ' + (p.completed || 0) + '/' + p.n + '</span>' : '') +
        (p.answered < p.n ? '<small>まだ' + (ask ? '返事' : '答え') + 'ていない人がいます</small>' : '<small>全員が' + (ask ? '返事しました' : '答えました') + '</small>') + '</div>';
    if (ans) {
      var cur = p.mine ? p.mine.a : '';
      var editing = !p.mine || st.open[p.id];
      if (!editing) {
        h += '<div class="sh-mine">あなたの' + (ask ? '返事' : '回答') + '：<b class="' + acls(cur) + '">' + u.esc(cur) + '</b>' + (p.mine.c ? '<small>「' + u.esc(p.mine.c) + '」</small>' : '') +
          '<button type="button" class="link-btn" data-edit="' + p.id + '">変える</button></div>' +
          // お願いを了解した人＝終わったら「完了」（10/1 Naoto）
          (ask && cur === '了解' ? '<button type="button" class="btn sh-finish" data-ans="完了" data-pid="' + p.id + '">終わったら「完了」を押す</button>' : '');
      } else {
        // お願いの最初の返事は 了解・難しい（完了は了解のあと。すぐ終わったものは完了も押せる）
        var kinds = ask && !p.mine ? ['了解', '難しい', '完了'] : p.kinds;
        h += '<div class="sh-ans">' + kinds.map(function (a) {
          return '<button type="button" class="sh-ab ' + acls(a) + (cur === a ? ' is-on' : '') + '" data-ans="' + u.esc(a) + '" data-pid="' + p.id + '">' + (a === '了解' ? '了解しました' : a === '完了' && !p.mine ? 'もう完了' : a) + '</button>';
        }).join('') + '</div>' +
          '<input class="date-input sh-c" id="sh-c-' + p.id + '" maxlength="500" placeholder="' + (ask ? 'ひとこと（なくてもOK・お願いした人と' + alabel(d) + 'が見ます）' : 'ひとこと（なくてもOK・' + alabel(d) + 'だけが見ます）') + '" value="' + u.esc(p.mine ? p.mine.c : '') + '">' +
          (p.overdue ? '<p class="fresh">期限を過ぎていますが、まだ答えられます（締切後の印が付きます）。</p>' : '');
      }
    }
    h += detailBox(p, d);
    // 🆕10/1 削除（管理者＝全部／配信者＝自分の投稿だけ・プレビュー中は出さない）
    if ((d.admin || p.mineBy) && !d.preview) h += '<div class="sh-delrow"><button type="button" class="link-btn sh-del" data-del="post" data-id="' + p.id + '">削除</button></div>';
    return h + '</div>';
  }

  // 🔴内訳＝GASが管理者本人（お願いのときはお願いした本人も）にしか answers・tally・pending を返さない
  function detailBox(p, d) {
    if (!p.answers) return '';
    var ask = p.type === 'お願い';
    return '<div class="sh-admin"><div class="sh-admin-cap">' + (d.admin ? alabel(d) + 'だけ' : 'あなた（お願いした人）と' + alabel(d) + 'だけ') + '</div>' +
      '<div class="sh-tally">' + p.kinds.map(function (a) { return '<span class="' + acls(a) + '">' + a + ' ' + (p.tally[a] || 0) + '</span>'; }).join('') + '</div>' +
      (p.answers.length ? '<ul class="sh-list">' + p.answers.map(function (a) {
        return '<li><b>' + u.esc(a.who) + '</b><span class="' + acls(a.a) + '">' + u.esc(a.a) + '</span>' + (a.late ? '<small class="sh-late">締切後</small>' : '') +
          (a.c ? '<small class="sh-cm">「' + u.esc(a.c) + '」</small>' : '') + '</li>';
      }).join('') + '</ul>' : '') +
      (p.pending.length ? '<div class="sh-pend">' + (ask ? 'まだ返事なし：' : 'まだ：') + p.pending.map(u.esc).join('・') + '</div>' : '') +
      (d.admin ? '<div class="sh-row"><button type="button" class="link-btn" data-decide="' + p.id + '">決定にする</button>' +
        '<button type="button" class="link-btn" data-hide="' + p.id + '" data-on="' + (p.hidden ? '' : '1') + '">' + (p.hidden ? '表示に戻す' : '非表示にする') + '</button></div>' : '') + '</div>';
  }

  function decisionsBox(d) {
    var list = d.decisions.filter(function (x) { return st.showHidden || !x.hidden; });
    return '<div class="card sh-dec"><h3>決定事項</h3>' + (list.length ? '<ul class="sh-declist">' + list.map(function (x) {
      return '<li' + (x.hidden ? ' class="is-hidden"' : '') + '><p>' + u.esc(x.text).replace(/\n/g, '<br>') + '</p><small>' + when(x.at) + (x.postTitle ? '・「' + u.esc(x.postTitle) + '」から' : '') +
        (d.admin ? '・' + u.esc(x.by) + ' <button type="button" class="link-btn" data-hdec="' + x.id + '" data-on="' + (x.hidden ? '' : '1') + '">' + (x.hidden ? '戻す' : '非表示') + '</button> <button type="button" class="link-btn sh-del" data-del="decision" data-id="' + x.id + '">削除</button>' : '') + '</small></li>';
    }).join('') + '</ul>' : '<p class="sub">まだありません。</p>') +
      (d.admin ? '<button type="button" class="link-btn sh-decnew" data-decide="">＋ 決定事項を直接書く</button>' : '') + '</div>';
  }

  function requestsBox(d) {
    return '<div class="card sh-req"><h3>プログラマーへの要望</h3>' +
      // 🔄10/1 Naoto：例を3行で（&#10;＝入力欄の中の改行）
      '<textarea id="sh-req" class="date-input sh-ta" rows="4" maxlength="2000" placeholder="例：&#10;追加してほしいアプリの機能（自分だけ追加でも可）&#10;追加してほしいOBSの機能・的中演出&#10;アプリやOBSの不具合等"></textarea>' +
      '<div class="sh-row"><button type="button" class="btn" id="sh-reqsend"' + (st.busy ? ' disabled' : '') + '>要望を出す</button></div>' +
      (d.requests.length ? '<ul class="sh-reqlist">' + d.requests.map(function (r) {
        return '<li><div class="sh-reqhead"><span class="sh-st sh-st-' + d.reqStates.indexOf(r.state) + '">' + u.esc(r.state) + '</span><small>' + (d.admin ? u.esc(r.who) + '・' : '') + when(r.at) + '</small></div>' +
          '<p>' + u.esc(r.text).replace(/\n/g, '<br>') + '</p>' + (r.reply ? '<p class="sh-reply">返事：' + u.esc(r.reply) + '</p>' : '') +
          (d.admin ? '<div class="sh-row"><select class="date-input sh-rs" data-rid="' + r.id + '">' + d.reqStates.map(function (s) { return '<option' + (s === r.state ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
            '<button type="button" class="link-btn" data-reply="' + r.id + '">返事を書く</button></div>' : '') +
          // 🆕10/1 削除（配信者に返る要望は本人の分だけ＝出ているものは消してよい）
          (!d.preview ? '<div class="sh-delrow"><button type="button" class="link-btn sh-del" data-del="request" data-id="' + r.id + '">削除</button></div>' : '') + '</li>';
      }).join('') + '</ul>' : '') + '</div>';
  }

  function draw() {
    if (APP.current() !== 'share') return;
    var el = document.getElementById('view');
    var d = st.data;
    var head = '<div class="title-row"><h1 class="screen-title">共有</h1><span class="title-aside">' +
      '<button type="button" class="link-btn" id="sh-reload">' + (st.loading ? '読み込み中…' : '最新にする') + '</button></span></div>';
    if (!d) { el.innerHTML = head + '<p class="sub">' + (st.err ? 'つながりませんでした。「最新にする」を押してください。' : '読み込んでいます…') + '</p>'; bind(el); return; }
    var posts = d.posts.filter(function (p) { return st.showHidden || !p.hidden; });
    var todo = posts.filter(function (p) { return p.target && !p.mine && !p.hidden; });
    var rest = posts.filter(function (p) { return todo.indexOf(p) < 0; });
    el.innerHTML = head +
      (d.preview ? '<p class="fresh">プレビュー中は見るだけです（投稿・回答は管理者に戻してから）。</p>' : '') +
      form(d) +
      (todo.length ? '<div class="section-cap">回答してください（' + todo.length + '）</div>' + todo.map(function (p) { return postCard(p, d); }).join('') : '') +
      '<div class="section-cap">進行中</div>' + (rest.length ? rest.map(function (p) { return postCard(p, d); }).join('') : '<p class="sub">ありません。</p>') +
      (d.admin ? '<label class="sh-hidden-toggle"><input type="checkbox" id="sh-showhidden"' + (st.showHidden ? ' checked' : '') + '> 非表示にしたものも見る（管理者）</label>' : '') +
      decisionsBox(d) + requestsBox(d);
    bind(el);
  }

  function bind(el) {
    var q = function (s) { return el.querySelector(s); };
    var on = function (s, f) { var x = q(s); if (x) x.addEventListener('click', f); };
    on('#sh-reload', function () { load(); });
    on('#sh-new', function () { st.form = true; draw(); var t = q('#sh-title'); if (t) t.focus(); });
    on('#sh-cancel', function () { st.form = false; draw(); });
    // 種類の切り替え（書きかけの題・内容・期限は残す）
    el.querySelectorAll('[data-type]').forEach(function (b) {
      b.addEventListener('click', function () {
        var keep = { t: q('#sh-title').value, b: q('#sh-body').value, d: q('#sh-due').value };
        st.type = b.dataset.type; draw();
        q('#sh-title').value = keep.t; q('#sh-body').value = keep.b; q('#sh-due').value = keep.d;
      });
    });
    on('#sh-post', function () {
      var targets = [].map.call(el.querySelectorAll('input[name="sh-t"]:checked'), function (x) { return x.value; });
      send({ op: 'post', type: st.type, title: q('#sh-title').value, body: q('#sh-body').value, targets: targets, due: q('#sh-due').value }, '投稿しました')
        .then(function (ok) { if (ok) st.form = false; draw(); });
    });
    el.querySelectorAll('[data-ans]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.pid, c = q('#sh-c-' + id);
        send({ op: 'answer', id: id, a: b.dataset.ans, c: c ? c.value : undefined }, b.dataset.ans === '完了' ? '完了にしました' : '回答しました').then(function (ok) { if (ok) delete st.open[id]; });
      });
    });
    el.querySelectorAll('[data-edit]').forEach(function (b) { b.addEventListener('click', function () { st.open[b.dataset.edit] = 1; draw(); }); });
    el.querySelectorAll('[data-hide]').forEach(function (b) {
      b.addEventListener('click', function () { send({ op: 'hide', id: b.dataset.hide, on: !!b.dataset.on }, b.dataset.on ? '非表示にしました' : '表示に戻しました'); });
    });
    el.querySelectorAll('[data-decide]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = window.prompt(b.dataset.decide ? '決定事項（結論を一文で）' : '決定事項を書く（全員に見えます）');
        if (t && t.trim()) send({ op: 'decide', id: b.dataset.decide || '', text: t }, '決定事項に載せました');
      });
    });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.del;
        var msg = k === 'post' ? 'この投稿を削除します。みんなの回答も一緒に消えます（決定事項は残ります）。' : k === 'decision' ? 'この決定事項を削除します。' : 'この要望を削除します。';
        if (window.confirm(msg + '\n元に戻せません。削除しますか？')) send({ op: 'delete', kind: k, id: b.dataset.id }, '削除しました');
      });
    });
    el.querySelectorAll('[data-hdec]').forEach(function (b) {
      b.addEventListener('click', function () { send({ op: 'hideDecision', id: b.dataset.hdec, on: !!b.dataset.on }, '直しました'); });
    });
    on('#sh-reqsend', function () {
      var t = q('#sh-req').value;
      send({ op: 'request', text: t }, '要望を出しました');
    });
    el.querySelectorAll('.sh-rs').forEach(function (s) {
      s.addEventListener('change', function () { send({ op: 'reqState', id: s.dataset.rid, state: s.value }, '状態を変えました'); });
    });
    el.querySelectorAll('[data-reply]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = window.prompt('要望への返事（出した人に見えます）');
        if (t != null && t.trim()) send({ op: 'reqState', id: b.dataset.reply, reply: t }, '返事を書きました');
      });
    });
    var sh = q('#sh-showhidden');
    if (sh) sh.addEventListener('change', function () { st.showHidden = sh.checked; draw(); });
  }

  return {
    render: function () { if (!st.data && !st.loading) load(); else draw(); },
    // 起動時に1回読んで赤丸を出す（タブを開いていなくても）
    init: function () { load(true); },
    badge: badge
  };
})();
