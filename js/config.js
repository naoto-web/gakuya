/* config.js — 接続先と鍵
   鍵＝メンバーごとの合言葉。初回だけリンクの ?k= で受け取り、この端末に覚える。
   受け取ったらアドレス欄から k= を消す（画面を見せたり共有したときに鍵が漏れないように）。
   🔴鍵そのもの・名前はこのファイルに書かない（公開リポジトリ） */
var CONFIG = (function () {
  // 🔄9/30 アプリ専用GAS（OKLアプリAPI）へ引っ越し＝シフト表のGASが1〜50秒と遅かったため（中身は同じコード・同じシート）。
  //   前の窓口（シフト表のGAS）＝AKfycbxEWc0v-…（シートのメニュー・保守用に残してある）
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbxI5on7XK1yCEO60Y7DvHa8AwB1L8j1qgfhYQ7bzM3WXlC6DhIdrxSr-_KiPNd_gfDb/exec';
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
  // 管理者のプレビュー（「配信者として見る」）で選んだ人。GASは管理者の鍵のときだけこれを聞く
  var AS_LS = 'gakuya:as';
  var as = '';
  try { as = localStorage.getItem(AS_LS) || ''; } catch (e) { as = ''; }
  // 🆕10/1 プッシュ通知の公開鍵（VAPID・公開してよい方）。秘密鍵はGASのスクリプトプロパティだけ
  var VAPID = 'BIRDm5Ztskw7FAPJKhGhnpERA_SE3rg4isYfF9ib-4xkh5Ck7aSLAhcIy4-F_VSsMMaAd3ZjmXwggUKUTSaUF1g';
  return { GAS_URL: GAS_URL, KEY_LS: KEY_LS, KEY: key, AS_LS: AS_LS, AS: as, VAPID: VAPID };
})();
