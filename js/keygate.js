/* keygate.js — 鍵を画面から入れてもらう
   🔴なぜ要るか（選手DBでYのiPhoneで発覚した件と同じ）
     ホーム画面アプリは start_url（./）で起動する＝追加したときの ?k= が落ちる。
     iPhoneはSafariとホーム画面アプリで保存場所も別＝Safariで覚えた鍵が届かない。
   🔑届いたリンクをまるごと貼ってもよい。?k= / #k= / &k= も、鍵だけでも受ける。 */
var KEYGATE = (function () {
  function extract(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    var m = s.match(/[?#&]k=([^&#\s]+)/);
    if (m) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
    if (/^[A-Za-z0-9_-]{16,}$/.test(s)) return s;
    return '';
  }

  function show(msg) {
    var e = document.getElementById('kg-err');
    e.textContent = msg || '';
    e.hidden = !msg;
    document.getElementById('keygate').hidden = false;
  }

  function save() {
    var key = extract(document.getElementById('kg-inp').value);
    if (!key) { show('読み取れませんでした。届いたリンクを、はじめから終わりまで全部貼ってください。'); return; }
    try { localStorage.setItem(CONFIG.KEY_LS, key); } catch (e) {
      show('この端末に保存できません。プライベートブラウズを切って、もう一度お試しください。');
      return;
    }
    location.replace(location.pathname);
  }

  function bind() {
    document.getElementById('kg-go').addEventListener('click', save);
    document.getElementById('kg-inp').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); save(); }
    });
  }

  return { show: show, bind: bind };
})();
