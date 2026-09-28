/* config.js — 接続先と鍵
   鍵＝メンバーごとの合言葉。初回だけリンクの ?k= で受け取り、この端末に覚える。
   受け取ったらアドレス欄から k= を消す（画面を見せたり共有したときに鍵が漏れないように）。
   🔴鍵そのもの・名前はこのファイルに書かない（公開リポジトリ） */
var CONFIG = (function () {
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbxEWc0v-Sx1_V4nydvimVizpUdbGxpQlu0ZkH9vRFt3tNABeWhQVwaWEcXv0W-dKfqc/exec';
  var KEY_LS = 'gakuya:key';
  var key = '';
  var m = location.search.match(/[?&]k=([^&#]+)/) || location.hash.match(/[#&]k=([^&]+)/);
  if (m) {
    try { key = decodeURIComponent(m[1]); } catch (e) { key = m[1]; }
    try { localStorage.setItem(KEY_LS, key); } catch (e) { /* 保存できなくてもこの回は使える */ }
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* 古い端末はそのまま */ }
  } else {
    try { key = localStorage.getItem(KEY_LS) || ''; } catch (e) { key = ''; }
  }
  return { GAS_URL: GAS_URL, KEY_LS: KEY_LS, KEY: key };
})();
