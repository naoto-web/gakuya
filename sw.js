/* sw.js — プッシュ通知の受け口（2026-10-01）
   ・GAS（push.gs）は中身なしの「合図」だけ送る → ここで app=pushinbox から中身と数字を取って通知を出す
   ・接続先と鍵は、アプリの画面が Cache Storage（okl-cfg）に置いたものを読む（js/push.js）
   ・iPhoneは合図のたびに必ず通知を出す決まり＝取れなかったときも「新しいお知らせがあります」を出す
   ・通知を押す＝開いているアプリを前に出してそのタブへ／無ければ開く
   🔴鍵・名前はこのファイルに書かない（公開リポジトリ） */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

function cfg() {
  return caches.open('okl-cfg').then(function (c) { return c.match('cfg'); }).then(function (r) { return r ? r.json() : null; });
}

self.addEventListener('push', function (e) {
  e.waitUntil(cfg().then(function (c) {
    if (!c || !c.key) return { items: [] };
    return fetch(c.gas + '?app=pushinbox&k=' + encodeURIComponent(c.key) + '&cb=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); });
  }).catch(function () { return { items: [] }; }).then(function (j) {
    var jobs = [];
    // アイコンの数字（iPhone）。Androidは通知が残っている間だけ点が付く（数字は付けられない）
    if (j && typeof j.badge === 'number' && self.navigator.setAppBadge) {
      jobs.push((j.badge ? self.navigator.setAppBadge(j.badge) : self.navigator.clearAppBadge()).catch(function () {}));
    }
    var items = (j && j.ok && j.items && j.items.length) ? j.items : [{ id: 'okl', title: '俺競ライブ', body: '新しいお知らせがあります', tab: '' }];
    items.forEach(function (it) {
      jobs.push(self.registration.showNotification(it.title, { body: it.body, tag: it.id, icon: 'icons/icon-192.png', data: { tab: it.tab || '' } }));
    });
    return Promise.all(jobs);
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var tab = (e.notification.data || {}).tab || '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if ('focus' in list[i]) { list[i].postMessage({ okl: 'tab', tab: tab }); return list[i].focus(); }
    }
    return self.clients.openWindow('./' + (tab ? '#tab=' + tab : ''));
  }));
});
