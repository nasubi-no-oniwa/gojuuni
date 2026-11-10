// ごジュウに：銃身の形から弾の飛び方を決める（ゲームと確認用の両方で使う）
// 長さはメートル、時間は秒。撃つ人は原点に立って -Z（的のほう）を向く。X は右、Y は上
// 銃身の点は [前, 上, 右] の3つの数（横から描くと前と上、上から描くと前と右が決まる）
export const L = 12;                 // 的までの距離（的の紙は z=-L）
export const MUZ = [0, 1.35, -0.45]; // 銃の口（銃身はここから描く）
export const INK = 5.5;              // 描けるインクの長さ
export const STEP = 0.04;            // 線の点の間隔
export const MAXB = 32;              // 1発あたりの弾の数の上限
export const MAXSHOT = 10;           // 撃てる数
export const TESTWIN = 12;           // 試し撃ちで引き金を押せる時間（秒）
export const AIMMAX = 0.5;           // 自動でねらいを直せる角度（ラジアン、約29度）
export const V0 = 16, VMAX = 48, VIS = 0.16, G = 5;
export const XMAX = 1.6;             // 紙の的が動ける幅（室内のせまいレーン）
// 持ち方：銃の口の位置と、銃の向き（y0=π は後ろ向き）
export const GRIPS = [{ o: [0, 1.35, -0.45], y0: 0 }, { o: [0, 2.05, -0.3], y0: 0 }, { o: [0, 0.5, -0.32], y0: 0 }, { o: [0, 1.45, 0.38], y0: Math.PI }];
export const HANDX = 0.2;            // 2丁のとき、右手は +0.2、左手は -0.2
export const WF = [0.55, 1, 1.6, 2.4], WINK = [0.6, 1, 1.6, 2.4], WACC = [9, 5, 1, -2]; // 太さ：弾の大きさ・インク・加速
export const PARTS = ['sp', 'ic', 'pw', 'cl', 'ho'], MAXPART = 8, WALK = 2.2, SXMAX = 1.6;
export function originOf(grip, hand, two, sx) { const g = GRIPS[grip || 0]; return [(sx || 0) + (two ? (hand ? -HANDX : HANDX) : 0), g.o[1], g.o[2]]; }
const TAU = Math.PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dist = (a, b) => len3(sub(a, b));
const P3 = q => [q[0], q[1], q[2] || 0];

// ===== 線のデータ（cm の整数で持つ。作った人と遊ぶ人で同じ数字になる） =====
export function encode(strokes) {
  return strokes.map(s => (s.at ? s.at[0] + '.' + s.at[1] : '') + (s.w != null && s.w !== 1 ? '~' + s.w : '') + ':' + s.p.map(q => Math.round(q[0] * 100) + ',' + Math.round(q[1] * 100) + (Math.round((q[2] || 0) * 100) ? ',' + Math.round(q[2] * 100) : '')).join(' ')).join(';');
}
export function decode(str) {
  if (!str) return [];
  const out = [];
  for (const part of String(str).split(';')) {
    const i = part.indexOf(':'); if (i < 0) continue;
    const hh = part.slice(0, i), body = part.slice(i + 1);
    const [h, ws] = hh.split('~'); const w = ws != null ? clamp(parseInt(ws, 10) || 0, 0, 3) : 1;
    const at = h ? h.split('.').map(x => parseInt(x, 10)) : null;
    const p = body.trim() ? body.trim().split(/\s+/).map(q => { const v = q.split(',').map(x => parseInt(x, 10) / 100); return [v[0], v[1], v[2] || 0]; }) : [];
    if (p.length >= 2 && p.every(q => isFinite(q[0]) && isFinite(q[1]) && isFinite(q[2]))) out.push({ at: at && at.length === 2 && isFinite(at[0]) && isFinite(at[1]) ? at : null, p, w });
  }
  return out;
}
export const roundTrip = s => decode(encode(s));
export const encParts = ps => (ps || []).map(q => q.k + '.' + q.i + '.' + q.t).join(',');
export const decParts = s => String(s || '').split(',').map(x => { const [k, i, t] = x.split('.'); return { k: parseInt(k, 10), i: parseInt(i, 10), t }; }).filter(q => isFinite(q.k) && isFinite(q.i) && PARTS.includes(q.t)).slice(0, MAXPART);
export const strokeLen = s => { let n = 0; for (let i = 1; i < s.p.length; i++) n += dist(P3(s.p[i]), P3(s.p[i - 1])); return n; };
export function inkUsed(strokes) { let n = 0; for (const s of strokes) n += strokeLen(s) * WINK[s.w != null ? s.w : 1]; return n; }

// 指で描いた点を、決まった間隔に並べなおして少しなめらかにする（角は残る程度）
export function tidy(raw0) {
  const raw = raw0.map(P3);
  if (raw.length < 2) return raw.slice();
  const out = [raw[0].slice()]; let acc = 0, prev = raw[0];
  for (let i = 1; i < raw.length; i++) {
    const cur = raw[i]; let seg = dist(cur, prev);
    while (acc + seg >= STEP) {
      const k = (STEP - acc) / seg; const q = add(prev, sub(cur, prev), k);
      out.push(q); prev = q; seg = dist(cur, prev); acc = 0;
    }
    acc += seg; prev = cur;
  }
  if (dist(out[out.length - 1], raw[raw.length - 1]) > STEP * 0.4) out.push(raw[raw.length - 1].slice());
  let p = out;
  for (let pass = 0; pass < 2; pass++) {
    const q = p.map(x => x.slice());
    for (let i = 1; i < p.length - 1; i++) for (let d = 0; d < 3; d++) q[i][d] = p[i - 1][d] * .25 + p[i][d] * .5 + p[i + 1][d] * .25;
    p = q;
  }
  return p;
}

// ===== 銃身の中を弾が通る =====
// 点 i での曲がり：回る軸×角度（ベクトル）
function turnV(p, i) {
  if (i <= 0 || i >= p.length - 1) return [0, 0, 0];
  const t1 = sub(p[i], p[i - 1]), t2 = sub(p[i + 1], p[i]);
  const l1 = len3(t1), l2 = len3(t2); if (l1 < 1e-6 || l2 < 1e-6) return [0, 0, 0];
  const c = cross(t1, t2), cl = len3(c), ang = Math.atan2(cl, dot(t1, t2));
  if (cl < 1e-9) return ang > 3 ? [0, 0, ang] : [0, 0, 0];
  return [c[0] / cl * ang, c[1] / cl * ang, c[2] / cl * ang];
}
function strokeFeatures(p0) {
  const p = p0.map(P3), n = p.length; let len = 0;
  for (let i = 1; i < n; i++) len += dist(p[i], p[i - 1]);
  const tv = []; for (let i = 0; i < n; i++) tv.push(turnV(p, i));
  let T = [0, 0, 0], abs = 0; for (const v of tv) { T = add(T, v); abs += len3(v); }
  const ax = len3(T) > 1e-6 ? norm(T) : [0, 0, 1];
  const sgn = tv.map(v => dot(v, ax));
  const tot = sgn.reduce((a, b) => a + b, 0);
  // 出口のクセ（最後の 0.36m の曲がり）
  let ke = [0, 0, 0], kl = 0; for (let i = n - 2; i >= 1 && kl < 0.36; i--) { ke = add(ke, tv[i]); kl += dist(p[i + 1], p[i]); }
  const kmag = kl > 0.1 ? len3(ke) / kl : 0, kax = len3(ke) > 1e-6 ? norm(ke) : [0, 0, 1];
  // 波（曲がる向きが何回も入れかわる）
  const smv = tv.map((v, i) => add(add([0, 0, 0], tv[i - 1] || [0, 0, 0], .25), add(v, tv[i + 1] || [0, 0, 0], .25 / .5), .5));
  let alt = 0, ref = null, run = 0;
  for (const v of smv) { const m = len3(v); if (m < 1e-4) continue; const d = norm(v); if (!ref) { ref = d; run = m; continue; } if (dot(d, ref) >= 0) run += m; else { if (run > 0.3) alt++; ref = d; run = m; } }
  if (run > 0.3) alt++;
  let wave = null;
  if (alt >= 4 && abs < TAU * 3.2) {
    const a0 = p[0], ch = norm(sub(p[n - 1], a0)); let dev = 0, best = 0, bdir = [0, 1, 0];
    for (const q of p) { const r = sub(q, a0); const dv = sub(r, [ch[0] * dot(r, ch), ch[1] * dot(r, ch), ch[2] * dot(r, ch)]); const m = len3(dv); dev += m; if (m > best) { best = m; bdir = norm(dv); } }
    dev /= n; wave = { A: clamp(dev * 0.9, 0.12, 0.6), lam: clamp(2 * len / alt, 0.7, 3.2), dir: bdir };
  }
  // 渦巻き（同じ向きに巻きながら、中心からの距離がどんどん変わる）
  let spiral = null; const oneSide = abs > 0 ? Math.abs(tot) / abs : 0;
  if (Math.abs(tot) > TAU * 1.25 && oneSide > 0.6 && n > 30) {
    let m = [0, 0, 0]; for (const q of p) m = add(m, q, 1 / n);
    const t3 = Math.floor(n / 3); let r1 = 0, r3 = 0;
    for (let i = 0; i < t3; i++) r1 += dist(p[i], m);
    for (let i = n - t3; i < n; i++) r3 += dist(p[i], m);
    const ratio = (r1 + 1e-6) / (r3 + 1e-6);
    if (ratio > 1.8 || ratio < 0.55) { const turns = Math.abs(tot) / TAU; spiral = { R: clamp(0.12 * turns, 0.15, 0.7), f: 1.2 + 0.4 * turns, dir: Math.sign(tot) || 1, ax }; }
  }
  let mb = 0, mc = 0; for (const q of p) { mb = Math.max(mb, Math.abs(q[1])); mc = Math.max(mc, Math.abs(q[2])); }
  return { len, tot, abs, ax, sgn, kmag, kax, wave, spiral, corners: tv.filter(v => len3(v) > 0.6).length, twist: mb > 0.15 && mc > 0.15 };
}

// 銃身をしらべて、弾がどこからどう出るかを決める（銃の向きは関係ない、描いた形の上の話）
// parts：[{k,i,t}]（sp バネ・ic 氷・pw 火薬・cl 分身・ho 穴）
export function analyze(strokes0, parts0) {
  const strokes = strokes0 && strokes0.length ? strokes0 : [{ at: null, p: [[0, 0, 0], [0.1, 0, 0], [0.2, 0, 0]], w: 1 }];
  const S = strokes.map(s => ({ p: s.p.map(P3), at: s.at, w: s.w != null ? s.w : 1, kids: {}, parts: {} }));
  S.forEach((s, k) => { if (k > 0 && s.at && S[s.at[0]] && s.at[0] < k) { const pi = clamp(s.at[1], 0, S[s.at[0]].p.length - 1); (S[s.at[0]].kids[pi] = S[s.at[0]].kids[pi] || []).push(k); } });
  for (const q of parts0 || []) if (S[q.k] && q.i >= 0 && q.i < S[q.k].p.length) S[q.k].parts[q.i] = q.t;
  const F = S.map(s => strokeFeatures(s.p));
  const exits = [], inside = []; let jam = null, count = 1, loopsMax = 0;
  const queue = [{ k: 0, i: 0, v: V0, t: 0, sp: 0, hops: 0, dev: 0, path: [[...S[0].p[0], 0]] }];
  const near = (q, r, ex) => { for (let k = 0; k < S.length; k++) { const p = S[k].p; for (let i = 0; i < p.length; i++) { if (ex && ex(k, i)) continue; if (dist(p[i], q) < r) return [k, i]; } } return null; };
  const mkExit = (ex, b, f, w, loops, extra) => ({ ...ex, v: b.v, t: b.t, r: Math.max(0.022, 0.06 * WF[w] * Math.pow(0.8, b.sp)), kf: f.wave || f.spiral ? 0 : clamp(f.kmag * 0.04, 0, 0.1), kax: f.kax, wave: f.wave, spiral: f.spiral, gf: Math.max(0.35, 1 - 0.25 * loops), loops, ...(extra || {}) });
  const rotDev = (d, a) => { if (!a) return d; const c = Math.cos(a), s = Math.sin(a); return norm([d[0] * c - d[2] * s, d[1], d[0] * s + d[2] * c]); };
  let guard = 0;
  while (queue.length && guard++ < 300) {
    const b = queue.shift(); let { k, i, hops, path } = b; let p = S[k].p, f = F[k], cum = 0, loops = 0;
    const seen = b.seen || new Set();
    let done = false, steps = 0;
    while (!done && steps++ < 6000) {
      // パーツ（1つの弾につき1回だけ効く）
      const pt = S[k].parts[i], key = k + '.' + i;
      if (pt && !seen.has(key)) { seen.add(key);
        if (pt === 'sp') b.v = Math.min(VMAX, b.v + 12);
        else if (pt === 'ic') b.v *= 0.6;
        else if (pt === 'pw') b.v = Math.min(VMAX, b.v * 1.5 + 6);
        else if (pt === 'cl' && count < MAXB) { count++; queue.push({ ...b, k, i, dev: b.dev + 0.11, path: path.slice(), hops, seen: new Set(seen) }); b.dev -= 0.11; }
        else if (pt === 'ho' && count < MAXB) { count++; const tg = i + 1 < p.length ? norm(sub(p[i + 1], p[i])) : [1, 0, 0]; exits.push(mkExit({ p: p[i].slice(), d: norm([tg[0], tg[1] - 0.4, tg[2]]) }, { ...b, v: b.v * 0.3 + 2 }, { kmag: 0, kax: [0, 0, 1] }, 2, 0, { roll: 1, leak: 1 })); inside.push(path.slice()); b.v *= 0.85; }
      }
      // 枝分かれ（線の終わりにつながった線は、枝分かれではなく続き）
      const kids = S[k].kids[i]; let cont = null;
      if (kids) for (let n = 0; n < kids.length; n++) { const c = kids[n]; if (i === p.length - 1 && n === 0) { cont = c; continue; } if (count >= MAXB) break; count++; b.v *= 0.85; queue.push({ ...b, k: c, i: 0, sp: b.sp + 1, path: path.slice(), dev: b.dev, seen: new Set(seen) }); }
      if (i + 1 < p.length) {
        const ds = dist(p[i + 1], p[i]);
        const tvv = turnV(p, i), a = len3(tvv); cum += dot(tvv, f.ax);
        if (a > 0.44) b.v *= 1 - 0.55 * Math.min(1, (a - 0.44) / 2.2);
        b.v += WACC[S[k].w] * ds;
        const lp = Math.floor((Math.abs(cum) + 0.6) / TAU); if (lp > loops) { b.v += 9 * (lp - loops); loops = lp; }
        b.v = Math.min(b.v, VMAX); b.t += ds / (Math.max(b.v, 5) * VIS); i++; path.push([...p[i], b.t]);
        if (b.v < 5) { jam = { p: p[i].slice(), t: b.t }; done = true; break; }
        continue;
      }
      if (cont != null) { k = cont; i = 0; p = S[k].p; f = F[k]; continue; }
      // 線の終わり
      const end = p[p.length - 1];
      const own = p.length > 10 ? (() => { for (let j = 0; j < p.length - 9; j++) if (dist(p[j], end) < 0.1) return j; return -1; })() : -1;
      let ex = null;
      if (own >= 0) {
        // 出口がない：中を回り続けて速くなり、いちばん曲がりのきつい所から突き破る
        let lapLen = 0; for (let j = own + 1; j < p.length; j++) lapLen += dist(p[j], p[j - 1]);
        for (let lap = 0; lap < 3; lap++) { b.v = Math.min(VMAX, b.v + 10); const lt = lapLen / (b.v * VIS); b.t += lt; for (let j = own; j < p.length; j += 2) path.push([...p[j], b.t - lt * (1 - (j - own) / (p.length - own))]); }
        let m = own + 1, best = 0; for (let j = own + 1; j < p.length - 1; j++) { const a = len3(turnV(p, j)); if (a > best) { best = a; m = j; } }
        ex = { p: p[m].slice(), d: norm(sub(p[m + 1], p[m - 1])), burst: 1 };
        loops += 3;
      } else {
        const hit = hops < 3 ? near(end, 0.08, (kk, ii) => kk === k || (S[kk].at && S[kk].at[0] === k && ii < 5) || (S[k].at && kk === S[k].at[0] && Math.abs(ii - S[k].at[1]) < 5)) : null;
        if (hit) { k = hit[0]; i = hit[1]; p = S[k].p; f = F[k]; hops++; cum = 0; continue; } // ほかの銃身にぶつかって合流する
        const j = f.wave ? 0 : Math.max(0, p.length - 3);
        ex = { p: end.slice(), d: norm(sub(end, p[j])) };
      }
      ex.d = rotDev(ex.d, b.dev);
      loopsMax = Math.max(loopsMax, loops);
      exits.push(mkExit(ex, b, f, S[k].w, loops));
      inside.push(path);
      done = true;
    }
  }
  // 弾の順番：いちばん長く本体を通った弾を先頭に（ねらいはこの弾で合わせる）
  const len = F.reduce((a, f) => a + f.len, 0);
  const order = exits.map((e, i) => i).sort((x, y) => (exits[x].leak ? 1 : 0) - (exits[y].leak ? 1 : 0));
  return { exits: order.map(i => exits[i]), inside: order.map(i => inside[i]), jam, F, len, loops: loopsMax, count: exits.length };
}

// ===== 2つ名（形から自動でつける）：特ちょうの記号を返す。言葉は画面のほうで訳す =====
export function features(strokes, A) {
  A = A || analyze(strokes); const f = [];
  const b = A.count; if (b >= 7) f.push('b7'); else if (b >= 4) f.push('b4'); else if (b >= 2) f.push('b2');
  if (A.exits.some(e => e.burst)) f.push('cl');
  if (A.F.some(x => x.spiral)) f.push('sp');
  const lo = Math.max(0, ...A.exits.map(e => e.loops || 0)); if (lo >= 3) f.push('l3'); else if (lo >= 1) f.push('l1');
  if (A.F.some(x => x.twist)) f.push('tw');
  if (A.F.some(x => x.wave)) f.push('wv');
  if (A.F.reduce((a, x) => a + x.corners, 0) >= 6) f.push('cn');
  if (A.exits.some(e => e.d[1] > 0.7)) f.push('up'); else if (A.exits.some(e => e.d[1] < -0.6)) f.push('dn'); else if (A.exits.some(e => Math.abs(e.d[2]) > 0.6)) f.push('sd');
  if (A.exits.some(e => e.kf > 0.04)) f.push('cv');
  if (A.len > 4.4) f.push('lg');
  if (A.exits.some(e => e.leak)) f.push('ho');
  if (A.exits.some(e => e.r > 0.1)) f.push('fx');
  if (!f.length) f.push(A.len < 0.5 ? 'sh' : 'st');
  return f.slice(0, 2).join('');
}

// ===== 銃の向き =====
// 銃身の前 f、上 u、右 r。昔のかたむき th（度）も読めるようにしておく。そこに上下・左右のねらいをかける
function rotY(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; }
function rotX(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; }
export function frame(th, yaw, pitch, o, y0, sx) {
  const t = (th || 0) * Math.PI / 180; const R = v => rotY(rotX(v, pitch), yaw + (y0 || 0));
  return { f: R([0, 0, -1]), u: R([-Math.sin(t), Math.cos(t), 0]), r: R([Math.cos(t), Math.sin(t), 0]), o: o || MUZ, sx: sx || 0 };
}
// 世界の点 → 銃身を描く面の点（描く画面で体の位置を出すのに使う）
export function toLocal(fr, w) { const d = sub(w, fr.o); return [dot(d, fr.f), dot(d, fr.u), dot(d, fr.r)]; }
export const vec = (fr, v) => [fr.f[0] * v[0] + fr.u[0] * v[1] + fr.r[0] * v[2], fr.f[1] * v[0] + fr.u[1] * v[1] + fr.r[1] * v[2], fr.f[2] * v[0] + fr.u[2] * v[1] + fr.r[2] * v[2]];
export function toWorld(fr, a, b, c) { const v = vec(fr, [a, b, c || 0]), o = fr.o || MUZ; return [o[0] + v[0], o[1] + v[1], o[2] + v[2]]; }
function rotAxis(v, ax, ang) { const c = Math.cos(ang), s = Math.sin(ang), d = dot(v, ax), cr = cross(ax, v); return [v[0] * c + cr[0] * s + ax[0] * d * (1 - c), v[1] * c + cr[1] * s + ax[1] * d * (1 - c), v[2] * c + cr[2] * s + ax[2] * d * (1 - c)]; }

// 撃つ人の体（自分に当たったら終わり）
export function selfHit(q, pr, sx) {
  const dx = q[0] - (sx || 0), dz = q[2];
  if (q[1] > 0 && q[1] < 1.5 && Math.hypot(dx, dz) < 0.3) return true;
  if (Math.hypot(dx, q[1] - 1.65, dz) < 0.24) return true;
  // 撃つ人のいる所（横はば 1m・高さ 2.1m）を後ろへ通りぬけたら、自分に当たったことにする
  return !!pr && pr[2] < 0 && q[2] >= 0 && Math.abs(dx) < 0.5 && q[1] > 0 && q[1] < 2.1;
}

export const FDT = 1 / 120;
export function exitDir(ex, fr) { return norm(vec(fr, ex.d)); }
// ほぼ真上に出た弾は、空へ消えてから上から落ちてくる。真上に近いほど手前（自分の上）に落ちる
function mortar(ex, fr, t0, dt, pos0, dir) {
  const el = Math.asin(clamp(dir[1], -1, 1)), k = clamp((Math.PI / 2 - el) / (35 * Math.PI / 180), 0, 1);
  const h = Math.hypot(dir[0], dir[2]) || 1e-6, hx = dir[0] / h, hz = dir[2] / h;
  const land = [pos0[0] + hx * (L + 0.5) * k, 0, pos0[2] + hz * (L + 0.5) * k], top = 16, up = 0.8, down = 1.0;
  const pts = []; let end = 'floor';
  for (let tt = 0; tt < up + down; tt += dt) {
    let q;
    if (tt < up) { const e = tt / up; q = [pos0[0] + (land[0] - pos0[0]) * e * 0.1, pos0[1] + (top - pos0[1]) * (1 - (1 - e) * (1 - e)), pos0[2] + (land[2] - pos0[2]) * e * 0.1]; }
    else { const e = (tt - up) / down; q = [land[0], top * (1 - e * e), land[2]]; }
    pts.push([q[0], q[1], q[2], t0 + tt + dt]);
    if (tt > up && selfHit(q, null, fr.sx)) { end = 'self'; break; }
  }
  return { pts, end, r: ex.r, mortar: 1, bounces: 0 };
}
// 弾が出たあとの通り道を、先に全部計算しておく（予測線にも、そのまま弾の動きにも使う）
export function flight(ex, fr, t0, opt) {
  const dt = (opt && opt.dt) || FDT, tmax = (opt && opt.tmax) || 4;
  const pos0 = toWorld(fr, ex.p[0], ex.p[1], ex.p[2]);
  const dir = exitDir(ex, fr);
  if (!ex.roll && dir[1] > Math.sin(55 * Math.PI / 180)) return mortar(ex, fr, t0, dt, pos0, dir);
  const kax = norm(vec(fr, ex.kax || [0, 0, 1]));
  const wdir0 = ex.wave ? norm(vec(fr, ex.wave.dir)) : null;
  const sax = ex.spiral ? norm(vec(fr, ex.spiral.ax || [0, 0, 1])) : null;
  let vel = [dir[0] * ex.v, dir[1] * ex.v, dir[2] * ex.v], p = pos0.slice(), s = 0, bounces = 0, speed = ex.v;
  const pts = []; let end = 'out';
  for (let tt = 0; tt < tmax; tt += dt) {
    if (ex.kf) vel = rotAxis(vel, kax, ex.kf * speed * dt); // 出口のクセで曲がり続ける
    vel[1] -= G * ex.gf * dt;
    p = add(p, vel, dt); speed = len3(vel); s += speed * dt;
    // 見た目の位置（波・渦巻き）
    let q = p; const vd = norm(vel);
    if (wdir0) { let w = sub(wdir0, [vd[0] * dot(wdir0, vd), vd[1] * dot(wdir0, vd), vd[2] * dot(wdir0, vd)]); w = len3(w) > 1e-3 ? norm(w) : norm(cross(vd, [0, 1, 0])); q = add(q, w, ex.wave.A * Math.sin(TAU * s / ex.wave.lam) * Math.min(1, s / 0.6)); }
    if (sax) { let w = norm(cross(sax, vd)); if (len3(cross(sax, vd)) < 1e-3) w = norm(cross(vd, [0, 1, 0])); const n2 = norm(cross(vd, w)); const ang = TAU * ex.spiral.f * tt * ex.spiral.dir, R = ex.spiral.R * Math.min(1, s / 0.8); q = add(add(q, w, R * Math.cos(ang)), n2, R * Math.sin(ang)); }
    pts.push([q[0], q[1], q[2], t0 + tt + dt]);
    if (selfHit(q, pts.length > 1 ? pts[pts.length - 2] : null, fr.sx)) { end = 'self'; break; }
    if (ex.roll && p[1] <= ex.r) { p[1] = ex.r; vel[1] = 0; const sp2 = Math.hypot(vel[0], vel[2]); const k2 = Math.max(0, 1 - 0.6 * dt / Math.max(.2, sp2)); vel[0] *= k2; vel[2] *= k2; if (sp2 < 0.4) { end = 'floor'; break; } continue; }
    if (p[1] < 0.02) { if (bounces >= 3 || speed < 3) { end = 'floor'; break; } bounces++; p[1] = 0.02; vel[1] = Math.abs(vel[1]) * 0.35; vel[0] *= 0.8; vel[2] *= 0.8; speed = len3(vel); }
    if (q[2] < -L - 2.5 || q[2] > 3.5 || Math.abs(q[0]) > 7 || q[1] > 9) { end = 'out'; break; }
  }
  return { pts, end, r: ex.r, bounces };
}

// 的の紙のまん中を通るように、銃の向きを自動で少し直す（直せる角度には限りがある。後ろ向きの銃身は直さない）
export function aimAt(A, th, tx, ty, o, y0, sx) {
  const ex = A.exits[0]; if (!ex) return { yaw: 0, pitch: 0 };
  if (exitDir(ex, frame(th, 0, 0, o, y0, sx))[2] > 0.2) return { yaw: 0, pitch: 0 }; // 後ろ向き（自分のほう）に出る銃身は直さない
  const T = [tx, ty, -L];
  const miss = (yaw, pitch) => { const fl = flight(ex, frame(th, yaw, pitch, o, y0, sx), 0, { dt: 1 / 40, tmax: 3 }); let m = 1e9, cr = null;
    for (let i = 0; i < fl.pts.length; i++) { const q = fl.pts[i]; const d = Math.hypot(q[0] - T[0], q[1] - T[1], q[2] - T[2]); if (d < m) m = d; const a = fl.pts[i - 1]; if (cr == null && a && a[2] > -L && q[2] <= -L) { const k = (a[2] + L) / (a[2] - q[2]); cr = Math.hypot(a[0] + (q[0] - a[0]) * k - tx, a[1] + (q[1] - a[1]) * k - ty); } }
    return (cr != null ? cr : m + 3) + (fl.bounces || 0) * 1.5 + (fl.end === 'self' ? 50 : 0) + 0.05 * (Math.abs(yaw) + Math.abs(pitch)); };
  let best = [0, 0], bm = miss(0, 0), st = AIMMAX / 2;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const y = i * st, p = j * st, m = miss(y, p); if (m < bm - 1e-9) { bm = m; best = [y, p]; } }
  for (let r = 0; r < 4; r++) { st /= 2; const c = best.slice(); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { if (!i && !j) continue; const y = clamp(c[0] + i * st, -AIMMAX, AIMMAX), p = clamp(c[1] + j * st, -AIMMAX, AIMMAX), m = miss(y, p); if (m < bm - 1e-9) { bm = m; best = [y, p]; } } }
  return { yaw: best[0], pitch: best[1] };
}

// 1発ぶん：引き金を引いた時刻 t から、弾ごとの通り道をまとめて返す
export function fire(A, th, tx, ty, t, o, y0, sx) {
  const aim = aimAt(A, th, tx, ty, o, y0, sx); const fr = frame(th, aim.yaw, aim.pitch, o, y0, sx);
  const bullets = A.exits.map((ex, i) => { const fl = flight(ex, fr, t + ex.t, ex.roll ? { tmax: 7 } : null); return { ...fl, t0: t, tex: t + ex.t, inside: A.inside[i], ex }; });
  return { aim, fr, bullets, jam: A.jam ? { ...A.jam, t: t + A.jam.t } : null, t };
}

// ===== 紙の的 =====
export const PAPER = { W: 0.33, H: 1.1, NECK: 0.1, HEADY: 1.38, HEADR: 0.19, BASE: 0.22 };
// 紙の形の中か（u：横、w：下からの高さ。しゃがむと縦が縮む）
export function inPaper(u, w, hs, m) {
  const P = PAPER; w /= hs;
  if (w >= -m && w <= P.H && Math.abs(u) <= P.W + m) return true;
  if (w < 0 && w >= -P.BASE / hs - m && Math.abs(u) <= 0.3 + m) return true; // 足もと（台）
  if (w >= P.H && w <= P.H + 0.12 && Math.abs(u) <= P.NECK + m) return true;
  return Math.hypot(u, w - P.HEADY) <= P.HEADR + m;
}
export function newPaper() { return { x: 0, vx: 0, vs: 0, yaw: 0, y: 0, vy: 0, hs: 1, crouch: false, ground: true }; }
// 入力：1=画面の右 2=画面の左 4=ジャンプ 8=しゃがむ 16=指で動かしている（そのとき 32 から上に、行きたい位置 cm+1000 が入る）
export const KEYSPD = 5, DRAGSPD = 9;
export const dragInput = x => 16 + ((Math.round(clamp(x, -XMAX, XMAX) * 100) + 1000) << 5);
export function stepPaper(P, bits, dt) {
  let mv = ((bits & 2) ? 1 : 0) - ((bits & 1) ? 1 : 0), vx = mv * KEYSPD;
  if (bits & 16) { const tx = ((bits >> 5) - 1000) / 100, d = tx - P.x; vx = clamp(d / dt, -DRAGSPD, DRAGSPD); mv = Math.abs(d) > 0.03 ? Math.sign(d) : 0; }
  const x0 = P.x; P.x = clamp(P.x + vx * dt, -XMAX, XMAX); P.vx = (P.x - x0) / dt; P.vs = (P.vs || 0) * 0.9 + P.vx * 0.1;
  const ty = mv ? -mv * Math.PI / 4 : 0; const d = ty - P.yaw; P.yaw += clamp(d, -8 * dt, 8 * dt);
  P.crouch = !!(bits & 8) && P.ground;
  if ((bits & 4) && P.ground && !P.crouch) { P.vy = 5.6; P.ground = false; }
  if (!P.ground) { P.vy -= 16 * dt; P.y += P.vy * dt; if (P.y <= 0) { P.y = 0; P.vy = 0; P.ground = true; } }
  const th = P.crouch ? 0.55 : 1; P.hs += clamp(th - P.hs, -6 * dt, 6 * dt);
}
export function paperCenter(P) { return [P.x, PAPER.BASE + P.y + 0.75 * P.hs]; }
export const LEAD = 0.85;
export function leadPoint(P, A) { const ex = A.exits[0]; const c = paperCenter(P); if (!ex) return c; const ta = ex.t + L / Math.max(6, ex.v); return [clamp(P.x + (P.vs || 0) * ta * LEAD, -XMAX, XMAX), c[1]]; }
// 弾の通り道の1区間が紙をつきぬけたか。返り値：{hit:true,u,w} か {near:true,u,w} か null
export function crossPaper(P, a, b, r) {
  const nx = Math.sin(P.yaw), nz = Math.cos(P.yaw); // 紙の向き（Y まわりに回る）
  const d0 = (a[0] - P.x) * nx + (a[2] + L) * nz, d1 = (b[0] - P.x) * nx + (b[2] + L) * nz;
  let q;
  if ((d0 > 0) === (d1 > 0) || d0 === d1) { if (Math.abs(d1) > 0.08 + r) return null; q = b; }
  else { const k = d0 / (d0 - d1); q = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  const u = (q[0] - P.x) * nz - (q[2] + L) * nx, w = q[1] - (PAPER.BASE + P.y);
  if (inPaper(u, w, P.hs, r)) return { hit: true, u, w: w / P.hs };
  if (inPaper(u, w, P.hs, r + 0.3)) return { near: true, u, w: w / P.hs };
  return null;
}
// 的のある所まで届いたか（試し撃ちで、登録してよいかを決める）
export function reaches(shot) {
  return shot.bullets.some(b => { if (b.end === 'self') return false; if (b.pts.some(q => Math.abs(q[2] + L) < 0.7 && Math.abs(q[0]) <= XMAX + 0.5 && q[1] >= 0 && q[1] <= 3)) return true;
    for (let i = 1; i < b.pts.length; i++) { const a = b.pts[i - 1], c = b.pts[i]; if (a[2] > -L && c[2] <= -L) { const k = (a[2] + L) / (a[2] - c[2]); const x = a[0] + (c[0] - a[0]) * k, y = a[1] + (c[1] - a[1]) * k; if (Math.abs(x) <= XMAX + 0.5 && y >= 0 && y <= 3) return true; } } return false; });
}
