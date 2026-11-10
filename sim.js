// ごジュウに：銃身の形から弾の飛び方を決める（ゲームと確認用の両方で使う）
// 長さはメートル、時間は秒。撃つ人は原点に立って -Z（的のほう）を向く。X は右、Y は上
export const L = 12;                 // 的までの距離（的の紙は z=-L）
export const MUZ = [0, 1.35, -0.45]; // 銃の口（銃身はここから描く）
export const INK = 4.0;              // 描けるインクの長さ
export const STEP = 0.04;            // 線の点の間隔
export const MAXB = 32;              // 1発あたりの弾の数の上限
export const MAXSHOT = 3;            // 撃てる数
export const TESTWIN = 8;            // 試し撃ちで引き金を押せる時間（秒）
export const AIMMAX = 0.5;           // 自動でねらいを直せる角度（ラジアン、約29度）
export const V0 = 16, VMAX = 48, VIS = 0.16, G = 5;
export const XMAX = 2.8;             // 紙の的が動ける幅
const TAU = Math.PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

// ===== 線のデータ（cm の整数で持つ。作った人と遊ぶ人で同じ数字になる） =====
export function encode(strokes) {
  return strokes.map(s => (s.at ? s.at[0] + '.' + s.at[1] : '') + ':' + s.p.map(([a, b]) => Math.round(a * 100) + ',' + Math.round(b * 100)).join(' ')).join(';');
}
export function decode(str) {
  if (!str) return [];
  const out = [];
  for (const part of String(str).split(';')) {
    const i = part.indexOf(':'); if (i < 0) continue;
    const h = part.slice(0, i), body = part.slice(i + 1);
    const at = h ? h.split('.').map(x => parseInt(x, 10)) : null;
    const p = body.trim() ? body.trim().split(/\s+/).map(q => { const [a, b] = q.split(',').map(x => parseInt(x, 10) / 100); return [a, b]; }) : [];
    if (p.length >= 2 && p.every(q => isFinite(q[0]) && isFinite(q[1]))) out.push({ at: at && at.length === 2 && isFinite(at[0]) && isFinite(at[1]) ? at : null, p });
  }
  return out;
}
export const roundTrip = s => decode(encode(s));
export function inkUsed(strokes) { let n = 0; for (const s of strokes) for (let i = 1; i < s.p.length; i++) n += Math.hypot(s.p[i][0] - s.p[i - 1][0], s.p[i][1] - s.p[i - 1][1]); return n; }

// 指で描いた点を、決まった間隔に並べなおして少しなめらかにする（角は残る程度）
export function tidy(raw, first) {
  if (raw.length < 2) return raw.slice();
  const out = [raw[0].slice()]; let acc = 0, prev = raw[0];
  for (let i = 1; i < raw.length; i++) {
    let cur = raw[i]; let seg = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    while (acc + seg >= STEP) {
      const k = (STEP - acc) / seg; const q = [prev[0] + (cur[0] - prev[0]) * k, prev[1] + (cur[1] - prev[1]) * k];
      out.push(q); prev = q; seg = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]); acc = 0;
    }
    acc += seg; prev = cur;
  }
  let p = out;
  for (let pass = 0; pass < 2; pass++) {
    const q = p.map(x => x.slice());
    for (let i = 1; i < p.length - 1; i++) { q[i][0] = p[i - 1][0] * .25 + p[i][0] * .5 + p[i + 1][0] * .25; q[i][1] = p[i - 1][1] * .25 + p[i][1] * .5 + p[i + 1][1] * .25; }
    p = q;
  }
  return p;
}

// ===== 銃身の中を弾が通る =====
function turn(p, i) { // 点 i での曲がり（左回りがプラス）
  if (i <= 0 || i >= p.length - 1) return 0;
  const a1 = Math.atan2(p[i][1] - p[i - 1][1], p[i][0] - p[i - 1][0]), a2 = Math.atan2(p[i + 1][1] - p[i][1], p[i + 1][0] - p[i][0]);
  let d = a2 - a1; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d;
}
function strokeFeatures(p) {
  const n = p.length; let len = 0, tot = 0, abs = 0;
  for (let i = 1; i < n; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  const ang = []; for (let i = 0; i < n; i++) { const a = turn(p, i); ang.push(a); tot += a; abs += Math.abs(a); }
  // 出口のクセ（最後の 0.36m の曲がり）
  let ke = 0, kl = 0; for (let i = n - 2; i >= 1 && kl < 0.36; i--) { ke += ang[i]; kl += STEP; }
  const kappa = kl > 0.1 ? ke / kl : 0;
  // 波（曲がる向きが何回も入れかわる）
  const sm = ang.map((a, i) => (ang[i - 1] || 0) * .25 + a * .5 + (ang[i + 1] || 0) * .25);
  let alt = 0, sgn = 0, run = 0;
  for (const a of sm) { const s = Math.sign(a); if (s === 0) continue; if (s === sgn) run += Math.abs(a); else { if (sgn !== 0 && run > 0.3) alt++; sgn = s; run = Math.abs(a); } }
  if (run > 0.3) alt++;
  let wave = null;
  if (alt >= 4 && abs < TAU * 3.2) {
    const a0 = p[0], a1 = p[n - 1]; const cx = a1[0] - a0[0], cy = a1[1] - a0[1], cl = Math.hypot(cx, cy) || 1; let dev = 0;
    for (const q of p) dev += Math.abs(((q[0] - a0[0]) * cy - (q[1] - a0[1]) * cx) / cl);
    dev /= n; wave = { A: clamp(dev * 0.9, 0.12, 0.6), lam: clamp(2 * len / alt, 0.7, 3.2) };
  }
  // 渦巻き（同じ向きに巻きながら、中心からの距離がどんどん変わる）
  let spiral = null; const oneSide = abs > 0 ? Math.abs(tot) / abs : 0;
  if (Math.abs(tot) > TAU * 1.25 && oneSide > 0.6 && n > 30) {
    let mx = 0, my = 0; for (const q of p) { mx += q[0]; my += q[1]; } mx /= n; my /= n;
    const t3 = Math.floor(n / 3); let r1 = 0, r3 = 0;
    for (let i = 0; i < t3; i++) r1 += Math.hypot(p[i][0] - mx, p[i][1] - my);
    for (let i = n - t3; i < n; i++) r3 += Math.hypot(p[i][0] - mx, p[i][1] - my);
    const ratio = (r1 + 1e-6) / (r3 + 1e-6);
    if (ratio > 1.8 || ratio < 0.55) { const turns = Math.abs(tot) / TAU; spiral = { R: clamp(0.12 * turns, 0.15, 0.7), f: 1.2 + 0.4 * turns, dir: Math.sign(tot) }; }
  }
  return { len, tot, abs, kappa, wave, spiral, corners: ang.filter(a => Math.abs(a) > 0.6).length };
}

// 銃身をしらべて、弾がどこからどう出るかを決める（銃の向きは関係ない、描いた面の上の話）
export function analyze(strokes0) {
  let strokes = strokes0 && strokes0.length ? strokes0 : [{ at: null, p: [[0, 0], [0.1, 0], [0.2, 0]] }];
  const S = strokes.map(s => ({ p: s.p, at: s.at, kids: {} }));
  S.forEach((s, k) => { if (k > 0 && s.at && S[s.at[0]] && s.at[0] < k) { const pi = clamp(s.at[1], 0, S[s.at[0]].p.length - 1); (S[s.at[0]].kids[pi] = S[s.at[0]].kids[pi] || []).push(k); } });
  const F = S.map(s => strokeFeatures(s.p));
  const exits = [], inside = []; let jam = null, count = 1, loopsMax = 0;
  const queue = [{ k: 0, i: 0, v: V0, t: 0, sp: 0, hops: 0, path: [[...S[0].p[0], 0]] }];
  const near = (q, r, ex) => { for (let k = 0; k < S.length; k++) { const p = S[k].p; for (let i = 0; i < p.length; i++) { if (ex && ex(k, i)) continue; if (Math.hypot(p[i][0] - q[0], p[i][1] - q[1]) < r) return [k, i]; } } return null; };
  while (queue.length) {
    const b = queue.shift(); let { k, i, v, t, sp, hops, path } = b; let p = S[k].p, f = F[k], cum = 0, loops = 0;
    let done = false;
    while (!done) {
      // 枝分かれ
      const kids = S[k].kids[i];
      if (kids) for (const c of kids) { if (count >= MAXB) break; count++; v *= 0.85; queue.push({ k: c, i: 0, v, t, sp: sp + 1, hops, path: path.slice() }); }
      if (i + 1 < p.length) {
        const ds = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
        const a = turn(p, i); cum += a;
        if (Math.abs(a) > 0.44) v *= 1 - 0.55 * Math.min(1, (Math.abs(a) - 0.44) / 2.2);
        v += 5 * ds;
        const lp = Math.floor((Math.abs(cum) + 0.6) / TAU); if (lp > loops) { v += 9 * (lp - loops); loops = lp; }
        v = Math.min(v, VMAX); t += ds / (v * VIS); i++; path.push([p[i][0], p[i][1], t]);
        if (v < 5) { jam = { x: p[i][0], y: p[i][1], t }; done = true; break; }
        continue;
      }
      // 線の終わり
      const end = p[p.length - 1];
      const own = p.length > 10 ? (() => { for (let j = 0; j < p.length - 9; j++) if (Math.hypot(p[j][0] - end[0], p[j][1] - end[1]) < 0.1) return j; return -1; })() : -1;
      let ex = null;
      if (own >= 0) {
        // 出口がない：中を回り続けて速くなり、いちばん曲がりのきつい所から突き破る
        let lapLen = 0; for (let j = own + 1; j < p.length; j++) lapLen += Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]);
        for (let lap = 0; lap < 3; lap++) { v = Math.min(VMAX, v + 10); t += lapLen / (v * VIS); for (let j = own; j < p.length; j += 2) path.push([p[j][0], p[j][1], t - lapLen / (v * VIS) * (1 - (j - own) / (p.length - own))]); }
        let m = own + 1, best = 0; for (let j = own + 1; j < p.length - 1; j++) { const a = Math.abs(turn(p, j)); if (a > best) { best = a; m = j; } }
        const d = [p[m + 1][0] - p[m - 1][0], p[m + 1][1] - p[m - 1][1]]; const dl = Math.hypot(d[0], d[1]) || 1;
        ex = { x: p[m][0], y: p[m][1], dx: d[0] / dl, dy: d[1] / dl, burst: 1 };
        loops += 3;
      } else {
        const hit = hops < 3 ? near(end, 0.08, (kk, ii) => kk === k) : null;
        if (hit) { // ほかの銃身にぶつかって合流する
          k = hit[0]; i = hit[1]; p = S[k].p; f = F[k]; hops++; cum = 0; continue;
        }
        const j = f.wave ? 0 : Math.max(0, p.length - 3); const d = [end[0] - p[j][0], end[1] - p[j][1]]; const dl = Math.hypot(d[0], d[1]) || 1;
        ex = { x: end[0], y: end[1], dx: d[0] / dl, dy: d[1] / dl };
      }
      loopsMax = Math.max(loopsMax, loops);
      exits.push({ ...ex, v, t, r: Math.max(0.022, 0.06 * Math.pow(0.8, sp)), kf: f.wave || f.spiral ? 0 : clamp(f.kappa * 0.04, -0.1, 0.1), wave: f.wave, spiral: f.spiral, gf: Math.max(0.35, 1 - 0.25 * loops), loops });
      inside.push(path);
      done = true;
    }
  }
  const len = F.reduce((a, f) => a + f.len, 0);
  return { exits, inside, jam, F, len, loops: loopsMax, count: exits.length };
}

// ===== 2つ名（形から自動でつける）：特ちょうの記号を返す。言葉は画面のほうで訳す =====
export function features(strokes, A) {
  A = A || analyze(strokes); const f = [];
  const b = A.count; if (b >= 7) f.push('b7'); else if (b >= 4) f.push('b4'); else if (b >= 2) f.push('b2');
  if (A.exits.some(e => e.burst)) f.push('cl');
  if (A.F.some(x => x.spiral)) f.push('sp');
  const lo = Math.max(0, ...A.exits.map(e => e.loops || 0)); if (lo >= 3) f.push('l3'); else if (lo >= 1) f.push('l1');
  if (A.F.some(x => x.wave)) f.push('wv');
  if (A.F.reduce((a, x) => a + x.corners, 0) >= 6) f.push('cn');
  if (A.exits.some(e => e.dy > 0.7)) f.push('up'); else if (A.exits.some(e => e.dy < -0.6)) f.push('dn');
  if (A.exits.some(e => Math.abs(e.kf) > 0.12)) f.push('cv');
  if (A.len > 3.2) f.push('lg');
  if (!f.length) f.push(A.len < 0.5 ? 'sh' : 'st');
  return f.slice(0, 2).join('');
}

// ===== 銃の向き =====
// 描いた面：前 f=(0,0,-1)、上 pu=(-sinθ, cosθ, 0)、面の向き n=(cosθ, sinθ, 0)。そこに上下・左右のねらいをかける
function rotY(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; }
function rotX(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; }
export function frame(th, yaw, pitch) {
  const t = th * Math.PI / 180; const R = v => rotY(rotX(v, pitch), yaw);
  return { f: R([0, 0, -1]), u: R([-Math.sin(t), Math.cos(t), 0]), n: R([Math.cos(t), Math.sin(t), 0]) };
}
export function toWorld(fr, a, b) { return [MUZ[0] + fr.f[0] * a + fr.u[0] * b, MUZ[1] + fr.f[1] * a + fr.u[1] * b, MUZ[2] + fr.f[2] * a + fr.u[2] * b]; }
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function rotAxis(v, ax, ang) { const c = Math.cos(ang), s = Math.sin(ang), d = v[0] * ax[0] + v[1] * ax[1] + v[2] * ax[2], cr = cross(ax, v); return [v[0] * c + cr[0] * s + ax[0] * d * (1 - c), v[1] * c + cr[1] * s + ax[1] * d * (1 - c), v[2] * c + cr[2] * s + ax[2] * d * (1 - c)]; }

// 撃つ人の体（自分に当たったら終わり）
function selfHit(q, pr) {
  const dx = q[0], dz = q[2];
  if (q[1] > 0 && q[1] < 1.5 && Math.hypot(dx, dz) < 0.3) return true;
  if (Math.hypot(dx, q[1] - 1.65, dz) < 0.24) return true;
  // 撃つ人のいる所（横はば 1m・高さ 2.1m）を後ろへ通りぬけたら、自分に当たったことにする
  return !!pr && pr[2] < 0 && q[2] >= 0 && Math.abs(q[0]) < 0.5 && q[1] > 0 && q[1] < 2.1;
}

// 弾が出たあとの通り道を、先に全部計算しておく（予測線にも、そのまま弾の動きにも使う）
export const FDT = 1 / 120;
export function exitDir(ex, fr) { return norm([fr.f[0] * ex.dx + fr.u[0] * ex.dy, fr.f[1] * ex.dx + fr.u[1] * ex.dy, fr.f[2] * ex.dx + fr.u[2] * ex.dy]); }
// ほぼ真上に出た弾は、空へ消えてから上から落ちてくる。真上に近いほど手前（自分の上）に落ちる
function mortar(ex, fr, t0, dt, pos0, dir) {
  const el = Math.asin(clamp(dir[1], -1, 1)), k = clamp((Math.PI / 2 - el) / (35 * Math.PI / 180), 0, 1);
  const h = Math.hypot(dir[0], dir[2]) || 1e-6, hx = dir[0] / h, hz = dir[2] / h;
  const land = [pos0[0] + hx * (L + 0.5) * k, 0, pos0[2] + hz * (L + 0.5) * k], top = 16, up = 0.8, down = 1.0;
  const pts = []; let end = 'floor';
  for (let tt = 0; tt < up + down; tt += dt) {
    let q;
    if (tt < up) { const e = tt / up; q = [pos0[0] + (land[0] - pos0[0]) * e * 0.1, pos0[1] + (top - pos0[1]) * (1 - (1 - e) * (1 - e)), pos0[2] + (land[2] - pos0[2]) * e * 0.1]; }
    else { const e = (tt - up) / down; q = [land[0] + (pos0[0] - land[0]) * 0.9 * (1 - e) * 0, top * (1 - e * e), land[2]]; q[0] = land[0]; }
    pts.push([q[0], q[1], q[2], t0 + tt + dt]);
    if (tt > up && selfHit(q, null)) { end = 'self'; break; }
  }
  return { pts, end, r: ex.r, mortar: 1 };
}
export function flight(ex, fr, t0, opt) {
  const dt = (opt && opt.dt) || FDT, tmax = (opt && opt.tmax) || 4;
  const pos0 = toWorld(fr, ex.x, ex.y);
  let dir = exitDir(ex, fr);
  if (dir[1] > Math.sin(55 * Math.PI / 180)) return mortar(ex, fr, t0, dt, pos0, dir);
  let vel = [dir[0] * ex.v, dir[1] * ex.v, dir[2] * ex.v], p = pos0.slice(), s = 0, bounces = 0, speed = ex.v;
  const pts = []; let end = 'out';
  for (let tt = 0; tt < tmax; tt += dt) {
    // 出口のクセで曲がり続ける
    if (ex.kf) vel = rotAxis(vel, fr.n, ex.kf * speed * dt);
    vel[1] -= G * ex.gf * dt;
    p = add(p, vel, dt); speed = Math.hypot(vel[0], vel[1], vel[2]); s += speed * dt;
    // 見た目の位置（波・渦巻き）
    let q = p;
    const vd = norm(vel), w = norm(cross(fr.n, vd));
    if (ex.wave) q = add(q, w, ex.wave.A * Math.sin(TAU * s / ex.wave.lam) * Math.min(1, s / 0.6));
    if (ex.spiral) { const ang = TAU * ex.spiral.f * tt * ex.spiral.dir, R = ex.spiral.R * Math.min(1, s / 0.8); q = add(add(q, w, R * Math.cos(ang)), fr.n, R * Math.sin(ang)); }
    pts.push([q[0], q[1], q[2], t0 + tt + dt]);
    if (selfHit(q, pts.length > 1 ? pts[pts.length - 2] : null)) { end = 'self'; break; }
    if (p[1] < 0.02) { if (bounces >= 3 || speed < 3) { end = 'floor'; break; } bounces++; p[1] = 0.02; vel[1] = Math.abs(vel[1]) * 0.35; vel[0] *= 0.8; vel[2] *= 0.8; speed = Math.hypot(vel[0], vel[1], vel[2]); }
    if (q[2] < -L - 2.5 || q[2] > 3.5 || Math.abs(q[0]) > 7 || q[1] > 9) { end = 'out'; break; }
  }
  return { pts, end, r: ex.r, bounces };
}

// 的の紙のまん中を通るように、銃の向きを自動で少し直す（直せる角度には限りがある）
export function aimAt(A, th, tx, ty) {
  const ex = A.exits[0]; if (!ex || ex.dx < -0.2) return { yaw: 0, pitch: 0 };
  const T = [tx, ty, -L];
  const miss = (yaw, pitch) => { const fl = flight(ex, frame(th, yaw, pitch), 0, { dt: 1 / 40, tmax: 3 }); let m = 1e9, cr = null;
    for (let i = 0; i < fl.pts.length; i++) { const q = fl.pts[i]; const d = Math.hypot(q[0] - T[0], q[1] - T[1], q[2] - T[2]); if (d < m) m = d; const a = fl.pts[i - 1]; if (cr == null && a && a[2] > -L && q[2] <= -L) { const k = (a[2] + L) / (a[2] - q[2]); cr = Math.hypot(a[0] + (q[0] - a[0]) * k - tx, a[1] + (q[1] - a[1]) * k - ty); } }
    return (cr != null ? cr : m + 3) + (fl.bounces || 0) * 1.5 + (fl.end === 'self' ? 50 : 0) + 0.05 * (Math.abs(yaw) + Math.abs(pitch)); };
  let best = [0, 0], bm = miss(0, 0), st = AIMMAX / 2;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const y = i * st, p = j * st, m = miss(y, p); if (m < bm - 1e-9) { bm = m; best = [y, p]; } }
  for (let r = 0; r < 4; r++) { st /= 2; const c = best.slice(); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { if (!i && !j) continue; const y = clamp(c[0] + i * st, -AIMMAX, AIMMAX), p = clamp(c[1] + j * st, -AIMMAX, AIMMAX), m = miss(y, p); if (m < bm - 1e-9) { bm = m; best = [y, p]; } } }
  return { yaw: best[0], pitch: best[1] };
}

// 1発ぶん：引き金を引いた時刻 t から、弾ごとの通り道をまとめて返す
export function fire(A, th, tx, ty, t) {
  const aim = aimAt(A, th, tx, ty); const fr = frame(th, aim.yaw, aim.pitch);
  const bullets = A.exits.map((ex, i) => { const fl = flight(ex, fr, t + ex.t); return { ...fl, t0: t, tex: t + ex.t, inside: A.inside[i], ex }; });
  return { aim, fr, bullets, jam: A.jam ? { ...A.jam, t: t + A.jam.t } : null, t };
}

// ===== 紙の的 =====
export const PAPER = { W: 0.33, H: 1.1, NECK: 0.1, HEADY: 1.38, HEADR: 0.19, BASE: 0.22 };
// 紙の形の中か（u：横、w：下からの高さ。しゃがむと縦が縮む）
export function inPaper(u, w, hs, m) {
  const P = PAPER; w /= hs;
  if (w >= -m && w <= P.H && Math.abs(u) <= P.W + m) return true;
  if (w >= P.H && w <= P.H + 0.12 && Math.abs(u) <= P.NECK + m) return true;
  return Math.hypot(u, w - P.HEADY) <= P.HEADR + m;
}
export function newPaper() { return { x: 0, vx: 0, yaw: 0, y: 0, vy: 0, hs: 1, crouch: false, ground: true }; }
// in：1=左 2=右 4=ジャンプ 8=しゃがむ（世界の左右。-X が「左」）
export function stepPaper(P, bits, dt) {
  const mv = ((bits & 2) ? 1 : 0) - ((bits & 1) ? 1 : 0);
  P.vx = mv * 3.4; P.x = clamp(P.x + P.vx * dt, -XMAX, XMAX);
  const ty = mv ? -mv * Math.PI / 4 : 0; const d = ty - P.yaw; P.yaw += clamp(d, -8 * dt, 8 * dt);
  P.crouch = !!(bits & 8) && P.ground;
  if ((bits & 4) && P.ground && !P.crouch) { P.vy = 5.6; P.ground = false; }
  if (!P.ground) { P.vy -= 16 * dt; P.y += P.vy * dt; if (P.y <= 0) { P.y = 0; P.vy = 0; P.ground = true; } }
  const th = P.crouch ? 0.55 : 1; P.hs += clamp(th - P.hs, -6 * dt, 6 * dt);
}
export function paperCenter(P) { return [P.x, PAPER.BASE + P.y + 0.75 * P.hs]; }
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
  return shot.bullets.some(b => { if (b.end === 'self') return false; if (b.pts.some(q => Math.abs(q[2] + L) < 0.7 && Math.abs(q[0]) <= XMAX + 0.5 && q[1] >= 0 && q[1] <= 3)) return true; for (let i = 1; i < b.pts.length; i++) { const a = b.pts[i - 1], c = b.pts[i]; if (a[2] > -L && c[2] <= -L) { const k = (a[2] + L) / (a[2] - c[2]); const x = a[0] + (c[0] - a[0]) * k, y = a[1] + (c[1] - a[1]) * k; if (Math.abs(x) <= XMAX + 0.5 && y >= 0 && y <= 3) return true; } } return false; });
}
