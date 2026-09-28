/* util.js — 日付・金額・文字の小道具（画面側はここだけを使う） */
(function () {
  const OKL = (window.OKL = window.OKL || {});
  const DOW = ['日', '月', '火', '水', '木', '金', '土'];

  const pad = (n) => String(n).padStart(2, '0');

  // 'YYYY-MM-DD' ⇔ Date（ローカル時刻で扱う＝UTCずれを起こさない）
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const ymd = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

  OKL.u = {
    pad,
    parse,
    ymd,
    DOW,
    dow: (s) => parse(s).getDay(),
    daysIn: (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); },
    ymOf: (s) => s.slice(0, 7),
    addMonth: (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; },
    monthLabel: (ym) => `${Number(ym.slice(5, 7))}月`,
    // 9/29（火）
    md: (s) => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}（${DOW[d.getDay()]}）`; },
    mdShort: (s) => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; },
    daysBetween: (a, b) => Math.round((parse(b) - parse(a)) / 86400000),
    yen: (n) => Math.round(n).toLocaleString('ja-JP'),
    man: (n) => (n / 10000).toFixed(1),
    pct: (n) => (n * 100).toFixed(1),
    esc: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    // 9/29 14:02
    stamp: (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; },
    // 同じ種から毎回同じ乱数（サンプルを安定させる）
    rng: (seed) => () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
})();
