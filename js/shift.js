/* shift.js — シフト（本物のシフト表を読む）
   ・月カレンダー。マスには「自分（管理者は強調する人）の枠」だけ、全員はタップした日の詳細で見る
   ・配信者＝管理者が公開した月だけ（GASが公開済みの月しか返さない）
   ・管理者＝全月＋「配信者に公開する／やめる」＋メモ全文と🔒確定の印
   ・シートの空欄＝「未定」、シートに「空き」＝その枠は人を入れない（1人配信など） */
var SHIFT = (function () {
  var u = window.OKL.u;
  // 🔑編集の部品（shiftedit.js）が無くても見るだけで動く＝index.html は10分キャッシュなので、
  //   古い index.html（shiftedit.js を読まない）＋新しい shift.js の組み合わせが最大10分ありうる
  var EDIT = window.EDIT || { attach: function () {}, can: function () { return false; }, pending: function () { return 0; } };
  var st = { me: null, data: null, ym: null, sel: null, focus: '', loading: false, err: '', confirm: false, fetchedAt: null, mode: 'me' };
  // 個人／全体は端末に覚える（開き直しても前の表示で出る）
  try { if (localStorage.getItem('gakuya:mode') === 'all') st.mode = 'all'; } catch (e) { /* 覚えられなくても動く */ }

  function isAdmin() { return st.me && st.me.role === 'admin'; }
  function target() { return isAdmin() ? st.focus : st.me.name; }
  function limitOf(name) {
    var m = (st.me.members || []).filter(function (x) { return x.name === name; })[0];
    return m ? m.limit : null;
  }

  // ── 月ごとの控え（9/29 Naoto「月を変えたときの読み込み時間が長い」）──
  //   GASへの問い合わせは1回2〜4秒かかる。①一度読んだ月は控え（メモリ＋端末）をすぐ出して、裏で最新を読み直す
  //   ②最初に読めたら、表示する月（前月〜）を先に全部読んでおく＝切り替えた瞬間に出る。
  //   控えは「鍵の頭6文字＋プレビュー中の人」ごと＝管理者の中身が配信者の画面に混ざらない。「〇時点」は控えの時刻
  var mem = {};
  var LS = 'gakuya:shift:';
  function who() { return (CONFIG.KEY || '').slice(0, 6) + ':' + (CONFIG.AS || ''); }
  function saveCache(d, at) {
    if (!d || !d.ym) return;
    mem[d.ym] = { d: d, at: at };
    try {
      localStorage.setItem(LS + who() + ':' + d.ym, JSON.stringify({ d: d, at: at.getTime() }));
    } catch (e) { /* 端末に置けなくてもメモリの控えは効く */ }
  }
  function readCache(ym) {
    if (!ym) { try { ym = localStorage.getItem(LS + who() + ':last'); } catch (e) { ym = null; } }
    if (!ym) return null;
    if (mem[ym]) return mem[ym];
    try {
      var j = JSON.parse(localStorage.getItem(LS + who() + ':' + ym) || 'null');
      if (j && j.d) return (mem[ym] = { d: j.d, at: new Date(j.at) });
    } catch (e) { /* 壊れた控えは無視 */ }
    return null;
  }
  // 🔑最後に表示した月＝apply のときだけ覚える（9/29 Naoto「10月を操作してて更新したら9月に戻る」＝
  //   以前は控えを置くたびに覚えていたので、裏の先読みで別の月に上書きされ、開き直しはGASの既定＝今月を読んでいた）
  function apply(d, at) {
    st.data = d; st.ym = d.ym; st.fetchedAt = at; st.confirm = false;
    try { localStorage.setItem(LS + who() + ':last', d.ym); } catch (e) { /* 覚えられなくても表示はできる */ }
    if (!st.sel || u.ymOf(st.sel) !== d.ym) st.sel = d.ym && d.today && u.ymOf(d.today) === d.ym ? d.today : (d.rows[0] && d.rows[0].date);
  }
  var prefetched = false;
  function prefetch(d) {
    if (prefetched || !d || !d.months) return;
    prefetched = true;
    var from = u.addMonth(u.ymOf(d.today || u.ymd(new Date())), -1);
    d.months.forEach(function (m) {
      if (m.ym < from || m.ym === d.ym) return;
      API.shift(m.ym).then(function (x) { saveCache(x, new Date()); }).catch(function () { /* 先読みの失敗は無視 */ });
    });
  }

  function load(ym) {
    st.want = ym || null;
    var c = readCache(ym);
    if (c) apply(c.d, c.at);          // 控えがあれば先に出す
    st.loading = true; st.err = '';
    SHIFT.render();
    return API.shift(ym).then(function (d) {
      var at = new Date();
      saveCache(d, at);
      // 待っている間に別の月へ移っていたら上書きしない／編集の保存待ちがある間も上書きしない（先に押した分が戻って見えるため）
      if ((!st.want || st.want === d.ym) && !EDIT.pending()) apply(d, at);
      prefetch(d);
    }).catch(function (e) {
      if (!st.data || (st.want && st.ym !== st.want)) {
        st.err = e.code === 'not published' ? 'この月のシフトは作成中です' : '読み込めませんでした。電波のよいところで「最新にする」を押してください';
        if (st.want && st.ym !== st.want) st.data = null;
      } else {
        APP.toast('最新を読めませんでした。' + u.pad(st.fetchedAt.getHours()) + ':' + u.pad(st.fetchedAt.getMinutes()) + '時点を表示しています', true);
      }
    }).then(function () { st.loading = false; SHIFT.render(); });
  }

  // メンバーカラー（GASが名前と一緒に返す。コードには対応表を書かない）
  function colorOf(name) {
    var m = (st.me.members || []).filter(function (x) { return x.name === name; })[0];
    return m && m.color ? m.color : null;
  }
  // 塗りの上の字の色：明るい色（黄など）は黒字、それ以外は白字
  function inkOn(hex) { return u.inkOn(hex); }
  // 半休の人の札＝出られる側だけメンバーカラー・出られない側は薄く（9/29 Naoto「相方から見たときに名前バッジも右半分だけ色塗る（左半分は薄く）」）
  //   昼の枠＝左モーニング｜右デイ／夜の枠＝左ナイター｜右ミッド。中身はGASの half（その日に入っている人の半休のNG区分だけ）
  //   塗りが半分になると白字が薄い側で読めない＝字は黒系に
  // 詳細の名前の札（9/30 Naoto「日を押したときの詳細の名前のバッジは上の薄いやつと同じものを」＝配信者・管理者共通）
  //   自分（管理者は強調中の人）＝塗りつぶし（一覧の自分の札と同じ・黒い縁は .is-me）／ほかの人＝薄い札（pcStyle）
  //   半休＝出られる側だけ色（自分＝塗り｜22%・ほか＝30%｜白地に斜線）
  function paintStyle(name, date, slot, me) {
    var c = colorOf(name);
    if (!name || !c) return colorStyle(name);
    if (name !== me) return pcStyle(name, date, slot);
    var ng = st.data && st.data.half && st.data.half[date] && st.data.half[date][name];
    var hb = u.slotHalfBg(ng, slot, c, 'color-mix(in srgb, ' + c + ' 22%, #ffffff)');
    return ' style="background:' + (hb || c) + ';color:' + (hb ? '#23252a' : inkOn(c)) + '"';
  }
  // カレンダーのマスの中の相方の札＝薄く（9/29 Naoto「相方の名前バッジは薄く」）＝メンバーカラー18%の地＋色の枠＋黒系の字。
  //   半休＝出られる側だけ30%・出られない側は白地に斜線（util.slotHalfBg）
  function pcStyle(name, date, slot) {
    var c = colorOf(name);
    if (!c) return '';
    var ng = st.data && st.data.half && st.data.half[date] && st.data.half[date][name];
    var hb = u.slotHalfBg(ng, slot, 'color-mix(in srgb, ' + c + ' 30%, #ffffff)', '');
    return ' style="background:' + (hb || 'color-mix(in srgb, ' + c + ' 18%, #ffffff)') + ';color:#23252a;box-shadow:inset 0 0 0 1px ' + c + '"';
  }
  function colorStyle(name) {
    var c = colorOf(name);
    return c ? ' style="background:' + c + ';color:' + inkOn(c) + '"' : '';
  }

  // edit＝{ date, slot }：管理者の編集中は押せる札（button）にする。見た目は同じ
  function chip(name, me, locked, edit, paint) {
    locked = locked && editOn();  // 🔒は［✎編集］がオンのときだけ（9/30 Naoto「編集モードじゃない時はカギ不要」）
    var tag = edit ? 'button type="button" data-edit-date="' + edit.date + '" data-edit-slot="' + edit.slot + '"' : 'span';
    var end = edit ? '</button>' : '</span>';
    var ed = (edit ? ' is-edit' : '') + (locked && editOn() ? ' is-locked' : '') + (!name && editOn() ? ' is-todo' : '');
    if (!name) return '<' + tag + ' class="name is-empty' + ed + '">未定' + end;
    if (name === '空き') return '<' + tag + ' class="name is-solo' + ed + '">' + (locked ? '🔒' : '') + '1人配信' + end;  // 「空き」＝その枠は1人配信（9/29 Naoto「もっと一人配信って分かるように」）
    return '<' + tag + ' class="name mc' + (name === me ? ' is-me' : '') + ed + '"' + (paint || colorStyle(name)) + '>' + (locked ? '<span class="lock" aria-label="確定">🔒</span>' : '') + u.esc(name) + end;
  }

  // その日の自分の枠（昼／夜／通し）。通し＝昼にも夜にも入っている日（9/30 Naoto：通しで入る人がいる）
  function mySlot(r, me) {
    if (!me) return null;
    if (r.day.indexOf(me) >= 0 && r.night.indexOf(me) >= 0) return '通し';
    if (r.day.indexOf(me) >= 0) return '昼';
    if (r.night.indexOf(me) >= 0) return '夜';
    return null;
  }
  // 相方（同じ枠のもう1人）。空欄＝未定、「空き」＝1人配信
  function partnerOf(r, me, slot) {
    var pair = slot === '昼' ? r.day : r.night;
    var other = pair.filter(function (x, i) { return !(x === me && pair.indexOf(me) === i); })[0];
    if (other === undefined || other === '') return { label: '未定', cls: 'is-empty' };
    if (other === '空き') return { label: '1人', cls: 'is-solo' };
    return { label: other, name: other };
  }

  // マスの下半分。自分の出勤日＝相方の名前（メンバーカラー）／管理者で強調なし＝未定の数
  function cellBody(r, me, slot) {
    if (me) {
      // 撮影の日＝紫の「撮影」バッジ（9/30 Naoto）。出どころ＝休み希望の「撮影」（配信者は本人の分・管理者は強調中の人）
      var shoot = /撮影/.test(wishFor(r.date, me)) ? '<span class="sb-shoot">撮影</span>' : '';
      // 🔄10/1 休み希望（休・半）もマスに出す＝出番の無い日（未公開の月・休みを出した日）に「休」「半」
      var wi = u.wishInfo(wishFor(r.date, me));
      //   🔄10/1 Naoto「シフトが確定したあとは『出』『休』バッジは非表示」＝配信者は公開した月（受付中を除く）では出さない
      var hideW = !isAdmin() && st.data.published && !(st.data.wish && st.data.wish.open);
      var wmark = wi && wi.k !== 'shoot' && !hideW ? '<b class="wm-mark wm-' + wi.k + '">' + (wi.k === 'off' ? '休' : wi.k === 'want' ? '出' : '半') + '</b>' : '';
      if (!slot) return shoot || wmark;
      // 通し＝相方を上＝昼・下＝夜の2段で（マスも上下で昼の黄／夜の藍・9/30 Naoto「上下2分割」）
      if (slot === '通し') {
        var pd = partnerOf(r, me, '昼'), pn = partnerOf(r, me, '夜');
        return '<span class="pc-2">' +
          '<span class="pc ' + (pd.cls || '') + '"' + (pd.name ? pcStyle(pd.name, r.date, '昼') : '') + '>' + u.esc(pd.label) + '</span>' +
          '<span class="pc ' + (pn.cls || '') + '"' + (pn.name ? pcStyle(pn.name, r.date, '夜') : '') + '>' + u.esc(pn.label) + '</span></span>' + shoot;
      }
      var p = partnerOf(r, me, slot);
      return '<span class="pc ' + (p.cls || '') + '"' + (p.name ? pcStyle(p.name, r.date, slot) : '') + '>' + u.esc(p.label) + '</span>' + shoot;
    }
    if (isAdmin()) return quad(r);  // 管理者で強調なし＝その日の4人を頭文字で
    var open = r.day.concat(r.night).filter(function (x) { return x === ''; }).length;
    return open ? '<span class="sm aki">未定' + open + '</span>' : '';
  }

  // 管理者の個人カレンダー（強調なし）：上の行＝昼の2人・下の行＝夜の2人を頭の1文字で（9/29 Naoto A案）
  //   頭文字は6人とも別（名前は設定シートから来る＝コードに書かない）。メンバーカラーの薄い地＋枠（全体の一覧と同じ見た目）
  //   未定＝「・」（編集オンのときはピンク）／1人配信＝灰色の「—」／半休＝出られる側だけ塗る／編集オンで🔒確定は灰色
  function quad(r) {
    function one(n, i, slot) {
      if (!n) return '<i class="qi is-open' + (editOn() ? ' is-todo' : '') + '">・</i>';
      if (n === '空き') return '<i class="qi is-solo">—</i>';
      var c = colorOf(n) || '#9aa0aa';
      var ng = st.data.half && st.data.half[r.date] && st.data.half[r.date][n];
      var hb = u.slotHalfBg(ng, slot, 'color-mix(in srgb, ' + c + ' 30%, #ffffff)', '');
      return '<i class="qi' + (lockOf(r, i) ? ' is-locked' : '') + '" style="--mc:' + c + (hb ? ';background:' + hb : '') + '" title="' + u.esc(n) + '">' + u.esc(Array.from(n)[0]) + '</i>';
    }
    return '<span class="qd">' + one(r.day[0], 0, '昼') + one(r.day[1], 1, '昼') + one(r.night[0], 2, '夜') + one(r.night[1], 3, '夜') + '</span>';
  }
  // 強調なしの撮影の印（9/30 Naoto「強調なしでも撮影の日に印」）＝日付の横に紫の「撮」1文字
  //   マスの下半分は4人の頭文字で埋まっているので、上の行（日付とグレード札の間）に置く＝マスの高さを変えない
  //   頭文字まで入れるとグレード札を押し出すので、誰が撮影かは日付を押した詳細に出す（shootLine）
  function shooters(date) {
    var w = (((st.data.edit || {}).wish || {})[date]) || {};
    return (st.me.members || []).map(function (m) { return m.name; }).filter(function (n) { return /撮影/.test(w[n] || ''); });
  }
  function shootMark(r) {
    var names = shooters(r.date);
    return names.length ? '<span class="sb-shoot sb-q" title="撮影：' + names.map(u.esc).join('・') + '">撮</span>' : '';
  }
  function shootLine(date) {
    var names = shooters(date);
    return names.length ? '<div class="shoot-line"><span class="sb-shoot">撮影</span>' + names.map(u.esc).join('・') + '</div>' : '';
  }

  // グレードの札：昼開催＝「昼G」（金地）／夜開催＝「夜G」（紺地に金字）（9/29 Naoto「夜グレードと昼グレードが分かりづらい」）
  // 🔄10/1 昼G・夜Gは開催カレンダーから（GAS）。昼と夜の両方にグレードがある日は grade2 もある＝札1つで「昼夜G」（マスが狭いため）
  function gradeBadge(g, g2) {
    if (!g) return '';
    if (g2) return '<span class="gb gb-both">昼夜G</span>';
    return '<span class="gb ' + (g.slot === '夜' ? 'gb-night' : 'gb-day') + '">' + g.slot + 'G</span>';
  }
  // その時間帯（昼／夜）のグレード。通し＝両方
  function gradeAt(r, slot) {
    if (slot === '通し') return gradeBadge(r.grade, r.grade2);
    return gradeBadge([r.grade, r.grade2].filter(function (x) { return x && x.slot === slot; })[0]);
  }

  // 日付の色：日曜・祝日＝赤（sun）／土曜＝青（sat）。祝日が土曜なら赤を優先（9/29 Naoto）
  function dayClass(date) {
    var dw = u.dow(date);
    if (dw === 0 || u.holidayOf(date)) return 'sun';
    return dw === 6 ? 'sat' : '';
  }

  // 🔑月曜始まり（9/29 Naoto）。u.dow は日曜=0 なので (曜日+6)%7 で月曜=0 に直す
  var HEAD = ['月', '火', '水', '木', '金', '土', '日'];
  // 全体モードのマス：上＝昼・下＝夜の2段に、入っている人をメンバーカラーの四角で（9/29 Naoto「全体」のたたき台）
  //   空き＝1人配信（灰の斜線）／空欄＝未定（点線）／自分（管理者は強調中の人）は黒縁
  function blocks(r, me) {
    function row(pair, cls) {
      return '<span class="blk-row ' + cls + '">' + pair.map(function (n) {
        if (!n) return '<i class="blk is-open"></i>';
        if (n === '空き') return '<i class="blk is-solo"></i>';
        return '<i class="blk' + (n === me ? ' is-me' : '') + '" style="background:' + (colorOf(n) || '#9aa0aa') + '"></i>';
      }).join('') + '</span>';
    }
    return row(r.day, 'blk-day') + row(r.night, 'blk-night');
  }

  // 全体＝1日1行の縦一覧。左＝日付（土青・日祝赤・グレード札）／昼の2人／夜の2人（メンバーカラーの札）
  //   行を押すと、その行のすぐ下に詳細（場の札など）が開く＝一覧の下に出すと画面の外になるため
  // k＝枠の番号（0〜3）を渡すと編集モードの札（押すとその枠を直す板）になる＝見た目は同じ（9/29 Naoto「全体に編集モード」）
  // 🔒確定の札は灰色で薄く・未定は目立たせる（9/29 Naoto「確定した人がグレーアウトして、未定のところが目立つように」）＝管理者の画面だけ
  //   （確定の有無は管理者にしか返らない。未定の強調も組む人のためのもの）
  //   🔄同日「編集モードを外してもグレーのまま」＝全体の［✎編集］がオンのときだけ（editOn）
  function editOn() { return !!(isAdmin() && st.editAll); }
  function lockOf(r, i) { return !!(editOn() && r.locked && r.locked[i]); }
  function listChip(n, me, date, slot, k, locked) {
    var ed = k != null;
    var extra = (locked ? ' is-locked' : '') + (!n && editOn() ? ' is-todo' : '');
    var open = (ed ? '<button type="button" data-edit-date="' + date + '" data-edit-slot="' + k + '" class="lc is-edit' : '<span class="lc') + extra;
    var close = ed ? '</button>' : '</span>';
    if (!n) return open + ' is-empty">未定' + close;
    if (n === '空き') return open + ' is-solo">1人配信' + close;
    // 🔄9/29 Naoto「目がちかちかする」＝塗りつぶしをやめ、メンバーカラーは薄い地＋左の帯だけ（字は黒系）
    //   🔄同日「左の帯いらない・名前の枠は付けて・自分以外は薄塗り」＝全員に色の枠／自分だけ塗りつぶし（字は白か黒）
    var c = colorOf(n) || '#9aa0aa';
    // 半休＝出られる側だけ塗る（9/29 Naoto「全体の一覧も同様に」）。自分＝塗りつぶし｜22%／他の人＝15%｜白地に斜線
    var ng = st.data && st.data.half && st.data.half[date] && st.data.half[date][n];
    var hb = u.slotHalfBg(ng, slot, n === me ? c : 'color-mix(in srgb, ' + c + ' 15%, #ffffff)', n === me ? 'color-mix(in srgb, ' + c + ' 22%, #ffffff)' : '');
    return open + (n === me ? ' is-me' : '') + '" style="--mc:' + c + ';--ink:' + inkOn(c) + (hb ? ';background:' + hb + ';color:#23252a' : '') + '">' + u.esc(n) + close;
  }
  // 全体の一覧の昼・夜の2人＝メンバーの並び順（GASの APP_ORDER＝9/29 Naoto の指定順）で表示。1人配信→未定は後ろ
  //   並べ替えは見た目だけ＝編集の札は元の枠（①②）の番号を持ったまま
  function pairChips(r, slot, me, K) {
    var base = slot === '昼' ? 0 : 2, pair = slot === '昼' ? r.day : r.night;
    var names = (st.me.members || []).map(function (m) { return m.name; });
    var rank = function (n) { if (n === '') return 99; if (n === '空き') return 98; var i = names.indexOf(n); return i < 0 ? 97 : i; };
    // 🔄9/29 Naoto「人を選んで見るとき、選んだ人のバッジが昼なら右側、夜なら左側」＝管理者が強調中のとき（真ん中に寄って昼夜が縦にそろう）
    //   🔄9/30 配信者の画面も（全体では自分が強調されているのと同じ＝自分の札を真ん中へ）
    var pin = me ? function (n) { return n === me ? (slot === '昼' ? 1 : -1) : 0; } : function () { return 0; };
    return [0, 1].map(function (j) { return { n: pair[j], k: base + j }; })
      .sort(function (a, b) { return (pin(a.n) - pin(b.n)) || (rank(a.n) - rank(b.n)) || (a.k - b.k); })
      .map(function (x) { return listChip(x.n, me, r.date, slot, K ? K(x.k) : null, lockOf(r, x.k)); }).join('');
  }
  function dayList(rows, me, today) {
    return '<div class="card dl-card"' + (me && colorOf(me) ? ' style="--sel:' + colorOf(me) + '"' : '') + '>' +
      // 管理者だけ：左上に［✎編集］。編集中は名前の札を押すとその枠を直す板・日付を押すと詳細（9/29 Naoto）
      '<div class="dl-head">' + (EDIT.can() ? '<button type="button" class="btn ghost btn-xs dl-edit" id="all-edit" aria-pressed="' + !!st.editAll + '">' + (st.editAll ? '✓編集中' : '✎編集') + '</button>' : '<span></span>') +
      '<span class="lg lg-day">昼</span><span class="lg lg-night">夜</span></div>' +
      rows.map(function (r) {
        var open = r.date === st.selAll;  // 全体で開いた行は個人のカレンダーの選択とは別（開いたときは全部閉じた状態・9/29 Naoto）
        var dw = u.dow(r.date);
        var ed = st.editAll && EDIT.can();
        var K = function (k) { return ed ? k : null; };
        if (ed) {  // 編集中：行全体はボタンにしない（中の札がボタン）。日付だけが詳細の開閉
          return '<div class="dl-row is-editing' + (r.date === today ? ' is-today' : '') + (open ? ' is-open' : '') + '">' +
            '<button type="button" class="dl-date dl-open" data-open-date="' + r.date + '" aria-expanded="' + open + '"><span class="dl-d num ' + dayClass(r.date) + '">' + Number(r.date.slice(8)) + '</span><span class="dl-w ' + dayClass(r.date) + '">' + u.DOW[dw] + '</span>' +
            gradeBadge(r.grade, r.grade2) + '</button>' +
            '<span class="dl-slot dl-day">' + pairChips(r, '昼', me, K) + '</span>' +
            '<span class="dl-slot dl-night">' + pairChips(r, '夜', me, K) + '</span>' +
            '</div>' + (open ? detail(r, me, today) : '');
        }
        return '<button type="button" class="dl-row' + (r.date === today ? ' is-today' : '') + (open ? ' is-open' : '') + '" data-date="' + r.date + '" aria-expanded="' + open + '">' +
          '<span class="dl-date"><span class="dl-d num ' + dayClass(r.date) + '">' + Number(r.date.slice(8)) + '</span><span class="dl-w ' + dayClass(r.date) + '">' + u.DOW[dw] + '</span>' +
          gradeBadge(r.grade, r.grade2) + '</span>' +
          '<span class="dl-slot dl-day">' + pairChips(r, '昼', me, null) + '</span>' +
          '<span class="dl-slot dl-night">' + pairChips(r, '夜', me, null) + '</span>' +
          '</button>' + (open ? detail(r, me, today) : '');
      }).join('') + '</div>';
  }

  // 管理者の全体の下：人ごとの出勤日数（9/29 Naoto「全体の下の方に出勤日数カウント」）
  //   日数＝昼か夜に入っている日（個人のカレンダーの「〇日/〇日」と同じ数え方）・内訳は昼／夜の枠数。上限＝設定シート
  //   上限ちょうど＝印／超え＝赤。最後の行＝まだ埋まっていない枠（未定）と1人配信の枠の数
  function countTable(rows, me) {
    var ms = st.me.members || [];
    var c = {};
    ms.forEach(function (m) { c[m.name] = { days: 0, day: 0, night: 0 }; });
    var open = 0, solo = 0;
    rows.forEach(function (r) {
      var seen = {};
      r.day.concat(r.night).forEach(function (v, k) {
        if (v === '') { open++; return; }
        if (v === '空き') { solo++; return; }
        if (!c[v]) return;
        c[v][k < 2 ? 'day' : 'night']++;
        if (!seen[v]) { seen[v] = 1; c[v].days++; }
      });
    });
    return '<div class="card cnt-card"><div class="cnt-head"><b>出勤日数</b><span class="sub">' + u.monthLabel(st.data.ym) + '・' + rows.length + '日</span></div>' +
      '<div class="cnt-grid">' + ms.map(function (m) {
        var x = c[m.name], lim = m.limit;
        var st2 = lim && x.days > lim ? ' is-over' : lim && x.days === lim ? ' is-full' : '';
        return '<div class="cnt-row' + st2 + (m.name === me ? ' is-me' : '') + '">' +
          '<span class="wa-who" style="--mc:' + (m.color || '#9aa0aa') + '">' + u.esc(m.name) + '</span>' +
          '<span class="cnt-n"><b class="num">' + x.days + '</b>' + (lim ? '<small>/' + lim + '</small>' : '') + '日' + (st2 === ' is-full' ? '<i>上限</i>' : st2 ? '<i>超え</i>' : '') + '</span>' +
          '<span class="cnt-split"><span class="lg lg-day">昼</span><span class="cnt-v">' + x.day + '</span><span class="lg lg-night">夜</span><span class="cnt-v">' + x.night + '</span></span></div>';
      }).join('') + '</div>' +
      '<div class="cnt-foot">未定 <b class="num">' + open + '</b>枠・1人配信 <b class="num">' + solo + '</b>枠</div></div>';
  }

  // 全体モードの見本：メンバーカラーと名前・1人配信・未定
  function allLegend(me) {
    return '<div class="legend all-legend">' + (st.me.members || []).map(function (m) {
      return '<span class="sw-item' + (m.name === me ? ' is-me' : '') + '"><i class="blk" style="background:' + (m.color || '#9aa0aa') + '"></i>' + u.esc(m.name) + '</span>';
    }).join('') +
      '<span class="sw-item"><i class="blk is-solo"></i>1人配信</span><span class="sw-item"><i class="blk is-open"></i>未定</span>' +
      '<span class="sw-item"><span class="blk-key blk-day">上</span>昼<span class="blk-key blk-night">下</span>夜</span></div>';
  }

  // 半休の日のマス＝その枠の半分だけ塗る（9/29 Naoto「ミッドのみなら夜の色で右半分だけ」）
  //   昼のマス＝左モーニング｜右デイ／夜のマス＝左ナイター｜右ミッド。出られない側は白地に薄い斜線
  //   希望の出どころ＝管理者は edit.wish（強調中の人）／配信者は本人の分だけの myWish
  var CELL_BG = { '昼': '#fff3c4', '夜': '#e3e6f8' };
  function wishFor(date, me) {
    var d = st.data;
    if (isAdmin()) return (((d.edit || {}).wish || {})[date] || {})[me] || '';
    return (d.myWish || {})[date] || '';
  }
  function halfCell(date, me, slot) {
    if (!slot) return '';
    var i = u.wishInfo(wishFor(date, me));
    if (!i || i.k !== 'half' || !i.ng) return '';
    // 通しの日＋半休（9/30 Naoto「上の左側は半休なので薄く」）＝上の段（昼）・下の段（夜）それぞれ左右で出られない側を白地に斜線
    //   段の境目は CSS の .is-mine-both と同じ（下から26px・藍の細線）
    if (slot === '通し') {
      var ng = function (q) { return i.ng.indexOf(q) >= 0; };
      var band = function (a, b, c) { return 'linear-gradient(90deg,' + (ng(a) ? 'transparent' : c) + ' 0 50%,' + (ng(b) ? 'transparent' : c) + ' 50% 100%)'; };
      if (![0, 1, 2, 3].some(ng)) return '';
      return ' style="background-color:#ffffff;background-image:linear-gradient(#8f98d8,#8f98d8),' + band(0, 1, CELL_BG['昼']) + ',' + band(2, 3, CELL_BG['夜']) + ',' +
        'repeating-linear-gradient(135deg,#ffffff 0 4px,#e9e7e1 4px 6px);' +
        'background-size:100% 1px,100% calc(100% - 26px),100% 26px,auto;background-position:0 calc(100% - 26px),0 0,0 100%,0 0;background-repeat:no-repeat,no-repeat,no-repeat,repeat"';
    }
    var qs = slot === '昼' ? [0, 1] : [2, 3];
    var ngL = i.ng.indexOf(qs[0]) >= 0, ngR = i.ng.indexOf(qs[1]) >= 0;
    if (!ngL && !ngR) return '';
    var c = CELL_BG[slot];
    return ' style="background-color:#ffffff;background-image:linear-gradient(to bottom, rgba(255,255,255,.75), rgba(255,255,255,0) 60%),' +
      'linear-gradient(90deg,' + (ngL ? 'transparent' : c) + ' 0 50%,' + (ngR ? 'transparent' : c) + ' 50% 100%),' +
      'repeating-linear-gradient(135deg,#ffffff 0 4px,#e9e7e1 4px 6px)"';
  }

  function calendar(rows, me, today, all) {
    var first = (u.dow(rows[0].date) + 6) % 7;
    var h = '';
    for (var i = 0; i < first; i++) h += '<span class="scal-cell is-blank"></span>';
    rows.forEach(function (r) {
      var dw = u.dow(r.date);
      var slot = all ? null : mySlot(r, me);
      // 自分の出勤日はマスごと塗る：昼＝薄い黄／夜＝紺（9/29 Naoto）
      var cls = ['scal-cell', slot === '昼' ? 'is-mine-day' : slot === '夜' ? 'is-mine-night' : slot === '通し' ? 'is-mine-both' : '',
        r.date === today ? 'is-today' : '', r.date === st.sel ? 'is-sel' : ''].join(' ');
      h += '<button type="button" class="' + cls + '"' + halfCell(r.date, me, slot) + ' data-date="' + r.date + '" aria-pressed="' + (r.date === st.sel) + '" aria-label="' + u.md(r.date) + (slot ? '・' + slot + 'の出番' : '') + (r.grade ? '・' + u.esc(r.grade.name) + (r.grade2 ? '・' + u.esc(r.grade2.name) : '') : '') + '">' +
        '<span class="scal-top"><span class="scal-d num ' + dayClass(r.date) + '">' + Number(r.date.slice(8)) + '</span>' +
        (!me && !all && isAdmin() ? shootMark(r) : '') +
        // グレードの札は「本人がその日その時間帯に出る」ときだけ（夜に出る日の昼Gは出さない・9/29 Naoto）。
        //   管理者で誰も強調していないときは全部出す（全体を見る画面なので）
        //   🔄10/1 未公開の月（配信者は出番が空＝namesHidden）は全部出す＝次の月の予定を立てる用（Naoto）
        (me && !all && !(st.data && st.data.namesHidden) ? (slot ? gradeAt(r, slot) : '') : gradeBadge(r.grade, r.grade2)) + '</span>' +
        (all ? '<span class="scal-body is-all">' + blocks(r, me) + '</span></button>' : '<span class="scal-body">' + cellBody(r, me, slot) + '</span></button>');
    });
    return '<div class="cal-head mon">' + HEAD.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div><div class="scal">' + h + '</div>';
  }
  // その日の開催（GASが netkeiba の開催カレンダーから返す）。昼＝モーニング・デイ／夜＝ナイター・ミッドナイト
  //   🔄9/29 Naoto：札（ボタン）にする。地の色＝コンソールの開催区分の色（§91）で区分がわかる。
  //   中身は「青森 F2 初」＝初日→初・最終日→終・ほかは何日目の数字。グレード開催はグレードの字を金に。
  //   🔑押すとその場の出走表（9/30〜 card.js）＝押しやすい大きさのボタン（data-venue・data-date）
  var KUBUN_ORDER = { 'モーニング': 0, '昼間': 1, 'ナイター': 2, 'ミッドナイト': 3 };
  var KUBUN_CLS = { 'モーニング': 'kc-morning', '昼間': 'kc-day', 'ナイター': 'kc-night', 'ミッドナイト': 'kc-mid' };
  function dayMark(d) {
    if (d === '初日') return '初';
    if (d === '最終日') return '終';
    var m = /(\d+)日目/.exec(d || '');
    return m ? m[1] : (d || '');
  }
  function venues(date, slot) {
    var list = (st.data && st.data.races && st.data.races[date]) || [];
    list = list.filter(function (x) { return slot === '昼' ? KUBUN_ORDER[x.k] <= 1 : KUBUN_ORDER[x.k] >= 2; })
      .sort(function (a, b) { return (KUBUN_ORDER[a.k] - KUBUN_ORDER[b.k]) || (a.v < b.v ? -1 : 1); });
    if (!list.length) return '';
    // 🔄9/29 Naoto「モーニング、デイごとに改行、ナイター、ミッドナイトごとに改行」＝区分ごとに1行
    var rowsK = [];
    list.forEach(function (x) { var last = rowsK[rowsK.length - 1]; if (last && last[0].k === x.k) last.push(x); else rowsK.push([x]); });
    return rowsK.map(function (grp) { return '<div class="venues">' + grp.map(function (x) {
      var isG = /^G|^GP/.test(x.g);
      return '<button type="button" class="rb ' + (KUBUN_CLS[x.k] || 'kc-day') + '" data-venue="' + u.esc(x.v) + '" data-date="' + date + '"' +
        ' aria-label="' + u.esc(x.v + ' ' + x.g + ' ' + x.d + '（' + (x.k === '昼間' ? 'デイ' : x.k) + '）') + '">' +
        '<span class="rb-v">' + u.esc(x.v) + '</span>' +
        '<span class="rb-g' + (isG ? ' is-g' : '') + '">' + u.esc(x.g) + '</span>' +
        '<span class="rb-d">' + u.esc(dayMark(x.d)) + '</span></button>';
    }).join('') + '</div>'; }).join('');
  }
  // 札の色の見方（詳細の下に1行）
  function kubunLegend() {
    return '<div class="kc-legend"><span class="kc-dot kc-morning"></span>モーニング<span class="kc-dot kc-day"></span>デイ' +
      '<span class="kc-dot kc-night"></span>ナイター<span class="kc-dot kc-mid"></span>ミッド</div>';
  }
  function detail(r, me, today) {
    var lk = r.locked || [false, false, false, false];
    var ed = EDIT.can();
    // 名前の札から枠を直せるのは［✎編集］がオンのときだけ（9/30 Naoto＝見ているだけのときの押し間違いでシートを書き換えない）
    var e = function (s) { return ed && editOn() ? { date: r.date, slot: s } : null; };
    var vals = r.day.concat(r.night);
    var allLocked = vals.every(function (v, i) { return v === '' || lk[i]; }) && vals.some(function (v) { return v !== ''; });
    return '<div class="card day-detail">' +
      // 日付の色はカレンダーと同じ（土＝青・日祝＝赤）。祝日は名前も添える
      '<div class="row" style="justify-content:space-between"><strong class="day-detail-date"><span class="' + dayClass(r.date) + '">' + u.md(r.date) + '</span>' +
      (u.holidayOf(r.date) ? '<span class="hol-name">' + u.esc(u.holidayOf(r.date)) + '</span>' : '') + (r.date === today ? ' 今日' : '') + '</strong>' +
      // 右上のグレード表示は消した（下の場の札と情報が重なる・9/29 Naoto）
      '</div>' +
      // 管理者：その日に撮影の人（マスの「撮」の中身）。編集オンのときは下の休み希望の行に出るので出さない
      (isAdmin() && !editOn() ? shootLine(r.date) : '') +
      // 配信者の休み希望（10/1）＝日付のすぐ下（場の札の下だとスクロールしないと届かない）
      (canWish() ? myWishBox(r.date) : '') +
      // 昼・夜の札はカレンダーの凡例と同じ「中が薄い」札（9/29 Naoto）
      '<div class="slot-row"><span class="lg lg-day slot-badge">昼</span>' + chip(r.day[0], me, lk[0], e(0), paintStyle(r.day[0], r.date, '昼', me)) + chip(r.day[1], me, lk[1], e(1), paintStyle(r.day[1], r.date, '昼', me)) + '</div>' +
      venues(r.date, '昼') +
      '<hr class="slot-sep">' +  // 昼と夜の区切り（9/29 Naoto）
      '<div class="slot-row"><span class="lg lg-night slot-badge">夜</span>' + chip(r.night[0], me, lk[2], e(2), paintStyle(r.night[0], r.date, '夜', me)) + chip(r.night[1], me, lk[3], e(3), paintStyle(r.night[1], r.date, '夜', me)) + '</div>' +
      venues(r.date, '夜') +
      // 管理者の編集：メモと、その日の4枠をまとめて確定／解除（枠ごとの変更は名前の札を押す）
      // 🔄9/29 Naoto「編集モードじゃないのに『この日を確定』がある・メモと休み希望も表示不要」＝編集オンのときだけ
      (ed && editOn() ? '<div class="edit-row"><button type="button" class="memo memo-btn" data-edit-memo="' + r.date + '">メモ：' + (r.memo ? u.esc(r.memo) : '<span class="faint">なし</span>') + ' ✎</button>' +
        '<button type="button" class="btn ghost btn-xs" data-lock-day="' + r.date + '" data-on="' + (allLocked ? '0' : '1') + '">' + (allLocked ? '確定を外す' : '🔒この日を確定') + '</button></div>'
        : '') +
      (ed && editOn() ? wishLine(r.date) : '') +
      '</div>';
  }

  // ── 🔄10/1 配信者の休み希望＝シフトのタブで出す（Naoto「休み希望タブいる？カレンダーを触って休み希望に」）──
  //   受付中の月（締切＝前月20日・GASの d.wish）だけ。日付の詳細の一番下に［なし｜休｜半休］＋時間帯＋ひとこと
  //   書き先＝シフト表の休み希望欄（本人の列）・ひとことは記録のシート（管理者が見る）。締切後は表示だけ
  // 🔄10/1 公開した（シフトが確定した）月は、受付中でなければ欄ごと出さない（Naoto）
  function canWish() { var d = st.data; return !isAdmin() && d && d.wish && d.wish.can && (d.wish.open || !d.published); }
  function myWishBox(date) {
    var d = st.data, cur = (d.myWish || {})[date] || '', info = u.wishInfo(cur);
    var note = ((d.wish.notes || {})[date]) || '';
    var h = '<div class="wm-box"><div class="wm-cap">休み・出勤希望</div>';
    if (info && info.k === 'shoot') return h + '<p class="sub">この日は撮影の予定です（変更は管理者に連絡してください）。</p></div>';
    if (!d.wish.open || st.me.previewBy) {
      return h + '<p class="wm-cur">' + (cur ? '<b>' + u.esc(info ? info.label : cur) + '</b>' : '出していません') + (note ? '<small>「' + u.esc(note) + '」</small>' : '') + '</p>' +
        '<p class="fresh">' + (st.me.previewBy ? 'プレビュー中は見るだけです。' : '締切を過ぎたので変えられません。変更は管理者に連絡してください。') + '</p></div>';
    }
    if (!st.wd || st.wd.date !== date) st.wd = { date: date, k: info ? info.k : 'none', ng: info && info.ng ? info.ng.slice() : [], ws: info && info.slot ? info.slot : '', note: note };
    var dr = st.wd;
    // 🆕10/1 ［入りたい］＝出勤希望（Yの了承）→［昼｜夜｜どちらでも］
    h += '<div class="wm-kinds">' + [['none', 'なし'], ['off', '休'], ['half', '半休'], ['want', '入りたい']].map(function (k) {
      return '<button type="button" class="wm-k' + (dr.k === k[0] ? ' is-on' : '') + (k[0] === 'want' ? ' wm-k-want' : '') + '" data-wk="' + k[0] + '">' + k[1] + '</button>';
    }).join('') + '</div>';
    if (dr.k === 'half') {
      h += '<div class="wm-q">' + u.Q4.map(function (q, i) {
        return '<button type="button" class="wm-qb' + (dr.ng.indexOf(i) >= 0 ? ' is-ng' : '') + '" data-wq="' + i + '">' + q + '</button>';
      }).join('') + '</div><p class="fresh">' + (dr.ng.length ? '出られない時間帯＝赤・' + u.halfSay(dr.ng) : '出られない時間帯を押して選んでください') + '</p>';
    }
    if (dr.k === 'want') {
      h += '<div class="wm-q wm-q3">' + ['昼', '夜', 'どちらでも'].map(function (s) {
        return '<button type="button" class="wm-qb' + (dr.ws === s ? ' is-want' : '') + '" data-ws="' + s + '">' + s + '</button>';
      }).join('') + '</div><p class="fresh">入りたい時間帯を選んでください。必ず入れる約束ではなく、シフトを組むときの参考です（誰が出したかは管理者だけが見ます）。</p>';
    }
    var value = draftValue(dr);
    var same = value === cur && dr.note === note && !incomplete(dr);
    return h + '<input class="date-input wm-note" id="wm-note" maxlength="100" placeholder="ひとこと（なくてもOK・管理者だけが見ます）" value="' + u.esc(dr.note) + '">' +
      '<button type="button" class="btn btn-sm" id="wm-save"' + (st.wbusy || same ? ' disabled' : '') + '>' + (st.wbusy ? '送っています…' : cur && !value && dr.k === 'none' ? '希望を取り消す' : 'この日の希望を出す') + '</button></div>';
  }
  // 書きかけの中身 → シートに入れる文字（休／半（モ・デNG）／出（夜）／''）
  function draftValue(dr) {
    if (dr.k === 'off') return '休';
    if (dr.k === 'half') return dr.ng.length ? u.wishText(dr.ng) : '';
    if (dr.k === 'want') return dr.ws ? u.wantText(dr.ws) : '';
    return '';
  }
  function incomplete(dr) { return (dr.k === 'half' && !dr.ng.length) || (dr.k === 'want' && !dr.ws); }
  // カレンダーの上の1行＝締切（あと何日）＋「この月は希望なし」
  function wishBar(d) {
    if (!canWish() || !d.wish.open) return '';
    var left = u.daysBetween(d.today, d.wish.due), c = { off: 0, half: 0, want: 0 };
    Object.keys(d.myWish || {}).forEach(function (k) { var i = u.wishInfo(d.myWish[k]); if (i && c[i.k] != null) c[i.k]++; });
    var n = c.off + c.half + c.want;
    var said = [c.off ? '休' + c.off : '', c.half ? '半休' + c.half : '', c.want ? '入りたい' + c.want : ''].filter(Boolean).join('・');
    return '<div class="wish-bar' + (left <= 3 ? ' is-urgent' : '') + '"><span><b>' + u.monthLabel(d.ym) + 'の休み・出勤希望</b> 締切 ' + u.md(d.wish.due) + '・<b class="num">' + (left ? 'あと' + left + '日' : '今日まで') + '</b></span>' +
      '<small>' + (n ? '出した：' + said + '・' : d.wish.none ? '「希望なし」で出しました・' : '') + '日付を押して出せます</small>' +
      (!n && !d.wish.none && !st.me.previewBy ? '<button type="button" class="link-btn" id="wm-none">この月は希望なしで出す</button>' : '') + '</div>';
  }
  function wishSend(body, msg) {
    st.wbusy = true; SHIFT.render();
    return API.wishMe(Object.assign({ ym: st.ym }, body)).then(function (d) {
      st.wbusy = false; st.wd = null;
      saveCache(d, new Date()); apply(d, new Date()); APP.toast(msg); SHIFT.render();
    }, function (e) {
      st.wbusy = false;
      if (e.code === 'conflict') { st.wd = null; APP.toast('ほかで変わっていたので読み直しました', true); load(st.ym); return; }
      SHIFT.render(); APP.toast((e.data && e.data.error) || '送れませんでした', true);
    });
  }

  // 管理者の編集中だけ：その日の休み希望（9/29 Naoto「休み希望が入った状態でいじりたい」）
  //   🔄同日 押すとその日の休み希望を直す板（希望がない日も「なし ✎」で出す＝足せる）
  function wishLine(date) {
    var w = (st.data.edit && st.data.edit.wish && st.data.edit.wish[date]) || {};
    // 並び＝休→半→撮影（9/29 Naoto）。半休は「半 モ・デNG」の形で
    var info = function (n) { return u.wishInfo(w[n]) || { k: 'half', label: w[n] }; };
    var names = Object.keys(w).sort(function (a, b) { return u.WISH_ORDER[info(a).k] - u.WISH_ORDER[info(b).k]; });
    return '<button type="button" class="memo memo-btn wish-line" data-edit-wish="' + date + '">休み希望：' + (names.length ? names.map(function (n) {
      var hb = info(n).k === 'half' && info(n).ng ? ' style="background:' + u.halfBg(info(n).ng, 'color-mix(in srgb, var(--half) 24%, #ffffff)') + '"' : '';  // 半休＝出られる所だけ塗る
      return '<span class="wl wl-' + info(n).k + '"' + hb + '>' + u.esc(n) + ' ' + u.esc(info(n).label) + '</span>';
    }).join('') : '<span class="faint">なし</span>') + ' ✎</button>';
  }

  // 管理者だけ：この月を配信者に見せるかどうか
  function publishBar(d) {
    var label = u.monthLabel(d.ym);
    if (st.confirm) {
      return '<div class="card pub-bar is-confirm">' +
        '<p><b>' + label + 'のシフトを' + (d.published ? '作成中に戻しますか？' : 'みんなに発表しますか？') + '</b></p>' +
        '<p class="sub">' + (d.published ? '配信者の画面では、この月は開催とグレードだけになります（名前は消えます）。' : '配信者全員の画面に、この月のシフトがそのまま表示されます。発表したあとに直した分も、次に開いたときに反映されます。') + '</p>' +
        '<div class="btn-row"><button type="button" class="btn ghost" id="pub-no">やめる</button><button type="button" class="btn" id="pub-yes">' + (d.published ? '作成中に戻す' : '発表する') + '</button></div></div>';
    }
    // 🔑1行に収める（発表の状態＋ボタン＋強調する人）＝1画面に収めるため（9/29 Naoto「スクロール無しで全部表示」）
    // 🔄10/1 呼び名＝「作成中／発表済み」（Naoto A案・発表後も調整で変わるので「確定」「決定」は強い）。中身は今までの公開・非公開と同じ
    return '<div class="admin-bar">' +
      (d.published ? '<span class="pill ok">発表済み</span>' : '<span class="pill dim">作成中</span>') +
      '<button type="button" class="btn ' + (d.published ? 'ghost' : '') + ' btn-sm" id="pub-ask">' + (d.published ? '作成中に戻す' : 'みんなに発表') + '</button>' +
      (EDIT.can() && editOn() ? '<button type="button" class="btn ghost btn-sm" id="bulk-menu" aria-label="月まとめての操作（自動入力・並び替え・リセット）">一括▾</button>' : '') +
      // 🔄10/1 休み希望（全員の一覧・届いた希望・まだ出していない人）＝前の休み希望タブの中身を全画面で（wishadmin.js）
      (window.WISHADMIN && WISHADMIN.can(st.me) ? '<button type="button" class="btn ghost btn-sm wa-open" id="wa-open">休み希望' + (WISHADMIN.unseen() ? '<span class="badge-in">' + WISHADMIN.unseen() + '</span>' : '') + '</button>' : '') +
      '<select id="focus" class="date-input focus-sel" aria-label="強調する人"><option value="">なし</option>' +
      st.me.members.map(function (m) { return '<option value="' + u.esc(m.name) + '"' + (m.name === st.focus ? ' selected' : '') + '>' + u.esc(m.name) + '</option>'; }).join('') +
      '</select></div>';
  }

  function render(el) {
    el = el || document.getElementById('view');
    var d = st.data;
    if (!d) {
      el.innerHTML = '<div class="title-row"><h1 class="screen-title">シフト</h1></div>' + (st.err ? '<div class="card"><p>' + u.esc(st.err) + '</p><button type="button" class="btn" id="reload">最新にする</button></div>' : '<p class="sub">読み込んでいます…</p>');
      bind(el);
      return;
    }
    var months = d.months || [];
    if (!months.length || !d.rows || !d.rows.length) {
      el.innerHTML = '<div class="title-row"><h1 class="screen-title">シフト</h1></div><div class="card"><p>まだ発表されたシフトはありません。</p><p class="sub">管理者が発表すると、ここに表示されます。</p><button type="button" class="btn ghost" id="reload">最新にする</button></div>';
      bind(el);
      return;
    }
    var me = target();
    var today = d.today;
    var rows = d.rows;
    var selRow = rows.filter(function (r) { return r.date === st.sel; })[0];
    // 出勤日数＝昼か夜のどちらかに入っている日（9/29 Naoto「24日/31日みたいに」）
    var count = 0;
    if (me) rows.forEach(function (r) { if (r.day.indexOf(me) >= 0 || r.night.indexOf(me) >= 0) count++; });
    var lim = me ? limitOf(me) : null;
    // 月の切り替えは直近だけ（前の月〜）。古い月は出さない
    var curYm = u.ymOf(today);
    var shown = months.filter(function (m) { return m.ym >= u.addMonth(curYm, -1); });
    if (!shown.some(function (m) { return m.ym === d.ym; })) shown.push(months.filter(function (m) { return m.ym === d.ym; })[0]);

    // 🔑1画面に収める並び（9/29 Naoto）：見出し行 → 月 → （管理者だけ1行） → カレンダー（凡例と出勤数は枠の中の1行） → その日の詳細
    //   「シフト」の見出しの位置は管理者・配信者で同じ（管理者の追加分は月の切り替えより下にだけ入る）
    var at = st.fetchedAt ? u.pad(st.fetchedAt.getHours()) + ':' + u.pad(st.fetchedAt.getMinutes()) + '時点' : '';
    var all = st.mode === 'all';
    el.innerHTML =
      // 見出しの横に［個人｜全体］（9/29 Naoto）。個人＝自分の出番と相方／全体＝全員の入り方（色の四角）
      '<div class="title-row"><h1 class="screen-title">シフト</h1>' +
      '<span class="seg seg-mode" role="group" aria-label="表示">' +
      '<button type="button" data-mode="me" aria-pressed="' + !all + '">個人</button>' +
      '<button type="button" data-mode="all" aria-pressed="' + all + '">全体</button></span>' +
      '<span class="title-aside">' + (EDIT.pending() ? '<b class="saving">保存中…</b>' : st.loading ? '読み込み中…' : at) + ' <button type="button" class="link-btn" id="reload">最新にする</button></span></div>' +
      // 🆕10/1 通知をオンにする案内（オンにするか×で閉じるまで・push.js）
      (window.PUSH ? PUSH.banner() : '') +
      '<div class="seg seg-sm" role="group" aria-label="月">' + shown.map(function (m) {
        return '<button type="button" data-ym="' + m.ym + '" aria-pressed="' + (m.ym === d.ym) + '">' + u.monthLabel(m.ym) + (!m.published ? '<small class="seg-note">作成中</small>' : '') + '</button>';
      }).join('') + '</div>' +
      (isAdmin() ? publishBar(d) : '') +
      // 🔄10/1 配信者にも未公開の月のカレンダー（開催・Gバッジ）を見せる。誰がいつ出るかはGASが空で返す
      (!isAdmin() && !d.published ? '<p class="sub unpub-note">' + u.monthLabel(d.ym) + 'のシフトは作成中です（開催とグレードだけ見られます）</p>' : '') +
      wishBar(d) +
      // 💡次に決める枠（管理者の編集中だけ・1行）
      (EDIT.can() && editOn() && EDIT.suggestBar && !st.confirm ? EDIT.suggestBar() : '') +
      // 選んだ日の枠＝見ている人（管理者は強調中の人）のメンバーカラー（9/29 Naoto）
      // 全体＝1日1行の縦一覧（9/29 Naoto「全体のカレンダーは縦一列で1日一行」）／個人＝月カレンダー＋下に詳細
      (all ? dayList(rows, me, today) + (isAdmin() ? countTable(rows, me) : '') :
      '<div class="card cal-card"' + (me && colorOf(me) ? ' style="--sel:' + colorOf(me) + '"' : '') + '>' + calendar(rows, me, today, false) +
      '<div class="legend">' +
      (me ? '<span><span class="lg lg-day">昼</span><span class="lg lg-night">夜</span>＝' + (isAdmin() ? 'その人' : '自分') + 'の出番（中は相方）</span>' : (isAdmin() ? '<span>マスの中＝上が昼・下が夜の2人（頭文字）・「・」＝未定</span>' : '<span><span class="sm aki">未定</span>＝人が入っていない枠</span>')) +
      '<span><span class="gb gb-day">昼G</span><span class="gb gb-night">夜G</span>＝グレード</span>' +
      // 出勤数は管理者（強調中）だけ。配信者の画面には出さない（9/29 Naoto「23枠/25って表示は消して」）
      (me ? '<span class="legend-count">' + (isAdmin() ? u.esc(me) + ' ' : '') + '<b class="num">' + count + '</b>日/' + rows.length + '日</span>' : '') +
      '</div></div>' +
      (selRow ? detail(selRow, me, today) : ''));
    bind(el);
    // （全体を開いたときに今日へ自動スクロールする動きは 9/29 Naoto「デフォルトで本日にカーソルが合うようにしなくてOK」で廃止）
  }

  function bind(el) {
    var q = function (s) { return el.querySelector(s); };
    if (q('#reload')) q('#reload').addEventListener('click', function () { if (!st.loading) load(st.ym); });
    el.querySelectorAll('[data-ym]').forEach(function (b) { b.addEventListener('click', function () { st.sel = null; st.selAll = null; load(b.dataset.ym); }); });
    el.querySelectorAll('.scal-cell[data-date]').forEach(function (b) { b.addEventListener('click', function () { st.sel = b.dataset.date; render(el); }); });
    // 全体の一覧：行を押すとその下に詳細を開く・同じ行をもう一度押すと閉じる
    if (q('#all-edit')) q('#all-edit').addEventListener('click', function () { st.editAll = !st.editAll; render(el); });
    el.querySelectorAll('[data-open-date]').forEach(function (b) {
      b.addEventListener('click', function () { st.selAll = st.selAll === b.dataset.openDate ? null : b.dataset.openDate; render(el); });
    });
    el.querySelectorAll('.dl-row[data-date]').forEach(function (b) {
      b.addEventListener('click', function () { st.selAll = st.selAll === b.dataset.date ? null : b.dataset.date; render(el); });
    });
    el.querySelectorAll('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () {
        st.mode = b.dataset.mode;
        st.selAll = null;  // 全体は全部閉じた状態で開く
        try { localStorage.setItem('gakuya:mode', st.mode); } catch (e) { /* 覚えられなくても切り替えは効く */ }
        render(el);
      });
    });
    // 場の札を押す＝その場のその日の出走表（card.js・9/30 Naoto）
    el.querySelectorAll('.rb').forEach(function (b) { b.addEventListener('click', function () { CARD.open(b.dataset.date, b.dataset.venue); }); });
    // 管理者の編集（shiftedit.js）
    el.querySelectorAll('[data-edit-slot]').forEach(function (b) {
      b.addEventListener('click', function () { EDIT.openSlot(b.dataset.editDate, +b.dataset.editSlot); });
    });
    el.querySelectorAll('[data-edit-wish]').forEach(function (b) { b.addEventListener('click', function () { EDIT.openWish(b.dataset.editWish); }); });
    el.querySelectorAll('[data-edit-memo]').forEach(function (b) { b.addEventListener('click', function () { EDIT.openMemo(b.dataset.editMemo); }); });
    el.querySelectorAll('[data-lock-day]').forEach(function (b) { b.addEventListener('click', function () { EDIT.lockDay(b.dataset.lockDay, b.dataset.on === '1'); }); });
    el.querySelectorAll('.sg-main[data-sg-date]').forEach(function (b) { b.addEventListener('click', function () { EDIT.openSlot(b.dataset.sgDate, +b.dataset.sgSlot); }); });
    if (q('#sg-more')) q('#sg-more').addEventListener('click', function () { EDIT.openSuggest(); });
    if (q('#bulk-menu')) q('#bulk-menu').addEventListener('click', function () { EDIT.openMenu(); });
    if (q('#wa-open')) q('#wa-open').addEventListener('click', function () { WISHADMIN.open(); });
    // 配信者の休み希望（10/1）
    var keepNote = function () { var n = q('#wm-note'); if (n && st.wd) st.wd.note = n.value; };
    el.querySelectorAll('[data-wk]').forEach(function (b) { b.addEventListener('click', function () { keepNote(); st.wd.k = b.dataset.wk; render(el); }); });
    el.querySelectorAll('[data-wq]').forEach(function (b) {
      b.addEventListener('click', function () {
        keepNote();
        var i = +b.dataset.wq, ng = st.wd.ng, at = ng.indexOf(i);
        if (at >= 0) ng.splice(at, 1); else ng.push(i);
        render(el);
      });
    });
    el.querySelectorAll('[data-ws]').forEach(function (b) { b.addEventListener('click', function () { keepNote(); st.wd.ws = b.dataset.ws; render(el); }); });
    if (q('#wm-note')) q('#wm-note').addEventListener('input', function () {
      keepNote();
      var sv = q('#wm-save'), d = st.data, cur = (d.myWish || {})[st.wd.date] || '';
      if (sv && !st.wbusy) sv.disabled = (draftValue(st.wd) === cur && st.wd.note === (((d.wish.notes || {})[st.wd.date]) || '')) || incomplete(st.wd);
    });
    if (q('#wm-save')) q('#wm-save').addEventListener('click', function () {
      keepNote();
      var dr = st.wd, cur = (st.data.myWish || {})[dr.date] || '';
      if (incomplete(dr)) { APP.toast(dr.k === 'want' ? '入りたい時間帯を選んでください' : '出られない時間帯を選んでください', true); return; }
      var value = draftValue(dr);
      wishSend({ date: dr.date, value: value, note: dr.note, expect: cur }, value ? u.md(dr.date) + 'の希望を出しました' : '取り消しました');
    });
    if (q('#wm-none')) q('#wm-none').addEventListener('click', function () { wishSend({ none: true }, '「希望なし」で出しました'); });
    if (q('#focus')) q('#focus').addEventListener('change', function () { st.focus = q('#focus').value; render(el); });
    if (q('#pub-ask')) q('#pub-ask').addEventListener('click', function () { st.confirm = true; render(el); });
    if (q('#pub-no')) q('#pub-no').addEventListener('click', function () { st.confirm = false; render(el); });
    if (q('#pub-yes')) q('#pub-yes').addEventListener('click', function () {
      var on = !st.data.published;
      q('#pub-yes').disabled = true;
      API.publish(st.ym, on).then(function (d) {
        st.data = d; st.confirm = false;
        saveCache(d, new Date());
        APP.toast(on ? u.monthLabel(d.ym) + 'のシフトを発表しました' : u.monthLabel(d.ym) + 'を作成中に戻しました');
        render(el);
      }).catch(function () {
        APP.toast('切り替えられませんでした。もう一度お試しください', true);
        st.confirm = false; render(el);
      });
    });
  }

  // 編集（shiftedit.js）に渡す手すり。保存が返ってきたら同じ月を見ているときだけ差し替える
  EDIT.attach({
    data: function () { return st.data; },
    isAdmin: isAdmin,
    members: function () { return st.me.members || []; },
    limitOf: limitOf,
    render: function () { SHIFT.render(); },
    reload: function () { load(st.ym); },
    saveCache: function (d) { saveCache(d, new Date()); },
    applyServer: function (d) { if (d && d.ym === st.ym) apply(d, new Date()); }
  });

  return {
    // 開いたら最後に見ていた月から。その月が無くなっていたら（非公開に戻った等）GASの既定の月へ
    init: function (me) {
      st.me = me;
      var last = null;
      try { last = localStorage.getItem(LS + who() + ':last'); } catch (e) { last = null; }
      if (!last) return load(null);
      return load(last).then(function () { if (!st.data || st.ym !== last) { st.err = ''; return load(null); } });
    },
    // 🔑読み込みの完了は別のタブを開いている最中に来ることがある＝表示中のタブだけ描く
    //   （管理者の休み希望タブはシフトと同じデータを使う＝wishadmin.js）
    render: function () {
      if (APP.current() === 'shift') render();
      // 管理者の休み希望（全画面）を開いていれば、そちらも描き直す（同じデータを使う＝wishadmin.js）
      if (window.WISHADMIN && WISHADMIN.isOpen && WISHADMIN.isOpen()) WISHADMIN.render();
    },
    reload: function () { return load(st.ym); },
    // 最新の me（メンバー・色・並び・上限・月の一覧）が届いたら差し替えて描き直す（app.js が控えで先に開いたとき）
    setMe: function (m) { st.me = m; SHIFT.render(); },
    // 休み希望タブから使う：今のデータ・月の切り替え・日付を選んだ状態にする
    state: function () { return { data: st.data, loading: st.loading, members: (st.me && st.me.members) || [] }; },
    go: function (ym) { st.sel = null; st.selAll = null; return load(ym); },
    select: function (date) { st.sel = date; st.selAll = date; }
  };
})();
