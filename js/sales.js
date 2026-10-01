/* sales.js — 「実績」タブ＝note売上（2026-09-30 Naoto「note売上との連携」）
   ・中身＝GASの app=sales（人×記事の集計値）。全員分＝見てよい管理者だけ／🔄9/30 配信者＝本人の行だけ（scope=mine・GASのスイッチがONのとき）
   ・月＝レース日の月。出勤日数＝シフト（実際に誰が出た）。シートが無い月は「その枠の記事が売れた日」で数える
   ・全員＝人ごとの一覧（押すとその人）／個人＝売上（手数料の前・後）・出勤日数・1出勤あたり（昼・夜・グレード）＋記事ごとの一覧
   ・🔴人名・金額はGASが返す（このファイルに書かない＝公開リポジトリ） */
var SALES = (function () {
  var u = window.OKL.u;
  var st = { ym: '', who: '', data: {}, shift: {}, loading: false, err: '' };
  // 列＝GASの SALES_COLS と同じ並び
  var C = { who: 0, day: 1, slot: 2, waku: 3, place: 4, races: 5, g: 6, title: 7, n: 8, gross: 9, tip: 10, fee: 11 };
  var WAKU = { 'モ': 'モーニング', 'デ': 'デイ', 'ナ': 'ナイター', 'ミ': 'ミッド' };
  var KC = { 'モ': 'kc-morning', 'デ': 'kc-day', 'ナ': 'kc-night', 'ミ': 'kc-mid' };
  var RANK = { 'モ': 0, 'デ': 1, 'ナ': 2, 'ミ': 3 };
  // 区分が分からない記事＝昼はデイの後ろ・夜はミッドの後ろ
  function wakuRank(r) { return r[C.waku] in RANK ? RANK[r[C.waku]] : r[C.slot] === '昼' ? 1.5 : 3.5; }

  function members() { return (SHIFT.state().members || []); }
  function colorOf(n) { var m = members().filter(function (x) { return x.name === n; })[0]; return (m && m.color) || '#9aa0aa'; }
  function yen(n) { return u.yen(n) + '円'; }
  function dateOf(ym, day) { return ym + '-' + ('0' + day).slice(-2); }
  function dayClass(date) { var dw = u.dow(date); return dw === 0 || u.holidayOf(date) ? 'sun' : dw === 6 ? 'sat' : ''; }

  function load(ym) {
    st.loading = true; st.err = ''; draw();
    API.sales(ym).then(function (d) {
      st.data[d.ym] = d; st.ym = d.ym; st.months = d.months; st.asof = d.asof;
      // 配信者（scope=mine）＝GASが本人の行だけ返す。画面も本人の個人画面だけ（人選び・全員の表・全員の比較は出さない）
      st.mine = d.scope === 'mine';
      if (st.mine) st.who = d.me;
      if (!d.ym) return;
      // 出勤日数のためにその月のシフト（管理者は全月読める）。シートが無い月は失敗する＝売れた日で数える
      if (st.shift[d.ym] === undefined) {
        // 未公開の月（配信者には空のシフトが返る・10/1〜）は出勤に使わない＝売れた日で数える
        return API.shift(d.ym).then(function (s) { st.shift[d.ym] = s.rows && !s.namesHidden ? s : null; }, function () { st.shift[d.ym] = null; });
      }
    }).catch(function (e) { st.err = e.code === 'notyet' ? 'notyet' : 'net'; })
      .then(function () { st.loading = false; draw(); });
  }

  // 人ごとの数字。シフトがあれば出勤日＝シフト、無ければ売れた日
  // maxDay＝その日までで数える（前月比で「先月の同じ日まで」とそろえるとき・9/30）
  function stats(rows, who, shift, ym, maxDay) {
    var mine = rows.filter(function (r) { return r[C.who] === who && (!maxDay || r[C.day] <= maxDay); });
    var s = { gross: 0, tip: 0, fee: 0, n: 0, arts: mine.length, by: { '昼': 0, '夜': 0, G: 0 }, days: {}, dayD: {}, dayN: {}, dayG: {}, basis: shift ? 'shift' : 'sold' };
    mine.forEach(function (r) {
      var v = r[C.gross] + r[C.tip];
      s.gross += r[C.gross]; s.tip += r[C.tip]; s.fee += r[C.fee]; s.n += r[C.n];
      s.by[r[C.slot]] += v;
      if (r[C.g]) s.by.G += v;
      if (!shift) {
        s.days[r[C.day]] = 1;
        (r[C.slot] === '昼' ? s.dayD : s.dayN)[r[C.day]] = 1;
        if (r[C.g]) s.dayG[r[C.day]] = 1;
      }
    });
    if (shift) {
      // noteのデータが途中までの月（例：9/18まで）は、その日までの出勤だけ数える（1出勤あたりが薄まらないように）
      var upto = st.asof && st.asof.slice(0, 7) === ym ? st.asof : '9999';
      shift.rows.forEach(function (r) {
        if (r.date > upto || (maxDay && +r.date.slice(8) > maxDay)) return;
        var d = +r.date.slice(8), inD = r.day.indexOf(who) >= 0, inN = r.night.indexOf(who) >= 0;
        if (inD || inN) s.days[d] = 1;
        if (inD) s.dayD[d] = 1;
        if (inN) s.dayN[d] = 1;
        [r.grade, r.grade2].forEach(function (g) { if (g && ((g.slot === '夜' && inN) || (g.slot !== '夜' && inD))) s.dayG[d] = 1; });   // 10/1 昼夜両方の日は grade2
      });
    }
    s.total = s.gross + s.tip;
    s.net = s.total - s.fee;
    s.nd = Object.keys(s.days).length; s.nD = Object.keys(s.dayD).length; s.nN = Object.keys(s.dayN).length; s.nG = Object.keys(s.dayG).length;
    return s;
  }
  function per(v, n) { return n ? yen(v / n) : '—'; }

  // ── 前月比（9/30 Naoto②）。途中までの月（9/18まで等）は、先月も同じ日までで比べる＝「先月同期比」 ──
  function prevYm(ym) { var ks = Object.keys(st.all || {}).sort(), i = ks.indexOf(ym); return i > 0 ? ks[i - 1] : ''; }
  function partialDay(ym) { return st.asof && st.asof.slice(0, 7) === ym ? +st.asof.slice(8) : 0; }
  function prevStats(who, ym) {
    var p = prevYm(ym);
    if (!p) return null;
    return stats(st.all[p], who, st.shift[p] || null, p, partialDay(ym) || undefined);
  }
  // 変化の札：▲▼＋数字（色は「上がる＝よい」前提で緑・赤。矢印があるので色だけに頼らない）
  function delta(cur, prev, kind) {
    if (prev == null || cur == null || (kind !== 'day' && kind !== 'pt' && !prev)) return '';
    var d = kind === 'pct' ? (cur / prev - 1) * 100 : cur - prev;
    if (!isFinite(d)) return '';
    var txt = kind === 'pct' ? Math.abs(d).toFixed(0) + '%' : kind === 'pt' ? Math.abs(d).toFixed(1) + 'pt' : Math.abs(d) + (kind === 'day' ? '日' : kind === 'person' ? '人' : '');
    if (Math.abs(d) < (kind === 'pct' ? 0.5 : kind === 'pt' ? 0.05 : 1)) return '<span class="dl-flat">±0</span>';
    return '<span class="' + (d > 0 ? 'dl-up' : 'dl-down') + '">' + (d > 0 ? '▲' : '▼') + txt + '</span>';
  }
  function deltaLabel(ym) { return partialDay(ym) ? '先月同期比' : '先月比'; }

  // ── 的中（9/30 Naoto①）＝配信コンソールの予想を配信画面と同じ判定にかけた数字。8/14〜 ──
  var H = { who: 0, day: 1, slot: 2, waku: 3, note: 4, settled: 5, hit: 6, inv: 7, ref: 8, g: 9, kind: 10 };   // 10/1〜 g＝グレード開催のレース／kind＝チャレンジ・ガールズ
  function hitStats(ym, who, maxDay) {
    var rows = ((st.hits || {})[ym] || []).filter(function (r) { return r[H.who] === who && (!maxDay || r[H.day] <= maxDay); });
    if (!rows.length) return null;
    var s = { settled: 0, hit: 0, inv: 0, ref: 0, nSettled: 0, nHit: 0, nInv: 0, nRef: 0, last: 0 };
    rows.forEach(function (r) {
      s.settled += r[H.settled]; s.hit += r[H.hit]; s.inv += r[H.inv]; s.ref += r[H.ref];
      if (r[H.note]) { s.nSettled += r[H.settled]; s.nHit += r[H.hit]; s.nInv += r[H.inv]; s.nRef += r[H.ref]; }
      s.last = Math.max(s.last, r[H.day]);
    });
    s.rate = s.settled ? s.hit / s.settled * 100 : null;
    s.back = s.inv ? s.ref / s.inv * 100 : null;
    s.nRate = s.nSettled ? s.nHit / s.nSettled * 100 : null;
    s.nBack = s.nInv ? s.nRef / s.nInv * 100 : null;   // 10/1 Yの要望「note回収率」
    return s;
  }
  // 見出しの期間＝その月に予想データがある最初の日〜最後の日（チーム全体）。🔄9/30 Naoto「9月なのにスタートが8/14」
  //   ＝以前は「8/14〜」（データが残っている始まり）を全部の月に出していて、9月の成績が8/14からに読めた
  function hitRangeLabel(ym) {
    var rows = (st.hits || {})[ym] || [];
    if (!rows.length) return '・予想データは8/14から';
    var days = rows.map(function (r) { return r[H.day]; });
    var a = Math.min.apply(null, days), b = Math.max.apply(null, days), m = +ym.slice(5);
    var first = Object.keys(st.hits).filter(function (k) { return (st.hits[k] || []).length; }).sort()[0] === ym;
    return '・' + m + '/' + a + '〜' + m + '/' + b + (first && a > 1 ? '（予想データは' + m + '/' + a + 'から）' : '');
  }
  function pct1(v) { return v == null ? '—' : v.toFixed(1) + '%'; }
  // 🆕10/1 Naoto「時間帯別の的中率・回収率」＝区分ごとに分けた成績の表（グレード・チャレンジ・ガールズもあとで同じ表に足す）
  //   keyOf(行)→区分の名前（null＝数えない）。order＝表の並び
  var WAKU_NAME = { 'モ': 'モーニング', 'デ': 'デイ', 'ナ': 'ナイター', 'ミ': 'ミッド' };
  function hitBy(ym, who, keyOf, order) {
    var by = {};
    ((st.hits || {})[ym] || []).forEach(function (r) {
      if (r[H.who] !== who) return;
      var k = keyOf(r);
      if (!k) return;
      var s = by[k] || (by[k] = { settled: 0, hit: 0, inv: 0, ref: 0 });
      s.settled += r[H.settled]; s.hit += r[H.hit]; s.inv += r[H.inv]; s.ref += r[H.ref];
    });
    return order.filter(function (k) { return by[k] && by[k].settled; }).map(function (k) {
      var s = by[k];
      return { k: k, n: s.settled, rate: s.hit / s.settled * 100, back: s.inv ? s.ref / s.inv * 100 : null, hit: s.hit };
    });
  }
  function hitTable(title, note, rows) {
    if (!rows.length) return '';
    return '<div class="card s-brk s-hitby"><div class="s-k3-title">' + title + (note ? '<small>' + note + '</small>' : '') + '</div>' +
      '<div class="s-br s-br-head"><span></span><span>的中率</span><span>回収率</span><span>レース</span></div>' +
      rows.map(function (x) {
        return '<div class="s-br"><span>' + x.k + '</span><span class="num">' + pct1(x.rate) + '</span><span class="num">' + pct1(x.back) + '</span><span class="num">' + x.hit + '/' + x.n + '</span></div>';
      }).join('') + '</div>';
  }
  function wakuTable(ym, who) {
    var rows = hitBy(ym, who, function (r) { return WAKU_NAME[r[H.waku]] || null; }, ['モーニング', 'デイ', 'ナイター', 'ミッド']);
    // 時間帯が分からないレース（同じ日に同じ場で区分が2つある等）は表に入れない＝数を注記に出す
    var all = hitStats(ym, who), inT = rows.reduce(function (a, x) { return a + x.n; }, 0), miss = all ? all.settled - inT : 0;
    return hitTable('時間帯別の成績', '確定したレースだけ' + (miss > 0 ? '・時間帯の分からない' + miss + 'レースは入れていない' : ''), rows);
  }
  // 🆕10/1 Naoto「グレード・チャレンジ・ガールズの的中率・回収率」
  //   1レースは1つの行にだけ入れる＝ガールズ→チャレンジ→グレード（G3以上の開催）→それ以外の順に当てはめる
  //   （グレード開催の中のガールズのレースはガールズに入る）。区分＝競輪予想のレースDB（keirin.jp の公式の区分）
  function kindTable(ym, who) {
    var rows = ((st.hits || {})[ym] || []);
    if (!rows.length || rows[0].length <= H.g) return '';   // 前のデータ（G の列が無い）のときは出さない
    var hasKind = rows[0].length > H.kind;
    return hitTable('レースの種類別の成績', 'グレード＝G3以上の開催（その中のガールズはガールズに入れる）', hitBy(ym, who, function (r) {
      return hasKind && r[H.kind] ? r[H.kind] : r[H.g] === 'G' ? 'グレード' : 'それ以外';
    }, ['グレード', 'チャレンジ', 'ガールズ', 'それ以外']));
  }

  // ── 購入者数（9/30 Naoto③）＝人数だけ（名前は持っていない）。🔄同日 配信者にも本人分は見せる（本人のnoteから数えた本人の客の人数）＝GASが本人の行だけ返す ──
  function buyerOf(who, ym) { return (st.buyers || []).filter(function (r) { return r[0] === who && r[1] === ym; })[0] || null; }

  function head(d) {
    var months = (st.months || []).slice().reverse();
    return '<div class="title-row"><h1 class="screen-title">実績</h1>' + (window.PRESENCE ? PRESENCE.seg() : '') + '<span class="title-aside">' + (st.loading ? '読み込み中…' : d && d.asof ? u.mdShort(d.asof) + 'までのnote' : '') +
      ' <button type="button" class="link-btn" id="s-reload">最新にする</button></span></div>' +
      '<div class="s-pick"><select id="s-ym" class="date-input" aria-label="月">' + months.map(function (m) {
        return '<option value="' + m.ym + '"' + (m.ym === st.ym ? ' selected' : '') + '>' + m.ym.slice(0, 4) + '年' + u.monthLabel(m.ym) + '</option>';
      }).join('') + '</select>' +
      (st.mine ? '' : '<select id="s-who" class="date-input" aria-label="人"><option value="">全員</option>' + members().map(function (m) {
        return '<option value="' + u.esc(m.name) + '"' + (m.name === st.who ? ' selected' : '') + '>' + u.esc(m.name) + '</option>';
      }).join('') + '</select>') + '</div>';
  }

  // 🆕10/1 月ごとの数字（全員×直近6か月）＝PDFの「チーム全体（配信者別×月）」の表。［売上｜手取り｜出勤］で切り替え・金額は万円
  //   途中の月（noteのデータが月の途中まで）は列の見出しに「〜18日」
  function monthTable() {
    if (!st.all) return '';
    var K = st.mtKind || 'total';
    var yms = Object.keys(st.all).sort().slice(-6);
    var val = function (s) { return K === 'nd' ? s.nd : s[K]; };
    var fmt = function (v) { return K === 'nd' ? (v ? v + '' : '－') : (v ? u.man(v) : '－'); };
    var rows = members().map(function (m) {
      return { m: m, v: yms.map(function (ym) { var s = stats(st.all[ym], m.name, st.shift[ym] || null, ym); return s.arts || s.nd ? val(s) : 0; }) };
    }).filter(function (x) { return x.v.some(Boolean); });
    var team = yms.map(function (ym, i) {
      if (K !== 'nd') return rows.reduce(function (a, x) { return a + x.v[i]; }, 0);
      // 出勤のチーム計＝誰かが出た日（PDFと同じ）
      var days = {};
      rows.forEach(function (x) { var s = stats(st.all[ym], x.m.name, st.shift[ym] || null, ym); Object.keys(s.days).forEach(function (d) { days[d] = 1; }); });
      return Object.keys(days).length;
    });
    var head = function (ym) { var p = partialDay(ym); return '<span>' + u.monthLabel(ym) + (p ? '<small>〜' + p + '日</small>' : '') + '</span>'; };
    var cols = 'grid-template-columns:64px repeat(' + yms.length + ',1fr)';
    return '<div class="card s-mt"><div class="ch-title">月ごとの数字<small>' + (K === 'nd' ? '日' : '万円') + '</small>' +
      '<span class="seg seg-sm s-mt-seg" role="group" aria-label="中身">' + [['total', '売上'], ['net', '手取り'], ['nd', '出勤']].map(function (k) {
        return '<button type="button" data-mt="' + k[0] + '" aria-pressed="' + (K === k[0]) + '">' + k[1] + '</button>';
      }).join('') + '</span></div>' +
      '<div class="s-mt-row s-mt-head" style="' + cols + '"><span></span>' + yms.map(head).join('') + '</div>' +
      rows.map(function (x) {
        return '<div class="s-mt-row" style="' + cols + '"><span class="wa-who" style="--mc:' + colorOf(x.m.name) + '">' + u.esc(x.m.name) + '</span>' +
          x.v.map(function (v) { return '<span class="num">' + fmt(v) + '</span>'; }).join('') + '</div>';
      }).join('') +
      '<div class="s-mt-row is-sum" style="' + cols + '"><span>チーム計</span>' + team.map(function (v) { return '<span class="num">' + fmt(v) + '</span>'; }).join('') + '</div>' +
      (K === 'nd' ? '<p class="fresh s-note">出勤＝シフト（シートがある月）か、その枠の記事が売れた日。チーム計＝誰かが出た日</p>' : '') + '</div>';
  }

  // 全員＝人ごとに1行（押すとその人）
  function allView(d, shift) {
    var list = members().map(function (m) { return { m: m, s: stats(d.rows, m.name, shift, st.ym), p: st.all ? prevStats(m.name, st.ym) : null }; }).filter(function (x) { return x.s.arts || x.s.nd; });
    var sum = list.reduce(function (a, x) { a.total += x.s.total; a.net += x.s.net; if (x.p) { a.pt += x.p.total; a.pn += x.p.net; } return a; }, { total: 0, net: 0, pt: 0, pn: 0 });
    var hasPrev = !!(st.all && prevYm(st.ym));
    // 🆕10/1 Yへの半月報告（PDF）をアプリで置き換える準備＝PDFの「チーム全体」と同じ中身：前月比（途中の月は先月同期比）・出勤の昼夜の内訳・チーム計の前月比
    var dl = function (c, p) { return hasPrev && p ? '<small class="s-dl">' + (delta(c, p, 'pct') || '—') + '</small>' : ''; };
    return '<div class="card s-all"><div class="s-all-head"><span></span><span>売上</span><span>手取り</span><span>出勤</span><span>1出勤</span></div>' +
      list.map(function (x) {
        return '<button type="button" class="s-all-row" data-swho="' + u.esc(x.m.name) + '">' +
          '<span class="wa-who" style="--mc:' + colorOf(x.m.name) + '">' + u.esc(x.m.name) + '</span>' +
          '<span class="num">' + u.yen(x.s.total) + dl(x.s.total, x.p && x.p.total) + '</span><span class="num">' + u.yen(x.s.net) + dl(x.s.net, x.p && x.p.net) + '</span>' +
          '<span class="num">' + x.s.nd + '日<small class="s-dl">' + (x.s.nD || x.s.nN ? '昼' + x.s.nD + '/夜' + x.s.nN : '') + '</small></span>' +
          '<span class="num">' + (x.s.nd ? u.yen(x.s.total / x.s.nd) : '—') + (x.s.nd && x.p && x.p.nd ? dl(x.s.total / x.s.nd, x.p.total / x.p.nd) : '') + '</span></button>';
      }).join('') +
      '<div class="s-all-row is-sum"><span>合計</span><span class="num">' + u.yen(sum.total) + dl(sum.total, sum.pt) + '</span><span class="num">' + u.yen(sum.net) + dl(sum.net, sum.pn) + '</span><span></span><span></span></div>' +
      (hasPrev ? '<p class="fresh s-note">小さい数字＝' + deltaLabel(st.ym) + '（' + u.monthLabel(prevYm(st.ym)) + (partialDay(st.ym) ? 'の1〜' + partialDay(st.ym) + '日' : '') + 'と比べて）。出勤の昼/夜は両方出た日をそれぞれに数える</p>' : '') + '</div>' +
      monthTable() +
      // 的中率・回収率・購入者（9/30）。全員の表は管理者の画面だけ
      (st.all ? '<div class="card s-all"><div class="s-all-head"><span></span><span>的中率</span><span>回収率</span><span>購入者</span><span>リピート</span></div>' +
        list.map(function (x) {
          var h = hitStats(st.ym, x.m.name), b = buyerOf(x.m.name, st.ym), bp = prevYm(st.ym) ? buyerOf(x.m.name, prevYm(st.ym)) : null;
          return '<button type="button" class="s-all-row" data-swho="' + u.esc(x.m.name) + '">' +
            '<span class="wa-who" style="--mc:' + colorOf(x.m.name) + '">' + u.esc(x.m.name) + '</span>' +
            '<span class="num">' + (h ? pct1(h.rate) : '—') + '</span><span class="num">' + (h ? pct1(h.back) : '—') + '</span>' +
            '<span class="num">' + (b ? u.yen(b[2]) + '人' : '—') + '</span><span class="num">' + (b && bp ? Math.round(b[4] / bp[2] * 100) + '%' : '—') + '</span></button>';
        }).join('') + '<p class="fresh s-note">的中率・回収率＝配信コンソールの予想（8/14〜）。リピート＝先月買った人のうち今月も買った割合' +
        (partialDay(st.ym) ? '（今月は' + u.mdShort(st.asof) + 'までなので低めに出ます）' : '') + '</p></div>' : '') +
      // 全員の比較＝人ごとに1段ずつの小さなグラフ（同じ目盛り）。メンバーカラー6色は1枚に重ねると見分けにくい（赤⇔橙・黄⇔緑）ので段に分ける
      '<div class="card ch-card"><div class="ch-title">全員の比較<small>月ごとの売上（手数料の前）・目盛りは全員同じ</small></div><div id="ch-all">' + (st.all ? '' : '<p class="sub">読み込み中…</p>') + '</div></div>';
  }

  // ── グラフ（chart.js）。昼＝黄・夜＝藍（色の見分けは検査済み）・手数料＝灰 ──
  var DAY_C = '#c9a227', NIGHT_C = '#4f5aa8', FEE_C = '#cfcac0', G_C = '#23252a';
  // 全部の月（グラフ用）を1回だけ読む。出勤日数のため、シートがある月のシフトも読む
  function loadAll() {
    if (st.all || st.allLoading) return;
    st.allLoading = true;
    API.sales('all').then(function (d) {
      st.all = d.all; st.hits = d.hits || {}; st.buyers = d.buyers || [];
      var have = (((SHIFT.state().data || {}).months) || []).map(function (m) { return m.ym; });
      var need = Object.keys(d.all).filter(function (ym) { return st.shift[ym] === undefined && have.indexOf(ym) >= 0; });
      return Promise.all(need.map(function (ym) {
        return API.shift(ym).then(function (s) { st.shift[ym] = s.rows && !s.namesHidden ? s : null; }, function () { st.shift[ym] = null; });
      }));
    }).catch(function () { st.allErr = true; }).then(function () { st.allLoading = false; draw(); });
  }
  function trend(who) {
    return Object.keys(st.all).sort().map(function (ym) { return { ym: ym, s: stats(st.all[ym], who, st.shift[ym] || null, ym) }; });
  }
  function monthTip(ym) { return u.monthLabel(ym) + (st.asof && st.asof.slice(0, 7) === ym ? '（' + u.mdShort(st.asof) + 'まで）' : ''); }

  function drawCharts(el, d) {
    var box = function (id) { return el.querySelector('#' + id); };
    if (st.who) {
      var who = st.who, mine = d.rows.filter(function (r) { return r[C.who] === who; });
      var n = u.daysIn(st.ym), cols = [];
      for (var day = 1; day <= n; day++) {
        var rs = mine.filter(function (r) { return r[C.day] === day; });
        var dv = 0, nv = 0, g = false;
        rs.forEach(function (r) { var v = r[C.gross] + r[C.tip]; if (r[C.slot] === '昼') dv += v; else nv += v; if (r[C.g]) g = true; });
        var date = dateOf(st.ym, day);
        cols.push({ tick: [1, 5, 10, 15, 20, 25, 30].indexOf(day) >= 0 ? String(day) : '', mark: g ? G_C : null,
          segs: [{ v: dv, color: DAY_C }, { v: nv, color: NIGHT_C }],
          tip: '<b>' + u.md(date) + '</b>' + (dv + nv ? (dv ? '<br>昼 ' + yen(dv) : '') + (nv ? '<br>夜 ' + yen(nv) : '') + (g ? '<br>グレードあり' : '') : '<br>売上なし') });
      }
      CHART.columns(box('ch-day'), cols, { title: '日ごとの売上', legend: [{ name: '昼', color: DAY_C }, { name: '夜', color: NIGHT_C }, { name: 'グレードの記事がある日', color: G_C, dot: true }] });
      if (!st.all) { if (st.allErr) box('ch-mon').innerHTML = '<p class="sub">読み込めませんでした</p>'; else loadAll(); return; }
      var tr = trend(who), mc = colorOf(who);
      CHART.columns(box('ch-mon'), tr.map(function (x) {
        return { tick: u.monthLabel(x.ym), segs: [{ v: x.s.net, color: mc }, { v: x.s.fee, color: FEE_C }],
          tip: '<b>' + monthTip(x.ym) + '</b><br>売上 ' + yen(x.s.total) + '<br>手取り ' + yen(x.s.net) + '<br>出勤 ' + x.s.nd + '日' };
      }), { title: '月ごとの売上', legend: [{ name: '手取り', color: mc }, { name: '手数料（積むと売上）', color: FEE_C }] });
      CHART.lines(box('ch-per'), tr.map(function (x) { return u.monthLabel(x.ym); }), [
        { name: '昼', color: DAY_C, values: tr.map(function (x) { return x.s.nD ? Math.round(x.s.by['昼'] / x.s.nD) : null; }) },
        { name: '夜', color: NIGHT_C, values: tr.map(function (x) { return x.s.nN ? Math.round(x.s.by['夜'] / x.s.nN) : null; }) }
      ], { title: '1出勤あたり', tips: tr.map(function (x) {
        return '<b>' + monthTip(x.ym) + '</b><br>昼 ' + per(x.s.by['昼'], x.s.nD) + '（' + x.s.nD + '日）<br>夜 ' + per(x.s.by['夜'], x.s.nN) + '（' + x.s.nN + '日）';
      }) });
      return;
    }
    // 全員の比較
    var all = box('ch-all');
    if (!st.all) { if (st.allErr) all.innerHTML = '<p class="sub">読み込めませんでした</p>'; else loadAll(); return; }
    var rowsBy = members().map(function (m) { return { m: m, tr: trend(m.name) }; }).filter(function (x) { return x.tr.some(function (t) { return t.s.total; }); });
    var max = Math.max.apply(null, rowsBy.map(function (x) { return Math.max.apply(null, x.tr.map(function (t) { return t.s.total; })); }).concat([0]));
    all.innerHTML = rowsBy.map(function (x, i) {
      var last = x.tr[x.tr.length - 1];
      return '<div class="sm-row"><div class="sm-head"><span class="wa-who" style="--mc:' + colorOf(x.m.name) + '">' + u.esc(x.m.name) + '</span>' +
        '<small>' + monthTip(last.ym) + ' ' + yen(last.s.total) + '</small></div><div id="sm-' + i + '"></div></div>';
    }).join('');
    rowsBy.forEach(function (x, i) {
      CHART.columns(all.querySelector('#sm-' + i), x.tr.map(function (t) {
        return { tick: u.monthLabel(t.ym), segs: [{ v: t.s.total, color: colorOf(x.m.name) }],
          tip: '<b>' + u.esc(x.m.name) + ' ' + monthTip(t.ym) + '</b><br>売上 ' + yen(t.s.total) + '<br>出勤 ' + t.s.nd + '日' };
      }), { h: 86, max: max, title: x.m.name + 'の月ごとの売上' });
    });
  }

  // 個人＝数字のまとめ＋昼・夜・グレード＋記事ごと（1日が上・その日の中はモ→デ→ナ→ミ）
  function oneView(d, shift, who) {
    var s = stats(d.rows, who, shift, st.ym);
    var mine = d.rows.filter(function (r) { return r[C.who] === who; });
    var byDay = {};
    mine.forEach(function (r) { (byDay[r[C.day]] = byDay[r[C.day]] || []).push(r); });
    // 1日が上（9/30 Naoto）＝上の「日ごとの売上」グラフ（左が1日）と向きをそろえる
    var days = Object.keys(byDay).map(Number).sort(function (a, b) { return a - b; });
    var line = function (label, cls, v, n) {
      return '<div class="s-br"><span class="lg ' + cls + '">' + label + '</span><span class="num">' + yen(v) + '</span><span class="num">' + n + '日</span><span class="num">' + per(v, n) + '</span></div>';
    };
    var p = st.all ? prevStats(who, st.ym) : null;
    var dl = function (html) { return html ? '<small class="s-dl">' + deltaLabel(st.ym) + ' ' + html + '</small>' : ''; };
    var hs = st.all ? hitStats(st.ym, who) : null;
    // 予想データが月の途中まで（例：9/29まで）なら、先月もその日までで比べる
    var hPart = hs && hs.last < u.daysIn(st.ym);
    var hp = hs && prevYm(st.ym) ? hitStats(prevYm(st.ym), who, hPart ? hs.last : undefined) : null;
    var dlH = function (html) { return html ? '<small class="s-dl">' + (hPart ? '先月同期比' : '先月比') + ' ' + html + '</small>' : ''; };
    var b = st.all ? buyerOf(who, st.ym) : null, bp = b && prevYm(st.ym) ? buyerOf(who, prevYm(st.ym)) : null;
    var firstMonth = Object.keys(st.all || {}).sort()[0] === st.ym;
    // 購入者の前月比（9/30 Naoto「新規・リピート・ヘビーも前月比」）。月単位でしか数えていないので、途中までの月は比べない。
    //   データの始まりの月（2月）と比べる月も出さない（2月は全員が新規＝比べる意味がない）
    var bOk = b && bp && !partialDay(st.ym) && prevYm(st.ym) !== Object.keys(st.all || {}).sort()[0];
    var bpp = bOk && prevYm(prevYm(st.ym)) ? buyerOf(who, prevYm(prevYm(st.ym))) : null;
    var rep = b && bp ? b[4] / bp[2] * 100 : null, repPrev = bp && bpp ? bp[4] / bpp[2] * 100 : null;
    return '<div class="card s-kpi" style="--mc:' + colorOf(who) + '">' +
      '<div class="s-k"><small>売上（手数料の前）</small><b class="num">' + yen(s.total) + '</b>' + (s.tip ? '<small>うちチップ ' + yen(s.tip) + '</small>' : '') + dl(p && delta(s.total, p.total, 'pct')) + '</div>' +
      '<div class="s-k"><small>手取り（手数料の後）</small><b class="num">' + yen(s.net) + '</b><small>手数料 ' + yen(s.fee) + '</small>' + dl(p && delta(s.net, p.net, 'pct')) + '</div>' +
      '<div class="s-k"><small>出勤日数</small><b class="num">' + s.nd + '日</b><small>昼' + s.nD + '・夜' + s.nN + '・G' + s.nG + '</small>' + dl(p && delta(s.nd, p.nd, 'day')) + '</div>' +
      '<div class="s-k"><small>1出勤あたり</small><b class="num">' + per(s.total, s.nd) + '</b>' + dl(p && s.nd && p.nd && delta(s.total / s.nd, p.total / p.nd, 'pct')) + '</div>' +
      // 🔄10/1 Yの要望「1記事あたりの売上」＝売上（チップ込み）÷売れた記事の本数（0件の記事は明細に無い＝確認した範囲では出した記事とほぼ同じ）
      '<div class="s-k"><small>記事</small><b class="num">' + u.yen(s.arts) + '本</b><small>' + u.yen(s.n) + '件売れた</small>' + dl(p && delta(s.arts, p.arts, 'pct')) + '</div>' +
      '<div class="s-k"><small>1記事あたり</small><b class="num">' + per(s.total, s.arts) + '</b><small>' + (s.arts ? (s.n / s.arts).toFixed(1) + '件/本' : '') + '</small>' + dl(p && s.arts && p.arts && delta(s.total / s.arts, p.total / p.arts, 'pct')) + '</div></div>' +
      // 予想の成績（配信コンソールの予想・8/14〜）
      // 🔄10/1 Yの要望＝note回収率を足して2×2（上＝全部の予想／下＝note記事だけ）
      '<div class="card s-kpi s-kpi3 s-kpi2x2" style="--mc:' + colorOf(who) + '"><div class="s-k3-title">予想の成績<small>配信コンソールの予想' + hitRangeLabel(st.ym) + '</small></div>' +
      (hs ? '<div class="s-k"><small>的中率</small><b class="num">' + pct1(hs.rate) + '</b><small>' + hs.hit + '/' + hs.settled + 'レース</small>' + dlH(hp && delta(hs.rate, hp.rate, 'pt')) + '</div>' +
        '<div class="s-k"><small>回収率</small><b class="num">' + pct1(hs.back) + '</b><small>回収 ' + yen(hs.ref) + '</small>' + dlH(hp && delta(hs.back, hp.back, 'pt')) + '</div>' +
        '<div class="s-k"><small>note記事の的中率</small><b class="num">' + pct1(hs.nRate) + '</b><small>' + hs.nHit + '/' + hs.nSettled + 'レース</small>' + dlH(hp && delta(hs.nRate, hp.nRate, 'pt')) + '</div>' +
        '<div class="s-k"><small>note記事の回収率</small><b class="num">' + pct1(hs.nBack) + '</b><small>回収 ' + yen(hs.nRef) + '</small>' + dlH(hp && delta(hs.nBack, hp.nBack, 'pt')) + '</div>'
        : '<p class="sub">' + (st.all ? 'この月の予想データはありません（8/14から）' : '読み込み中…') + '</p>') + '</div>' +
      (hs ? kindTable(st.ym, who) + wakuTable(st.ym, who) : '') +
      // 購入者数（配信者には本人分だけ）
      (st.all ? '<div class="card s-kpi s-kpi3 s-kpi2x2" style="--mc:' + colorOf(who) + '"><div class="s-k3-title">買ってくれた人<small>人数だけ（名前は持っていません）</small></div>' +
        (b ? '<div class="s-k"><small>購入者</small><b class="num">' + u.yen(b[2]) + '人</b><small>この月に買った人</small>' + (partialDay(st.ym) ? '<small>' + u.mdShort(st.asof) + 'まで</small>' : dl(bp && delta(b[2], bp[2], 'pct'))) + '</div>' +
          '<div class="s-k"><small>新規</small><b class="num">' + (firstMonth ? '—' : u.yen(b[3]) + '人') + '</b><small>' + (firstMonth ? 'データの始まりの月' : 'はじめて買った人') + '</small>' + dl(bOk && delta(b[3], bp[3], 'pct')) + '</div>' +
          '<div class="s-k"><small>リピート客</small><b class="num">' + (firstMonth ? '—' : u.yen(b[4]) + '人') + '</b><small>' + (bp && !firstMonth ? '先月の' + u.yen(bp[2]) + '人のうち' + Math.round(rep) + '%' : '前の月も買った人') + '</small>' +
            (bOk && repPrev != null ? '<small class="s-dl">率の先月比 ' + delta(rep, repPrev, 'pt') + '</small>' : '') + '</div>' +
          // 🔄9/30 Naoto「ヘビーは太客の方がいい」
          '<div class="s-k"><small>太客</small><b class="num">' + u.yen(b[5]) + '人</b><small>この月に10本以上</small>' + dl(bOk && delta(b[5], bp[5], 'pct')) + '</div>'
          : '<p class="sub">この月の購入者データはありません</p>') + '</div>' : '') +
      '<div class="card s-brk"><div class="s-br s-br-head"><span></span><span>売上</span><span>出勤</span><span>1出勤あたり</span></div>' +
      line('昼', 'lg-day', s.by['昼'], s.nD) + line('夜', 'lg-night', s.by['夜'], s.nN) + line('G', 'gb gb-day', s.by.G, s.nG) + '</div>' +
      '<div class="card ch-card"><div class="ch-title">日ごとの売上<small>' + u.monthLabel(st.ym) + '・押すと金額</small></div><div id="ch-day"></div></div>' +
      '<div class="card ch-card"><div class="ch-title">月ごとの売上</div><div id="ch-mon">' + (st.all ? '' : '<p class="sub">読み込み中…</p>') + '</div></div>' +
      '<div class="card ch-card"><div class="ch-title">1出勤あたりの売上<small>昼・夜</small></div><div id="ch-per">' + (st.all ? '' : '<p class="sub">読み込み中…</p>') + '</div></div>' +
      '<div class="card s-arts">' + (days.length ? days.map(function (day) {
        var date = dateOf(st.ym, day);
        // 並び＝発走が早い順（9/30 Naoto）＝モーニング→デイ→ナイター→ミッド。同じ区分の中は場の名前順（シフトの詳細と同じ）
        var rs = byDay[day].sort(function (a, b) { return (wakuRank(a) - wakuRank(b)) || (a[C.place] < b[C.place] ? -1 : a[C.place] > b[C.place] ? 1 : 0) || b[C.gross] - a[C.gross]; });
        var dayTot = rs.reduce(function (a, r) { return a + r[C.gross] + r[C.tip]; }, 0);
        return '<div class="s-day"><div class="s-day-head"><b class="' + dayClass(date) + '">' + u.md(date) + '</b><span class="num">' + yen(dayTot) + '</span></div>' +
          rs.map(function (r) {
            // 札＝開催区分の色（シフトの詳細の場の札と同じ・9/30 Naoto「バッジは色分け」）。区分が分からない記事だけ昼・夜の札
            return '<div class="s-art">' + (KC[r[C.waku]] ? '<span class="kb ' + KC[r[C.waku]] + '" title="' + WAKU[r[C.waku]] + '">' + r[C.waku] + '</span>'
              : '<span class="lg ' + (r[C.slot] === '昼' ? 'lg-day' : 'lg-night') + '">' + r[C.slot] + '</span>') +
              '<span class="s-art-t"><b>' + u.esc(r[C.place] || '—') + (r[C.g] ? ' <i class="gb ' + (r[C.slot] === '夜' ? 'gb-night' : 'gb-day') + '">G</i>' : '') + ' <small>' + u.esc(String(r[C.races] || '')) + 'R</small></b>' +
              '<small class="s-art-full">' + u.esc(r[C.title]) + '</small></span>' +
              '<span class="s-art-n num">' + r[C.n] + '件</span><span class="s-art-v num">' + u.yen(r[C.gross] + r[C.tip]) + (r[C.tip] ? '<small>チップ' + u.yen(r[C.tip]) + '</small>' : '') + '</span></div>';
          }).join('') + '</div>';
      }).join('') : '<p class="sub">この月の記事はありません。</p>') + '</div>';
  }

  function draw() {
    if (APP.current() !== 'stats') return;
    if (window.PRESENCE && PRESENCE.active()) return;   // 出演を見ている間に売上の読み込みが終わっても上書きしない（10/1）
    var el = document.getElementById('view');
    var d = st.data[st.ym];
    if (st.err === 'notyet') {
      el.innerHTML = '<h1 class="screen-title">実績</h1><div class="card"><span class="pill dim" style="justify-self:start">準備中</span>' +
        '<p>自分のnote売上と的中率・回収率を見られるようになります（本人の分だけ）。</p></div>';
      return;
    }
    if (st.months && !st.months.length) {
      el.innerHTML = '<h1 class="screen-title">実績</h1><div class="card"><p>まだnoteの売上データがありません。</p></div>'; return;
    }
    if (!d) {
      el.innerHTML = head(null) + '<p class="sub">' + (st.err ? 'つながりませんでした。「最新にする」を押してください' : '読み込んでいます…') + '</p>';
      bind(el); return;
    }
    var shift = st.shift[st.ym];
    // 注記。配信者には収支表（Yの集計）の話を出さない
    el.innerHTML = head(d) + (st.who ? oneView(d, shift, st.who) : allView(d, shift)) +
      '<p class="fresh">月＝レースの日の月' + (st.mine ? '（月末に前売りで売れた記事は、レースの日の月に入ります）' : '（収支表は決済日の月なので、月末の前売り分だけずれます）') + '。出勤日数＝' +
      (shift ? 'シフト（実際に出た人）' : (st.mine ? 'その枠の記事が売れた日で数えています' : 'この月はシフト表が無いので、その枠の記事が売れた日')) +
      (d.asof && d.asof.slice(0, 7) === st.ym ? '。この月はnoteのデータが' + u.mdShort(d.asof) + 'までなので、出勤もその日まで数えています' : '') +
      '。手数料は決済方法ごとの推定' + (st.mine ? '（実際の入金と少しずれることがあります）' : '（収支表と±0.3%）') + '。</p>';
    bind(el);
    drawCharts(el, d);
  }

  function bind(el) {
    var ym = el.querySelector('#s-ym'), who = el.querySelector('#s-who'), rl = el.querySelector('#s-reload');
    if (ym) ym.addEventListener('change', function () { st.ym = ym.value; if (st.data[st.ym]) draw(); else load(st.ym); });
    if (who) who.addEventListener('change', function () { st.who = who.value; draw(); window.scrollTo(0, 0); });
    if (rl) rl.addEventListener('click', function () { if (st.loading) return; delete st.data[st.ym]; delete st.shift[st.ym]; st.all = null; st.allErr = false; load(st.ym); });
    el.querySelectorAll('[data-mt]').forEach(function (b) { b.addEventListener('click', function () { st.mtKind = b.dataset.mt; draw(); }); });
    el.querySelectorAll('[data-swho]').forEach(function (b) { b.addEventListener('click', function () { st.who = b.dataset.swho; draw(); window.scrollTo(0, 0); }); });
  }

  return {
    // 🔄9/30 全員がこの画面に来る。見せてよいかはGASが決める（だめなら notyet＝準備中の案内）
    can: function (me) { return !!me; },
    render: function () { if (!st.ym && !st.loading && !st.err) load(''); else draw(); }
  };
})();
