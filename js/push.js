/* push.js — プッシュ通知（アイコンの赤丸）の端末側（2026-10-01 Yの要望・Naoto決定）
   ・［通知をオンにする］＝許可 → この端末を GAS に登録（app=pushsub）。受け口は sw.js
   ・iPhoneはホーム画面に追加したアプリから開いたときだけオンにできる（Appleの決まり）＝そうでなければ案内だけ
   ・アプリを開いた・戻ってきた・書き込んだ＝ app=pushseen（お知らせを既読にして、やることの数を返す）→ アイコンの数字（iPhone）
   ・出すのは me.push が真の人だけ（管理者／配信者はGASのスイッチ APP_PUSH_OPEN）。プレビュー中は出さない
   ・案内の場所＝ホームタブのカード＋シフトの上の1行（オンにするか×で閉じるまで） */
var PUSH = (function () {
  var me = null, reg = null, sub = null, timer = null;
  var HIDE_LS = 'gakuya:pushBarHidden';

  function supported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function standalone() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent); }
  function perm() { return 'Notification' in window ? Notification.permission : 'default'; }
  function on() { return !!sub && perm() === 'granted'; }
  function can() { return !!(me && me.push); }

  function post(app, body) {
    return fetch(CONFIG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ app: app, k: CONFIG.KEY }, body || {})) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) { var e = new Error((j && j.error) || 'error'); throw e; } return j; });
  }
  function b64ToU8(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    var raw = atob(s), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  // sw.js が合図を受けたときに使う接続先と鍵
  function saveCfg() {
    if (!('caches' in window)) return Promise.resolve();
    return caches.open('okl-cfg').then(function (c) {
      return c.put('cfg', new Response(JSON.stringify({ gas: CONFIG.GAS_URL, key: CONFIG.KEY }), { headers: { 'Content-Type': 'application/json' } }));
    }).catch(function () {});
  }
  function setBadge(n) {
    if (!navigator.setAppBadge) return;
    try { (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(function () {}); } catch (e) { /* 対応していない端末 */ }
  }

  function init(m) {
    me = m;
    if (!can() || !supported()) return;
    navigator.serviceWorker.register('sw.js').then(function (r) {
      reg = r;
      saveCfg();
      return r.pushManager.getSubscription();
    }).then(function (s) {
      sub = s;
      // 登録済みの端末＝GASにも念のため送り直す（鍵を変えた・GAS側で消えた場合に戻す。1日1回）
      if (sub && perm() === 'granted') {
        var day = new Date().toDateString(), k = 'gakuya:pushSync';
        var last = ''; try { last = localStorage.getItem(k) || ''; } catch (e) { /* なくても動く */ }
        if (last !== day) post('pushsub', { endpoint: sub.endpoint, ua: ua() }).then(function () { try { localStorage.setItem(k, day); } catch (e) { /* なくても動く */ } }).catch(function () {});
        refresh();
      }
      redraw();
    }).catch(function () {});
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.okl === 'tab' && e.data.tab) APP.go(e.data.tab);
    });
  }
  function ua() {
    var s = navigator.userAgent;
    return (/iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? 'Android' : /Windows/.test(s) ? 'Windows' : /Mac/.test(s) ? 'Mac' : 'その他') + (standalone() ? '・ホーム画面' : '・ブラウザ');
  }

  function enable() {
    if (!reg) { APP.toast('少し待ってからもう一度押してください', true); return; }
    Notification.requestPermission().then(function (p) {
      if (p !== 'granted') { APP.toast('通知が許可されませんでした（端末の設定で変えられます）', true); redraw(); return; }
      return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CONFIG.VAPID) }).then(function (s) {
        sub = s;
        return saveCfg().then(function () { return post('pushsub', { endpoint: s.endpoint, ua: ua() }); });
      }).then(function (j) {
        setBadge(j.badge);
        APP.toast('通知をオンにしました');
        redraw();
      });
    }).catch(function () { APP.toast('オンにできませんでした。もう一度お試しください', true); });
  }
  function disable() {
    if (!sub) return;
    var ep = sub.endpoint;
    sub.unsubscribe().catch(function () {}).then(function () {
      sub = null; setBadge(0);
      return post('pushunsub', { endpoint: ep }).catch(function () {});
    }).then(function () { APP.toast('この端末の通知をオフにしました'); redraw(); });
  }

  // アプリを開いた・戻ってきた・書き込んだ＝お知らせを既読にして数字を合わせる
  function refresh() {
    if (!on()) return;
    post('pushseen').then(function (j) { setBadge(j.badge); }).catch(function () {});
  }
  function soon() { clearTimeout(timer); timer = setTimeout(refresh, 2000); }

  // シフトの上の1行（オンにするか×で閉じるまで）
  function banner() {
    if (!can() || !supported() || on() || perm() === 'denied') return '';
    if (isIOS() && !standalone()) return '';
    var hidden = false; try { hidden = localStorage.getItem(HIDE_LS) === '1'; } catch (e) { /* なくても出す */ }
    if (hidden) return '';
    return '<div class="push-bar"><span>🔔 通知をオンにすると、相談・シフトの変更・締切のお知らせが届きます</span>' +
      '<button type="button" class="btn btn-sm" data-push-on>オンにする</button><button type="button" class="link-btn" data-push-x aria-label="閉じる">×</button></div>';
  }
  // ホームタブのカード
  function homeCard() {
    if (!can()) return '';
    var body;
    if (!supported() && isIOS() && !standalone()) {
      body = '<p>iPhoneは、Safariの共有ボタン（□↑）→「ホーム画面に追加」で追加したアプリから開くと、通知をオンにできます。</p>';
    } else if (!supported()) {
      body = '<p class="sub">この端末・ブラウザは通知に対応していません。</p>';
    } else if (perm() === 'denied') {
      body = '<p>通知が端末の設定で止まっています。端末の設定 → 通知 →「俺競ライブ」（またはブラウザ）で許可してください。</p>';
    } else if (on()) {
      body = '<p><span class="pill ok">オン</span> この端末に届きます。</p><button type="button" class="btn ghost btn-sm" data-push-off>この端末の通知をオフにする</button>';
    } else {
      body = '<p>相談・お願い、シフトの発表や変更、休み希望の締切などをお知らせします。' + (isIOS() ? 'アイコンにやることの数が出ます。' : '') + '</p><button type="button" class="btn" data-push-on>通知をオンにする</button>';
    }
    return '<div class="card push-card"><div class="pr-cap">🔔 通知</div>' + body + '</div>';
  }
  function redraw() {
    var t = APP.current();
    if (t === 'home' || t === 'shift') APP.go(t, true);
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-push-on]')) enable();
    else if (e.target.closest('[data-push-off]')) disable();
    else if (e.target.closest('[data-push-x]')) {
      try { localStorage.setItem(HIDE_LS, '1'); } catch (err) { /* 覚えられなくても閉じる */ }
      var bar = e.target.closest('.push-bar'); if (bar) bar.remove();
    }
  });

  return { init: init, refresh: refresh, soon: soon, banner: banner, homeCard: homeCard };
})();
