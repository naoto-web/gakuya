/* shiftedit.js — 管理者がスマホでシフトを直す（9/29 Naoto「スマホでシフトをいじれるようにしたい」）
   ・保存先は今までの実運用シート。1枠ずつ、選んだその場で保存する
   ・押した瞬間に画面を先に書き換え、保存は裏で順番に送る（GASは1回2〜4秒かかるため）
   ・読み込んだ後にシートでそのマスが変わっていたら、GASが書かずに断る→最新を読み直して知らせる
   ・候補の判定はシートの🤖自動入力と同じ（同じ日の他の枠・休み希望「休」「撮影」・夜明け・上限・🏁今月確定）。
     候補外の人も理由つきの灰色で出し、もう一度押せば入れられる（シートのプルダウンが警告だけなのと同じ）
   ・画面は下から出る板（シート）＝配信者と同じ画面の並びを1pxも動かさない
   SHIFT から hook（今のデータ・色・描き直し・控えの保存）を受け取って動く */
var EDIT = (function () {
  var u = window.OKL.u;
  var SLOT = ['昼①', '昼②', '夜①', '夜②'];
  var WISH_RE = /休|撮影/;
  var AKI = '空き';
  var H = null;           // SHIFT からの hook
  var pending = 0;        // 保存待ちの数
  var chain = Promise.resolve();
  var armed = '';         // 候補外の人を1回押した＝もう一度押すと入れる

  function data() { return H.data(); }
  function rowOf(date) { return (data().rows || []).filter(function (r) { return r.date === date; })[0]; }
  function valOf(r, s) { return s < 2 ? r.day[s] : r.night[s - 2]; }
  function setVal(r, s, v) { if (s < 2) r.day[s] = v; else r.night[s - 2] = v; }

  // ── 候補外の理由（シートの🤖自動入力 canPut と同じ考え方） ──
  function reasons(date, s, name) {
    var d = data(), ctx = d.edit || {}, rows = d.rows, out = [];
    var i = rows.map(function (r) { return r.date; }).indexOf(date);
    var r = rows[i];
    if ((ctx.fin || []).indexOf(name) >= 0) out.push('🏁今月確定');
    for (var k = 0; k < 4; k++) {
      if (k === s || valOf(r, k) !== name) continue;
      out.push((k < 2) === (s < 2) ? SLOT[k] + 'に入っています' : '通し（' + (k < 2 ? '昼' : '夜') + 'にも入っています）');
    }
    var w = ((ctx.wish || {})[date] || {})[name];
    if (w && WISH_RE.test(w)) out.push('休み希望「' + w + '」');
    if (s < 2) {
      var pn = i === 0 ? (ctx.prevNight || []) : rows[i - 1].night;
      if (pn.indexOf(name) >= 0) out.push('夜明け（前日の夜）');
    } else if (rows[i + 1] && rows[i + 1].day.indexOf(name) >= 0) {
      out.push('夜明け（翌日の昼）');
    }
    var lim = H.limitOf(name);
    var n = countOf(name);
    if (valOf(r, s) === name) n--;
    if (lim && n >= lim) out.push('上限（' + n + '/' + lim + '）');
    return out;
  }
  function countOf(name) {
    var n = 0;
    data().rows.forEach(function (r) { r.day.concat(r.night).forEach(function (v) { if (v === name) n++; }); });
    return n;
  }
  // 休み希望に「休」「撮影」以外（例：ミッドのみ）が書いてある＝候補のままメモとして見せる
  function wishNote(date, name) {
    var w = (((data().edit || {}).wish || {})[date] || {})[name];
    return w && !WISH_RE.test(w) ? w : '';
  }

  // ── 下から出る板 ──
  function close() {
    armed = '';
    var b = document.querySelector('.sheet-back');
    if (b) b.remove();
  }
  function open(html, bindFn) {
    close();
    var back = document.createElement('div');
    back.className = 'sheet-back';
    back.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '</div>';
    back.addEventListener('click', function (e) { if (e.target === back || e.target.closest('[data-close]')) close(); });
    document.body.appendChild(back);
    bindFn(back.querySelector('.sheet'));
  }
  function head(title, sub) {
    return '<div class="sheet-head"><div><b class="sheet-title">' + title + '</b>' + (sub ? '<div class="sheet-sub">' + sub + '</div>' : '') + '</div>' +
      '<button type="button" class="link-btn" data-close>閉じる</button></div>';
  }
  function dateLabel(date) {
    return u.md(date) + (u.holidayOf(date) ? '・' + u.esc(u.holidayOf(date)) : '');
  }

  // ── 保存（順番に1本ずつ送る） ──
  function enqueue(fn, label) {
    pending++;
    H.render();
    chain = chain.then(fn).then(function (d) {
      pending--;
      H.saveCache(d);
      if (!pending) H.applyServer(d);   // 全部送り終えたらシートの中身で揃える（途中で揃えると先に押した分が一瞬戻って見える）
      H.render();
    }).catch(function (e) {
      pending--;
      if (e && e.code === 'conflict') {
        var c = e.data || {};
        APP.toast((c.slot || '') + 'はシートで先に「' + (c.current || '空欄') + '」に変わっていました。最新を表示します', true);
      } else {
        APP.toast(label + 'を保存できませんでした。最新を読み直します', true);
      }
      H.reload();
    });
  }

  // 1枠を書き換える
  function setSlot(date, s, value) {
    var r = rowOf(date);
    var expect = valOf(r, s);
    close();
    if (expect === value) return;
    var ym = data().ym;
    setVal(r, s, value);
    if (r.locked) r.locked[s] = false;   // 手で書き換えたのと同じ＝確定は外れる
    enqueue(function () { return API.setSlot(ym, date, s, value, expect); }, SLOT[s]);
  }

  function lockSlots(date, slots, on) {
    var r = rowOf(date);
    var expect = [0, 1, 2, 3].map(function (k) { return valOf(r, k); });
    slots = slots.filter(function (k) { return on ? expect[k] !== '' : true; });  // 空欄は確定しない（シートと同じ）
    close();
    if (!slots.length) return;
    var ym = data().ym;
    r.locked = r.locked || [false, false, false, false];
    slots.forEach(function (k) { r.locked[k] = on; });
    enqueue(function () { return API.lock(ym, date, slots, on, expect); }, on ? '確定' : '確定の解除');
  }

  // ── 枠を押したとき ──
  function openSlot(date, s) {
    var r = rowOf(date);
    var cur = valOf(r, s);
    var locked = r.locked && r.locked[s];
    var members = H.members();
    var ok = [], ng = [];
    members.forEach(function (m) {
      var why = reasons(date, s, m.name);
      (why.length ? ng : ok).push({ m: m, why: why });
    });
    function item(x, isNg) {
      var c = x.m.color || '#9aa0aa';
      var n = countOf(x.m.name), lim = x.m.limit;
      var note = isNg ? x.why.join('・') : wishNote(date, x.m.name);
      return '<button type="button" class="pick' + (isNg ? ' is-ng' : '') + (x.m.name === cur ? ' is-cur' : '') + '" data-pick="' + u.esc(x.m.name) + '" style="--mc:' + c + '">' +
        '<span class="pick-name">' + u.esc(x.m.name) + '</span>' +
        '<span class="pick-cnt num">' + n + (lim ? '/' + lim : '') + '</span>' +
        (note ? '<span class="pick-why">' + u.esc(note) + '</span>' : '') + '</button>';
    }
    var html = head(dateLabel(date) + '　' + SLOT[s], '今：' + (cur ? (cur === AKI ? '1人配信（空き）' : u.esc(cur)) : '未定') + (locked ? '　🔒確定中（替えると確定は外れます）' : '')) +
      '<div class="pick-grid">' + ok.map(function (x) { return item(x, false); }).join('') + '</div>' +
      (ng.length ? '<div class="pick-cap">候補外（押すと理由を確認→もう一度押すと入れます）</div><div class="pick-grid">' + ng.map(function (x) { return item(x, true); }).join('') + '</div>' : '') +
      '<div class="pick-row">' +
      '<button type="button" class="btn ghost btn-sm" data-pick="' + AKI + '">1人配信</button>' +
      '<button type="button" class="btn ghost btn-sm" data-pick="">空欄に戻す</button>' +
      (cur ? '<button type="button" class="btn ghost btn-sm" data-lock="' + (locked ? '0' : '1') + '">' + (locked ? '確定を外す' : '🔒確定にする') + '</button>' : '') +
      '</div>';
    open(html, function (el) {
      el.querySelectorAll('[data-pick]').forEach(function (b) {
        b.addEventListener('click', function () {
          var v = b.dataset.pick;
          if (b.classList.contains('is-ng') && armed !== v) {   // 候補外：1回目は念押し
            armed = v;
            el.querySelectorAll('.pick.is-armed').forEach(function (x) { x.classList.remove('is-armed'); });
            b.classList.add('is-armed');
            APP.toast(v + '：' + b.querySelector('.pick-why').textContent + '。もう一度押すと入れます');
            return;
          }
          setSlot(date, s, v);
        });
      });
      var lk = el.querySelector('[data-lock]');
      if (lk) lk.addEventListener('click', function () { lockSlots(date, [s], lk.dataset.lock === '1'); });
    });
  }

  // ── その日のメモ（グレード名など） ──
  function openMemo(date) {
    var r = rowOf(date);
    var cur = r.memo || '';
    var html = head(dateLabel(date) + '　メモ', '先頭にグレード名を書くと札になります（例：<b>松阪G3</b>・… → 昼G／<b>京王閣G3夜</b>・… → 夜G）') +
      '<textarea class="date-input memo-inp" rows="2">' + u.esc(cur) + '</textarea>' +
      '<div class="btn-row"><button type="button" class="btn ghost" data-close>やめる</button><button type="button" class="btn" id="memo-save">保存</button></div>';
    open(html, function (el) {
      var inp = el.querySelector('.memo-inp');
      el.querySelector('#memo-save').addEventListener('click', function () {
        var v = inp.value.trim();
        close();
        if (v === cur) return;
        var ym = data().ym;
        r.memo = v;
        enqueue(function () { return API.setMemo(ym, date, v, cur); }, 'メモ');
      });
    });
  }

  // ── 月まとめての操作（シートのPCメニューと同じ） ──
  var OPS = [
    { op: 'autofill', label: '🤖自動入力', desc: '空欄のうち、入れる人が1人しかいない枠を埋めます（確定にはしません）' },
    { op: 'sort', label: '🔃並び替え', desc: '各日の①②を設定シートの並び順にそろえます' },
    { op: 'reset', label: '🧹確定以外を消す', desc: '🔒確定していない名前を全部消します（あとで戻せます）', danger: true },
    { op: 'autofill_undo', label: '↩️直前の自動入力を戻す', desc: '自動で入れた枠のうち、まだそのままの枠を空欄に戻します', undo: 'autofill' },
    { op: 'reset_undo', label: '↩️直前のリセットを戻す', desc: '消した名前を、いま空欄の枠にだけ戻します', undo: 'reset' }
  ];
  function openMenu() {
    var d = data(), undo = (d.edit && d.edit.undo) || {};
    var list = OPS.filter(function (o) { return !o.undo || undo[o.undo]; });
    var html = head(u.monthLabel(d.ym) + 'をまとめて操作', '押すと確認が出ます') +
      '<div class="ops">' + list.map(function (o) {
        return '<button type="button" class="op' + (o.danger ? ' is-danger' : '') + '" data-op="' + o.op + '"><b>' + o.label + '</b><span>' + o.desc + '</span></button>';
      }).join('') + '</div>' +
      '<div class="op-confirm" hidden></div>';
    open(html, function (el) {
      var box = el.querySelector('.op-confirm');
      el.querySelectorAll('[data-op]').forEach(function (b) {
        b.addEventListener('click', function () {
          var o = OPS.filter(function (x) { return x.op === b.dataset.op; })[0];
          if (pending) { APP.toast('保存中です。終わってからもう一度押してください', true); return; }
          box.hidden = false;
          box.innerHTML = '<p><b>' + o.label + '</b>を' + u.monthLabel(d.ym) + 'に実行しますか？</p>' +
            '<div class="btn-row"><button type="button" class="btn ghost" id="op-no">やめる</button><button type="button" class="btn" id="op-yes">実行する</button></div>';
          box.querySelector('#op-no').addEventListener('click', function () { box.hidden = true; });
          box.querySelector('#op-yes').addEventListener('click', function () {
            var y = box.querySelector('#op-yes');
            y.disabled = true; y.textContent = '実行中…';
            API.bulk(d.ym, o.op).then(function (x) {
              close();
              H.saveCache(x);
              H.applyServer(x);
              H.render();
              var n = x.bulk ? x.bulk.count : 0;
              var DONE = { autofill: n + '枠を埋めました', sort: n + 'か所を入れ替えました', reset: n + '枠を消しました' };
              APP.toast(o.label + '：' + (DONE[o.op] || n + '枠を戻しました'));
            }).catch(function () {
              close();
              APP.toast(o.label + 'を実行できませんでした。最新を読み直します', true);
              H.reload();
            });
          });
        });
      });
    });
  }

  return {
    attach: function (hook) { H = hook; },
    // 編集できるのは管理者本人の鍵で開いているとき（プレビュー中は配信者と同じ＝見るだけ）
    can: function () { var d = H && H.data(); return !!(H && H.isAdmin() && d && d.edit && d.edit.editable); },
    pending: function () { return pending; },
    openSlot: openSlot,
    openMemo: openMemo,
    openMenu: openMenu,
    lockDay: function (date, on) { lockSlots(date, [0, 1, 2, 3], on); }
  };
})();
