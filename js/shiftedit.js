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
    // 半休：この枠の2区分（昼＝モ・デ／夜＝ナ・ミ）が両方NGなら候補外。片方だけなら候補のまま注意書き（wishNote）
    var hi = u.wishInfo(w);
    if (hi && hi.k === 'half' && hi.ng && slotQ(s).every(function (q) { return hi.ng.indexOf(q) >= 0; })) out.push('半休（' + (s < 2 ? '昼' : '夜') + 'はNG）');
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
  function slotQ(s) { return s < 2 ? [0, 1] : [2, 3]; }
  // 半休でこの枠の片方だけNG（例：昼枠でモーニングだけNG）＝候補のまま注意書き。読めない書き込みはそのまま見せる
  function wishNote(date, name, s) {
    var w = (((data().edit || {}).wish || {})[date] || {})[name];
    var hi = u.wishInfo(w);
    if (!hi || hi.k !== 'half') return '';
    if (!hi.ng) return hi.raw;
    var hit = slotQ(s).filter(function (q) { return hi.ng.indexOf(q) >= 0; });
    return hit.length ? '半休：' + hit.map(function (q) { return u.Q4[q]; }).join('・') + 'NG' : '';
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
    // 半休の人の札＝この枠の出られる側だけ塗る（9/29 Naoto「詳細を押したときの名前バッジも」）。候補外（灰色）はそのまま
    function halfPick(name, c, isNg) {
      if (isNg) return '';
      var hi = u.wishInfo(wishOf(date, name));
      var hb = hi && hi.k === 'half' ? u.slotHalfBg(hi.ng, s < 2 ? '昼' : '夜', 'color-mix(in srgb, ' + c + ' 30%, #ffffff)') : '';
      return hb ? ';background:' + hb : '';
    }
    function item(x, isNg) {
      var c = x.m.color || '#9aa0aa';
      var n = countOf(x.m.name), lim = x.m.limit;
      var note = isNg ? x.why.join('・') : wishNote(date, x.m.name, s);
      return '<button type="button" class="pick' + (isNg ? ' is-ng' : '') + (x.m.name === cur ? ' is-cur' : '') + '" data-pick="' + u.esc(x.m.name) + '" style="--mc:' + c + halfPick(x.m.name, c, isNg) + '">' +
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

  // ── その日の休み希望（9/29 Naoto「アプリ側から休み希望を編集したい」） ──
  //   人ごとに［なし｜休｜半｜撮影］（🔄同日 Naoto「他→半・順番は休→半→撮影」）。押したらその場で保存（シフトの枠と同じ順番待ち）。
  //   半＝半休。1日を4分割（モーニング・デイ・ナイター・ミッド）して、出られない所を選んで「保存」。
  //     4つ全部NG＝「休」として書く／何も選ばず保存＝希望なし
  function wishOf(date, name) { return ((((data().edit || {}).wish) || {})[date] || {})[name] || ''; }
  function setWish(date, name, value) {
    var d = data();
    var expect = wishOf(date, name);
    if (expect === value) return;
    d.edit.wish = d.edit.wish || {};
    var w = d.edit.wish[date] = d.edit.wish[date] || {};
    if (value) w[name] = value; else delete w[name];
    if (!Object.keys(w).length) delete d.edit.wish[date];
    var ym = d.ym;
    enqueue(function () { return API.setWish(ym, date, name, value, expect); }, name + 'の休み希望');
  }
  function openWish(date, opt) {
    var editing = '';   // 半休を選んでいる人
    var pick = [];      // その人のNGの区分（0〜3）
    function body() {
      return head(dateLabel(date) + '　休み希望', '押すとその場で保存します。「休」「撮影」の人はシフトの候補外。半休は出られない所を選んで保存') +
        '<div class="wish-edit">' + H.members().map(function (m) {
          var v = wishOf(date, m.name);
          var info = u.wishInfo(v);
          var k = info ? info.k : 'none';
          var b = function (key, label) {
            return '<button type="button" data-wk="' + key + '" data-wn="' + u.esc(m.name) + '" aria-pressed="' + (k === key || (key === 'half' && editing === m.name)) + '" class="wk-btn wk-b-' + key + '">' + label + '</button>';
          };
          // 札は「半」だけ。中身（例：ミッドのみ可）は行の下に出す（札に書くと切れる）
          var halfLabel = '半';
          return '<div class="we-row"><span class="wa-who" style="--mc:' + (m.color || '#9aa0aa') + '">' + u.esc(m.name) + '</span>' +
            '<span class="seg we-seg">' + b('none', 'なし') + b('off', '休') + b('half', halfLabel) + b('shoot', '撮影') + '</span>' +
            (k === 'half' && editing !== m.name ? '<div class="we-say">' + u.esc(info.say) + '</div>' : '') +
            (editing === m.name ? '<div class="we-half"><span class="we-cap">出られない所を押す' +
              (pick.length ? '　→ <b>' + u.esc(pick.length === 4 ? '休（終日NG）' : u.halfSay(pick)) + '</b>' : '') + '</span><span class="we-q">' + u.Q4.map(function (q, i) {
              return '<button type="button" class="q-btn q-' + i + '" data-q="' + i + '" aria-pressed="' + (pick.indexOf(i) >= 0) + '">' + q + '</button>';
            }).join('') + '</span><button type="button" class="btn btn-sm" data-half-save="' + u.esc(m.name) + '">保存</button></div>' : '') + '</div>';
        }).join('') + '</div>' +
        (opt && opt.toShift ? '<button type="button" class="btn ghost" id="we-shift">この日のシフトを開く</button>' : '');
    }
    open(body(), function bindAll(el) {
      var redraw = function () { el.innerHTML = body(); bindAll(el); };
      el.querySelectorAll('[data-wk]').forEach(function (b) {
        b.addEventListener('click', function () {
          var n = b.dataset.wn, key = b.dataset.wk;
          if (key === 'half') {
            if (editing === n) { editing = ''; } else {
              editing = n;
              var hi = u.wishInfo(wishOf(date, n));
              pick = hi && hi.k === 'half' && hi.ng ? hi.ng.slice() : [];
            }
          } else { editing = ''; setWish(date, n, key === 'off' ? '休' : key === 'shoot' ? '撮影' : ''); }
          redraw();
        });
      });
      el.querySelectorAll('[data-q]').forEach(function (b) {
        b.addEventListener('click', function () {
          var q = +b.dataset.q, i = pick.indexOf(q);
          if (i >= 0) pick.splice(i, 1); else pick.push(q);
          redraw();
        });
      });
      var hs = el.querySelector('[data-half-save]');
      if (hs) hs.addEventListener('click', function () {
        setWish(date, hs.dataset.halfSave, pick.length === 4 ? '休' : u.wishText(pick));
        editing = ''; redraw();
      });
      var ts = el.querySelector('#we-shift');
      if (ts) ts.addEventListener('click', function () { close(); opt.toShift(); });
    });
  }

  // ── 月まとめての操作（シートのPCメニューと同じ） ──
  var OPS = [
    { op: 'fillnight', label: '🌙夜枠に一括入力', desc: '選んだ人を、休み希望の日以外の夜枠に全部入れます（空いている枠だけ・先に何日入るかを見せます）', pick: true, dry: true, where: '夜枠' },
    { op: 'fillday', label: '☀️昼枠に一括入力', desc: '選んだ人を、休み希望の日以外の昼枠に全部入れます（空いている枠だけ・先に何日入るかを見せます）', pick: true, dry: true, where: '昼枠' },
    { op: 'fillgradeday', label: '🏆グレード昼に一括入力', desc: 'メモにグレード名がある昼開催の日の昼枠に、選んだ人を入れます（休み希望の日以外・空いている枠だけ）', pick: true, dry: true, where: 'グレード昼の枠' },
    { op: 'fillgradenight', label: '🏆グレード夜に一括入力', desc: 'メモのグレード名が「夜」で終わる日（夜開催）の夜枠に、選んだ人を入れます（休み希望の日以外・空いている枠だけ）', pick: true, dry: true, where: 'グレード夜の枠' },
    // 9/29 Naoto「一括入力した人をまとめて確定させたい」＝人ごとにまとめて🔒
    { op: 'lockperson', label: '🔒この人の枠を全部確定', desc: '選んだ人がこの月に入っている枠を、全部🔒確定にします', pick: true },
    { op: 'unlockperson', label: '🔓この人の確定を全部外す', desc: '選んだ人の🔒確定を、この月の分だけ全部外します（名前は残ります）', pick: true },
    { op: 'autofill', label: '🤖自動入力', desc: '空欄のうち、入れる人が1人しかいない枠を埋めます（確定にはしません）' },
    { op: 'sort', label: '🔃並び替え', desc: '各日の①②を設定シートの並び順にそろえます' },
    { op: 'reset', label: '🧹確定以外を消す', desc: '🔒確定していない名前を全部消します（あとで戻せます）', danger: true },
    { op: 'reset_all', label: '💣全部消す（確定も）', desc: '🔒確定した枠も含めて、この月の名前を全部消します（メモと休み希望は残ります・あとで戻せます）', danger: true,
      warn: '🔒確定した枠も消えます。' },
    { op: 'reset_all_undo', label: '↩️直前の全部消すを戻す', desc: '消した名前と🔒確定を、いま空欄の枠にだけ戻します', undo: 'resetAll' },
    { op: 'autofill_undo', label: '↩️直前の自動入力を戻す', desc: '自動で入れた枠のうち、まだそのままの枠を空欄に戻します', undo: 'autofill' },
    { op: 'fill_undo', label: '↩️直前の一括入力を戻す', desc: '一括で入れた枠のうち、まだそのままの枠を空欄に戻します', undo: 'fill' },
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
      // 確認→実行（extra＝{ name } など）
      function ask(o, msg, extra) {
        box.hidden = false;
        box.innerHTML = '<p>' + msg + (o.warn ? '<br><b class="danger-note">' + o.warn + '</b>' : '') + '</p>' +
          '<div class="btn-row"><button type="button" class="btn ghost" id="op-no">やめる</button><button type="button" class="btn" id="op-yes">実行する</button></div>';
        box.scrollIntoView({ block: 'nearest' });
        box.querySelector('#op-no').addEventListener('click', function () { box.hidden = true; });
        box.querySelector('#op-yes').addEventListener('click', function () {
          var y = box.querySelector('#op-yes');
          y.disabled = true; y.textContent = '実行中…';
          API.bulk(d.ym, o.op, extra).then(function (x) {
            close();
            H.saveCache(x);
            H.applyServer(x);
            H.render();
            var n = x.bulk ? x.bulk.count : 0;
            var DONE = { autofill: n + '枠を埋めました', sort: n + 'か所を入れ替えました', reset: n + '枠を消しました', reset_all: n + '枠を消しました',
              fillnight: (extra && extra.name) + 'を' + n + '日入れました', fillday: (extra && extra.name) + 'を' + n + '日入れました', fillgradeday: (extra && extra.name) + 'を' + n + '日入れました', fillgradenight: (extra && extra.name) + 'を' + n + '日入れました',
              lockperson: (extra && extra.name) + 'の' + n + '枠を確定しました', unlockperson: (extra && extra.name) + 'の' + n + '枠の確定を外しました' };
            APP.toast(o.label + '：' + (DONE[o.op] || n + '枠を戻しました'));
          }).catch(function () {
            close();
            APP.toast(o.label + 'を実行できませんでした。最新を読み直します', true);
            H.reload();
          });
        });
      }
      // 🌙夜枠に一括入力：人を選ぶ→書かずに試算（何日入る・入れない日）→実行
      function pickPerson(o) {
        box.hidden = false;
        box.innerHTML = '<p><b>' + o.label + '</b>：入れる人を選んでください</p><div class="pick-grid">' + H.members().map(function (m) {
          return '<button type="button" class="pick" data-person="' + u.esc(m.name) + '" style="--mc:' + (m.color || '#9aa0aa') + '"><span class="pick-name">' + u.esc(m.name) + '</span></button>';
        }).join('') + '</div><div class="btn-row"><button type="button" class="btn ghost" id="op-no">やめる</button></div>';
        box.scrollIntoView({ block: 'nearest' });
        box.querySelector('#op-no').addEventListener('click', function () { box.hidden = true; });
        box.querySelectorAll('[data-person]').forEach(function (b) {
          b.addEventListener('click', function () {
            var name = b.dataset.person;
            if (!o.dry) {  // 確定・解除：数はここで数える（今の画面の中身＝押した分も含む）
              var on = o.op === 'lockperson', cnt = 0;
              d.rows.forEach(function (r) {
                r.day.concat(r.night).forEach(function (v, k) { if (v === name && !!(r.locked && r.locked[k]) !== on) cnt++; });
              });
              if (!cnt) { box.innerHTML = '<p>' + u.esc(name) + 'は' + (on ? '確定していない枠がありません' : '確定している枠がありません') + '</p>'; return; }
              ask(o, '<b>' + u.esc(name) + '</b>の' + u.monthLabel(d.ym) + 'の枠を<b>' + cnt + '枠</b>' + (on ? '🔒確定にします。' : '確定を外します。'), { name: name });
              return;
            }
            box.innerHTML = '<p>' + u.esc(name) + 'を入れたらどうなるか計算しています…</p>';
            API.bulk(d.ym, o.op, { name: name, dry: true }).then(function (x) {
              var r = (x.bulk && x.bulk.filled) || { count: 0, skip: {} };
              var sk = r.skip || {};
              var line = function (label, a) { return a && a.length ? '<br><small>' + label + '：' + a.join('・') + '日</small>' : ''; };
              ask(o, '<b>' + u.esc(name) + '</b>を' + u.monthLabel(d.ym) + 'の' + o.where + 'に<b>' + r.count + '日</b>入れます。' + (r.grade ? '<br><small>グレード開催：' + (r.grade.length ? r.grade.join('・') + '日' : 'この月にはありません（メモにグレード名がない）') + '</small>' : '') +
                line('入れない（休み希望）', sk.wish) + line('入れない（もう入っている）', sk.already) +
                line('入れない（夜が埋まっている）', sk.full) + line('入れない（夜明けになる）', sk.dawn), { name: name });
            }).catch(function () { box.innerHTML = '<p class="danger-note">計算できませんでした。閉じてもう一度お試しください</p>'; });
          });
        });
      }
      el.querySelectorAll('[data-op]').forEach(function (b) {
        b.addEventListener('click', function () {
          var o = OPS.filter(function (x) { return x.op === b.dataset.op; })[0];
          if (pending) { APP.toast('保存中です。終わってからもう一度押してください', true); return; }
          if (o.pick) { pickPerson(o); return; }
          ask(o, '<b>' + o.label + '</b>を' + u.monthLabel(d.ym) + 'に実行しますか？');
        });
      });
    });
  }

  // ── 💡次に決める枠（9/29 Naoto「次ここを決めた方がいいんじゃない？ってのを教えてくれるやつ」）──
  //   空いている枠ごとに「今入れられる人（候補外の理由がない人）」を数え、少ない順に並べる。
  //   同数なら Naoto の優先順位＝グレード開催の枠 ＞ 夜 ＞ 普段の昼、その次は日付の早い順
  function suggest() {
    var d = data();
    if (!d || !d.rows) return [];
    var out = [];
    d.rows.forEach(function (r) {
      for (var s = 0; s < 4; s++) {
        if (valOf(r, s) !== '') continue;
        var night = s >= 2;
        var grade = !!(r.grade && (r.grade.slot === '夜') === night);
        var cands = H.members().filter(function (m) { return !reasons(r.date, s, m.name).length; }).map(function (m) { return m.name; });
        out.push({ date: r.date, s: s, cands: cands, grade: grade, rank: grade ? 0 : night ? 1 : 2 });
      }
    });
    out.sort(function (a, b) { return (a.cands.length - b.cands.length) || (a.rank - b.rank) || (a.date < b.date ? -1 : a.date > b.date ? 1 : a.s - b.s); });
    return out;
  }
  function suggestLabel(x) {
    return u.md(x.date) + ' ' + SLOT[x.s] + (x.grade ? '（グレード）' : '');
  }
  function candText(x) {
    return x.cands.length ? '候補' + x.cands.length + '人（' + x.cands.map(u.esc).join('・') + '）' : '候補0人＝1人配信か候補外から';
  }
  // 管理者の帯の下の1行
  function suggestBar() {
    var list = suggest();
    if (!list.length) return '<div class="sg-bar is-done">✅ 空いている枠はありません</div>';
    var x = list[0];
    return '<div class="sg-bar' + (x.cands.length ? '' : ' is-zero') + '"><button type="button" class="sg-main" data-sg-date="' + x.date + '" data-sg-slot="' + x.s + '">' +
      '<b>💡次はここ</b> ' + suggestLabel(x) + '<small>' + candText(x) + '</small></button>' +
      '<button type="button" class="link-btn sg-more" id="sg-more">一覧</button></div>';
  }
  function openSuggest() {
    var list = suggest().slice(0, 10);
    var html = head('次に決める枠', '候補が少ない順（同じならグレード＞夜＞昼、日付順）。押すとその枠の候補が開きます') +
      '<div class="ops">' + list.map(function (x) {
        return '<button type="button" class="op' + (x.cands.length ? '' : ' is-danger') + '" data-sg-date="' + x.date + '" data-sg-slot="' + x.s + '"><b>' + suggestLabel(x) + '</b><span>' + candText(x) + '</span></button>';
      }).join('') + '</div>';
    open(html, function (el) {
      el.querySelectorAll('[data-sg-date]').forEach(function (b) {
        b.addEventListener('click', function () { openSlot(b.dataset.sgDate, +b.dataset.sgSlot); });
      });
    });
  }

  return {
    suggestBar: suggestBar,
    openSuggest: openSuggest,
    attach: function (hook) { H = hook; },
    // 編集できるのは管理者本人の鍵で開いているとき（プレビュー中は配信者と同じ＝見るだけ）
    can: function () { var d = H && H.data(); return !!(H && H.isAdmin() && d && d.edit && d.edit.editable); },
    pending: function () { return pending; },
    openSlot: openSlot,
    openMemo: openMemo,
    openMenu: openMenu,
    openWish: openWish,
    lockDay: function (date, on) { lockSlots(date, [0, 1, 2, 3], on); }
  };
})();
