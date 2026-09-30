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
  //   🐢9/29 夕方：同じ呼び出しでも1秒のときと60秒超のときがバラバラに出た（シートを読まない呼び出しでも＝Google側の受け付けの遅れ）。
  //   ときどきHTMLのエラー（ドライブの「ページが見つかりません」）も返る。
  //   → 12秒たっても返らなければ同じ読み込みをもう1本送り、先に返った方を使う（読み取りだけ。保存は二重に送らない）
  //   → JSONでない返事（HTMLのエラー）は失敗として扱い、もう1本の方を待つ
  var HEDGE_MS = 12000;
  function once(url) {
    return fetch(url, { method: 'GET', cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var j;
        try { j = JSON.parse(t); } catch (e) { var err = new Error('not json'); err.code = 'net'; throw err; }
        return j;
      });
  }
  function get(app, params) {
    var p = Object.assign({}, params || {}, { app: app, k: CONFIG.KEY, as: CONFIG.AS });
    var base = CONFIG.GAS_URL + '?' + qs(p) + '&cb=';
    return new Promise(function (resolve, reject) {
      var done = false, fails = 0, started = 0, lastErr = null, timer = null;
      function fire() {
        started++;
        once(base + Date.now() + '-' + started).then(function (j) {
          if (done) return;
          done = true; clearTimeout(timer);
          try { resolve(check(j)); } catch (e) { reject(e); }   // GASが ok:false を返したらそのまま失敗（やり直さない）
        }).catch(function (e) {
          if (done) return;
          fails++; lastErr = e;
          if (started < 2) { clearTimeout(timer); fire(); }      // 1本目がすぐ失敗＝すぐ2本目
          else if (fails >= started) { done = true; reject(lastErr); }
        });
      }
      fire();
      timer = setTimeout(function () { if (!done && started < 2) fire(); }, HEDGE_MS);
    });
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
    sales: function (ym) { return get('sales', { ym: ym }); },   // 実績タブ（配信者は本人分だけ・sales.js）
    card: function (date, place) { return get('card', { date: date, place: place }); },             // 出走表（card.js）
    odds: function (date, place, race) { return get('odds', { date: date, place: place, race: race }); },  // 3連単オッズ（card.js）
    publish: function (ym, on) { return post('publish', { ym: ym, on: on }); },
    // 共有タブ（share.js・10/1）。書き込みには as を付ける＝プレビュー中はGASが断る
    share: function () { return get('share'); },
    shareDo: function (body) { return post('share', Object.assign({ as: CONFIG.AS }, body)); },
    // シフトの編集（管理者だけ）。expect＝画面で見ていた中身（シートで変わっていたら書かずに conflict）
    setSlot: function (ym, date, slot, value, expect) { return post('set', { ym: ym, date: date, slot: slot, value: value, expect: expect }); },
    setMemo: function (ym, date, value, expect) { return post('memo', { ym: ym, date: date, value: value, expect: expect }); },
    lock: function (ym, date, slots, on, expect) { return post('lock', { ym: ym, date: date, slots: slots, on: on, expect: expect }); },
    setWish: function (ym, date, name, value, expect) { return post('wish', { ym: ym, date: date, name: name, value: value, expect: expect }); },
    // extra＝{ name, dry }（夜枠に一括入力で使う）
    bulk: function (ym, op, extra) { return post('bulk', Object.assign({ ym: ym, op: op }, extra || {})); }
  };
})();
