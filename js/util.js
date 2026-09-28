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
    // 日本の祝日 { 'YYYY-MM-DD': '祝日名' }（9/29 Naoto「祝日も日付は赤字に」）
    //   現行の祝日法どおりに計算：固定日・ハッピーマンデー・春分/秋分（1980〜2099の近似式）・
    //   振替休日（日曜の祝日→次の平日）・国民の休日（祝日に挟まれた平日）。法改正があればここを直す
    holidays: (() => {
      const cache = {};
      const nthMon = (y, m, n) => { const d = new Date(y, m - 1, 1); const off = (8 - d.getDay()) % 7; return 1 + off + (n - 1) * 7; };
      return (y) => {
        if (cache[y]) return cache[y];
        const h = {};
        const put = (m, d, name) => { h[`${y}-${pad(m)}-${pad(d)}`] = name; };
        const k = y - 1980;
        put(1, 1, '元日');
        put(1, nthMon(y, 1, 2), '成人の日');
        put(2, 11, '建国記念の日');
        put(2, 23, '天皇誕生日');
        put(3, Math.floor(20.8431 + 0.242194 * k - Math.floor(k / 4)), '春分の日');
        put(4, 29, '昭和の日');
        put(5, 3, '憲法記念日'); put(5, 4, 'みどりの日'); put(5, 5, 'こどもの日');
        put(7, nthMon(y, 7, 3), '海の日');
        put(8, 11, '山の日');
        put(9, nthMon(y, 9, 3), '敬老の日');
        put(9, Math.floor(23.2488 + 0.242194 * k - Math.floor(k / 4)), '秋分の日');
        put(10, nthMon(y, 10, 2), 'スポーツの日');
        put(11, 3, '文化の日');
        put(11, 23, '勤労感謝の日');
        // 国民の休日：前日と翌日が祝日の平日（例 2026-09-22）
        Object.keys(h).forEach((s) => {
          const d = parse(s); d.setDate(d.getDate() + 2);
          const mid = new Date(d); mid.setDate(mid.getDate() - 1);
          if (h[ymd(d)] && !h[ymd(mid)] && mid.getDay() !== 0) h[ymd(mid)] = '国民の休日';
        });
        // 振替休日：日曜の祝日のあと、最初の祝日でない日
        Object.keys(h).sort().forEach((s) => {
          const d = parse(s);
          if (d.getDay() !== 0 || h[s] === '振替休日') return;
          do { d.setDate(d.getDate() + 1); } while (h[ymd(d)]);
          h[ymd(d)] = '振替休日';
        });
        return (cache[y] = h);
      };
    })(),
    holidayOf: (s) => OKL.u.holidays(+s.slice(0, 4))[s] || '',
    // 塗りの上の字の色：明るい色（黄など）は黒字、それ以外は白字（メンバーカラーの札で使う）
    inkOn: (hex) => {
      const n = parseInt(String(hex).slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
      return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#23252a' : '#ffffff';
    },
    // ── 休み希望の読み書き（9/29 Naoto「他→半・表示順は休→半→撮影・半休は1日を4分割してどこがNGか」）──
    //   4分割＝開催区分（モーニング・デイ・ナイター・ミッド）。昼の枠＝モ・デ／夜の枠＝ナ・ミ
    //   シートに書く形＝「半（モ・デNG）」。🔴「休」の字を入れない（シートの紫の警告は /休|撮影/ で判定＝半休が休扱いになる）
    //   前からある「ミッドのみ」のような「〇〇のみ」は、それ以外の3つがNGの半休として読む
    Q4: ['モーニング', 'デイ', 'ナイター', 'ミッド'],
    Q4S: ['モ', 'デ', 'ナ', 'ミ'],
    wishInfo: (v) => {
      v = String(v || '').trim();
      if (!v) return null;
      if (/撮影/.test(v)) return { k: 'shoot', label: '撮影' };
      if (/休/.test(v) && !/^半/.test(v)) return { k: 'off', label: '休' };
      const S = OKL.u.Q4S, F = OKL.u.Q4;
      let ng = null;
      const m = /^半（(.*)NG）$/.exec(v);
      if (m) ng = S.map((s, i) => m[1].indexOf(s) >= 0 ? i : -1).filter((i) => i >= 0);
      const only = /^(モーニング|デイ|昼間|ナイター|ミッド|ミッドナイト)のみ$/.exec(v);
      if (only) { const i = { モーニング: 0, デイ: 1, 昼間: 1, ナイター: 2, ミッド: 3, ミッドナイト: 3 }[only[1]]; ng = [0, 1, 2, 3].filter((x) => x !== i); }
      return { k: 'half', ng, label: ng ? '半 ' + ng.map((i) => S[i]).join('・') + 'NG' : '半 ' + v, raw: v };
    },
    wishText: (ng) => ng && ng.length ? '半（' + ng.slice().sort().map((i) => OKL.u.Q4S[i]).join('・') + 'NG）' : '',
    WISH_ORDER: { off: 0, half: 1, shoot: 2 },
    // 同じ種から毎回同じ乱数（サンプルを安定させる）
    rng: (seed) => () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
})();
