/* api.js — GAS（シフト表GASの app.gs）との通信 */
var API = (function () {
  function qs(obj) {
    return Object.keys(obj).filter(function (k) { return obj[k] != null && obj[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); }).join('&');
  }

  function check(j) {
    if (!j || !j.ok) {
      var err = new Error((j && j.error) || 'error');
      err.code = j && j.error;
      err.data = j;  // 編集の食い違い（conflict）は今の中身 current を持って返ってくる
      throw err;
    }
    return j;
  }

  // 読み取り。GASはリダイレクトを返すので fetch の既定（follow）に任せる
  function get(app, params) {
    var p = Object.assign({}, params || {}, { app: app, k: CONFIG.KEY, as: CONFIG.AS, cb: Date.now() });
    return fetch(CONFIG.GAS_URL + '?' + qs(p), { method: 'GET', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(check);
  }

  // 書き込み。プリフライトを避けるため text/plain で送る
  function post(app, body) {
    var payload = Object.assign({}, body || {}, { app: app, k: CONFIG.KEY });
    return fetch(CONFIG.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).then(check);
  }

  return {
    me: function () { return get('me'); },
    shift: function (ym) { return get('shift', { ym: ym }); },
    publish: function (ym, on) { return post('publish', { ym: ym, on: on }); },
    // シフトの編集（管理者だけ）。expect＝画面で見ていた中身（シートで変わっていたら書かずに conflict）
    setSlot: function (ym, date, slot, value, expect) { return post('set', { ym: ym, date: date, slot: slot, value: value, expect: expect }); },
    setMemo: function (ym, date, value, expect) { return post('memo', { ym: ym, date: date, value: value, expect: expect }); },
    lock: function (ym, date, slots, on, expect) { return post('lock', { ym: ym, date: date, slots: slots, on: on, expect: expect }); },
    bulk: function (ym, op) { return post('bulk', { ym: ym, op: op }); }
  };
})();
