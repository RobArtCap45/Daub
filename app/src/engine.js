/* Loom engine: node definitions, graph evaluation, rendering, SVG export.
 *
 * Data flow: a graph is { nodes:[{id,type,x,y,params}], edges:[{from,to,input}] }.
 * Values are numbers, lists of numbers, point lists ("pts") or geometry lists ("geo").
 * Any numeric input accepts a list; lists are broadcast per index (like NodeBox).
 */
(function (g) {
  'use strict';
  const TAU = Math.PI * 2;
  const isL = Array.isArray;
  const rad = (d) => (d * Math.PI) / 180;

  // ---------- randomness & noise ----------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash3(x, y, z) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483629)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function noise3(x, y = 0, z = 0) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const s = (t) => t * t * (3 - 2 * t);
    const u = s(x - xi), v = s(y - yi), w = s(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
    return l(
      l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
      l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
  }

  // ---------- color ----------
  function hsb(h, s, v, a = 1) {
    h = (((h % 360) + 360) % 360) / 60; s /= 100; v /= 100;
    const i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
    const [r, g2, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
    return `rgba(${Math.round(r * 255)},${Math.round(g2 * 255)},${Math.round(b * 255)},${a})`;
  }

  // ---------- broadcasting ----------
  const at = (v, i) => (isL(v) ? v[((i % v.length) + v.length) % v.length] : v);
  function bc(f, ...vs) {
    if (!vs.some(isL)) return f(...vs);
    if (vs.some((v) => isL(v) && v.length === 0)) return [];
    const n = Math.max(...vs.map((v) => (isL(v) ? v.length : 1)));
    return Array.from({ length: n }, (_, i) => f(...vs.map((v) => at(v, i))));
  }
  const many = (f, ...vs) => { const r = bc(f, ...vs); return isL(r) ? r : [r]; };

  // ---------- matrices [a b c d e f] (canvas convention) ----------
  const ID = [1, 0, 0, 1, 0, 0];
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const trs = (tx, ty, r, sx, sy) => {
    const c = Math.cos(r), s = Math.sin(r);
    return [c * sx, s * sx, -s * sy, c * sy, tx, ty];
  };

  // ---------- shapes ----------
  const shape = (k, props) => ({ k, m: ID, fill: '#ffffff', stroke: null, sw: 0, ...props });
  function polyPoints(s) {
    const pts = [];
    if (s.k === 'polygon') {
      const n = Math.max(3, Math.round(s.sides));
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU - Math.PI / 2; pts.push([Math.cos(a) * s.r, Math.sin(a) * s.r]); }
    } else {
      const n = Math.max(2, Math.round(s.points)) * 2;
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU - Math.PI / 2, r = i % 2 ? s.inner : s.outer; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    }
    return pts;
  }
  function tracePath(c, s) {
    c.beginPath();
    if (s.k === 'rect') { if (s.round > 0 && c.roundRect) c.roundRect(-s.w / 2, -s.h / 2, s.w, s.h, s.round); else c.rect(-s.w / 2, -s.h / 2, s.w, s.h); }
    else if (s.k === 'path') drawCmds(c, s.d);
    else if (s.k === 'ellipse') c.ellipse(0, 0, Math.abs(s.w / 2), Math.abs(s.h / 2), 0, 0, TAU);
    else if (s.k === 'path') el = `<path d="${cmdsToD(s.d)}"`;
      else if (s.k === 'line') { c.moveTo(-s.len / 2, 0); c.lineTo(s.len / 2, 0); }
    else { polyPoints(s).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); }
  }


  // ---------- bezier paths: commands ['M',x,y] ['L',x,y] ['C',x1,y1,x2,y2,x,y] ['Z'] ----------
  const KAPPA = 0.5522847498;
  const applyM = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  function toCmds(s) {
    if (s.k === 'path') return s.d;
    if (s.k === 'rect') {
      const w = s.w / 2, h = s.h / 2, r = Math.min(Math.max(0, s.round || 0), Math.abs(w), Math.abs(h)), q = r * KAPPA;
      if (r <= 0) return [['M', -w, -h], ['L', w, -h], ['L', w, h], ['L', -w, h], ['Z']];
      return [['M', -w + r, -h], ['L', w - r, -h], ['C', w - r + q, -h, w, -h + r - q, w, -h + r], ['L', w, h - r],
        ['C', w, h - r + q, w - r + q, h, w - r, h], ['L', -w + r, h], ['C', -w + r - q, h, -w, h - r + q, -w, h - r],
        ['L', -w, -h + r], ['C', -w, -h + r - q, -w + r - q, -h, -w + r, -h], ['Z']];
    }
    if (s.k === 'ellipse') {
      const rx = Math.abs(s.w / 2), ry = Math.abs(s.h / 2);
      return [['M', rx, 0], ['C', rx, ry * KAPPA, rx * KAPPA, ry, 0, ry], ['C', -rx * KAPPA, ry, -rx, ry * KAPPA, -rx, 0],
        ['C', -rx, -ry * KAPPA, -rx * KAPPA, -ry, 0, -ry], ['C', rx * KAPPA, -ry, rx, -ry * KAPPA, rx, 0], ['Z']];
    }
    if (s.k === 'line') return [['M', -s.len / 2, 0], ['L', s.len / 2, 0]];
    return polyPoints(s).map(([x, y], i) => [i ? 'L' : 'M', x, y]).concat([['Z']]);
  }
  // transform every coordinate pair of a command list by matrix m
  function mapCmds(cmds, f) {
    return cmds.map((c) => { const o = [c[0]]; for (let i = 1; i < c.length; i += 2) o.push(...f(c[i], c[i + 1], c)); return o; });
  }
  const bakeCmds = (s) => mapCmds(toCmds(s), (x, y) => applyM(s.m, x, y));
  const pathShape = (d, extra) => shape('path', { d, closed: d.length > 0 && d[d.length - 1][0] === 'Z', fill: null, stroke: '#ffffff', sw: 1.5, ...extra });
  const isOpen = (s) => s.k === 'line' || (s.k === 'path' && !s.closed);
  function drawCmds(c, cmds) {
    for (const k of cmds) {
      if (k[0] === 'M') c.moveTo(k[1], k[2]); else if (k[0] === 'L') c.lineTo(k[1], k[2]);
      else if (k[0] === 'C') c.bezierCurveTo(k[1], k[2], k[3], k[4], k[5], k[6]); else c.closePath();
    }
  }
  const cmdsToD = (cmds) => cmds.map((k) => k[0] + (k.length > 1 ? ' ' + k.slice(1).map((v) => +v.toFixed(3)).join(' ') : '')).join(' ');
  // flatten to polylines: [{pts:[[x,y]], closed}]
  function flatten(cmds, steps = 18) {
    const out = []; let cur = null, start = null;
    for (const k of cmds) {
      if (k[0] === 'M') { cur = { pts: [[k[1], k[2]]], closed: false }; out.push(cur); start = [k[1], k[2]]; }
      else if (!cur) continue;
      else if (k[0] === 'L') cur.pts.push([k[1], k[2]]);
      else if (k[0] === 'C') {
        const [x0, y0] = cur.pts[cur.pts.length - 1];
        for (let i = 1; i <= steps; i++) {
          const t = i / steps, u = 1 - t;
          cur.pts.push([u * u * u * x0 + 3 * u * u * t * k[1] + 3 * u * t * t * k[3] + t * t * t * k[5], u * u * u * y0 + 3 * u * u * t * k[2] + 3 * u * t * t * k[4] + t * t * t * k[6]]);
        }
      } else { cur.closed = true; cur.pts.push(start.slice()); }
    }
    return out;
  }
  // point + tangent angle at distance d along a polyline
  function along(pts, d) {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], len = Math.hypot(dx, dy);
      if (acc + len >= d || i === pts.length - 1) { const t = len ? Math.min(1, Math.max(0, (d - acc) / len)) : 0; return { x: pts[i - 1][0] + dx * t, y: pts[i - 1][1] + dy * t, a: Math.atan2(dy, dx) }; }
      acc += len;
    }
    return { x: pts[0][0], y: pts[0][1], a: 0 };
  }
  const polyLen = (pts) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; };
  // Catmull-Rom through points -> cubic bezier commands
  function smoothCmds(P, closed, tension) {
    const n = P.length, d = [['M', P[0].x, P[0].y]], t = tension / 6;
    const get = (i) => (closed ? P[((i % n) + n) % n] : P[Math.min(n - 1, Math.max(0, i))]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      d.push(['C', p1.x + (p2.x - p0.x) * t, p1.y + (p2.y - p0.y) * t, p2.x - (p3.x - p1.x) * t, p2.y - (p3.y - p1.y) * t, p2.x, p2.y]);
    }
    if (closed) d.push(['Z']);
    return d;
  }


  // ---------- SVG import & pen-drawn paths ----------
  const NUM_RE = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
  function arcToCubics(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
    if (!rx || !ry || (x1 === x2 && y1 === y2)) return [['L', x2, y2]];
    rx = Math.abs(rx); ry = Math.abs(ry);
    const phi = (phiDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { const k = Math.sqrt(lam); rx *= k; ry *= k; }
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    let co = Math.sqrt(Math.max(0, num / den)); if (fa === fs) co = -co;
    const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
    const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
    const th1 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
    const ux = (x1p - cxp) / rx, uy = (y1p - cyp) / ry, vx = (-x1p - cxp) / rx, vy = (-y1p - cyp) / ry;
    let dth = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    if (!fs && dth > 0) dth -= TAU; else if (fs && dth < 0) dth += TAU;
    const segs = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9)), delta = dth / segs, t = (4 / 3) * Math.tan(delta / 4), out = [];
    const P = (u, v) => [cx + cp * rx * u - sp * ry * v, cy + sp * rx * u + cp * ry * v];
    let th = th1;
    for (let i = 0; i < segs; i++) {
      const c1 = Math.cos(th), s1 = Math.sin(th), c2 = Math.cos(th + delta), s2 = Math.sin(th + delta);
      out.push(['C', ...P(c1 - t * s1, s1 + t * c1), ...P(c2 + t * s2, s2 - t * c2), ...P(c2, s2)]);
      th += delta;
    }
    out[out.length - 1].splice(5, 2, x2, y2);
    return out;
  }
  // SVG path data -> absolute M/L/C/Z commands
  function parsePathD(d) {
    const out = []; let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0, lc = null, lq = null;
    const ws = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
    const num = () => { ws(); NUM_RE.lastIndex = i; const m = NUM_RE.exec(d); if (!m) throw new Error('bad path data'); i = NUM_RE.lastIndex; return parseFloat(m[0]); };
    const flag = () => { ws(); const c = d[i]; if (c !== '0' && c !== '1') throw new Error('bad path data'); i++; return +c; };
    const more = () => { ws(); NUM_RE.lastIndex = i; return i < d.length && NUM_RE.test(d); };
    while (true) {
      ws(); if (i >= d.length) break;
      if (/[a-zA-Z]/.test(d[i])) cmd = d[i++]; else if (!cmd) throw new Error('bad path data');
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0;
      if (C === 'Z') { out.push(['Z']); cx = sx; cy = sy; lc = lq = null; continue; }
      do {
        if (C === 'M') { cx = num() + ox; cy = num() + oy; sx = cx; sy = cy; out.push(['M', cx, cy]); cmd = rel ? 'l' : 'L'; lc = lq = null; }
        else if (C === 'L') { cx = num() + (rel ? cx : 0); cy = num() + (rel ? cy : 0); out.push(['L', cx, cy]); lc = lq = null; }
        else if (C === 'H') { cx = num() + (rel ? cx : 0); out.push(['L', cx, cy]); lc = lq = null; }
        else if (C === 'V') { cy = num() + (rel ? cy : 0); out.push(['L', cx, cy]); lc = lq = null; }
        else if (C === 'C') { const bx = rel ? cx : 0, by = rel ? cy : 0; const a = num() + bx, b = num() + by, c2 = num() + bx, d2 = num() + by, x = num() + bx, y = num() + by; out.push(['C', a, b, c2, d2, x, y]); lc = [c2, d2]; lq = null; cx = x; cy = y; }
        else if (C === 'S') { const bx = rel ? cx : 0, by = rel ? cy : 0; const a = lc ? 2 * cx - lc[0] : cx, b = lc ? 2 * cy - lc[1] : cy, c2 = num() + bx, d2 = num() + by, x = num() + bx, y = num() + by; out.push(['C', a, b, c2, d2, x, y]); lc = [c2, d2]; lq = null; cx = x; cy = y; }
        else if (C === 'Q' || C === 'T') {
          const bx = rel ? cx : 0, by = rel ? cy : 0; let qx, qy;
          if (C === 'Q') { qx = num() + bx; qy = num() + by; } else { qx = lq ? 2 * cx - lq[0] : cx; qy = lq ? 2 * cy - lq[1] : cy; }
          const x = num() + bx, y = num() + by;
          out.push(['C', cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y]); lq = [qx, qy]; lc = null; cx = x; cy = y;
        } else if (C === 'A') { const rx = num(), ry = num(), rot = num(), fa = flag(), fs = flag(), x = num() + (rel ? cx : 0), y = num() + (rel ? cy : 0); out.push(...arcToCubics(cx, cy, rx, ry, rot, fa, fs, x, y)); cx = x; cy = y; lc = lq = null; }
        else throw new Error('unsupported path command ' + cmd);
      } while (more());
    }
    return out;
  }
  function parseTransform(str) {
    let m = ID; if (!str) return m;
    const re = /(\w+)\s*\(([^)]*)\)/g; let r;
    while ((r = re.exec(str))) {
      const a = r[2].split(/[\s,]+/).filter(Boolean).map(Number); let t = ID;
      if (r[1] === 'matrix' && a.length === 6) t = a;
      else if (r[1] === 'translate') t = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
      else if (r[1] === 'scale') t = [a[0], 0, 0, a.length > 1 ? a[1] : a[0], 0, 0];
      else if (r[1] === 'rotate') { const c = Math.cos(rad(a[0])), sn = Math.sin(rad(a[0])); t = [c, sn, -sn, c, 0, 0]; if (a.length === 3) t = mul(mul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]); }
      else if (r[1] === 'skewX') t = [1, 0, Math.tan(rad(a[0])), 1, 0, 0];
      else if (r[1] === 'skewY') t = [1, Math.tan(rad(a[0])), 0, 1, 0, 0];
      m = mul(m, t);
    }
    return m;
  }
  const svgNum = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  function svgPaint(v, fallback) {
    if (v === undefined || v === null || v === '') return fallback;
    v = String(v).trim();
    if (v === 'none' || v === 'transparent') return null;
    if (v === 'currentColor') return '#000000';
    if (v.startsWith('url(')) return '#888888';
    return v;
  }
  const svgCache = new Map();
  function parseSVG(text) {
    if (svgCache.has(text)) return svgCache.get(text);
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.querySelector('parsererror') || !doc.documentElement || doc.documentElement.localName !== 'svg') throw new Error('that file is not a readable SVG');
    const items = [], SKIP = new Set(['defs', 'clippath', 'mask', 'symbol', 'style', 'title', 'desc', 'metadata', 'lineargradient', 'radialgradient', 'pattern', 'filter', 'text', 'image', 'use', 'foreignobject']);
    const prop = (el, k) => { const st = el.getAttribute('style'); if (st) { const m = new RegExp('(?:^|;)\\s*' + k + '\\s*:\\s*([^;]+)').exec(st); if (m) return m[1]; } return el.getAttribute(k); };
    const rectCmds = (x, y, w, h, rx, ry) => mapCmds(toCmds({ k: 'rect', w, h, round: Math.min(rx || ry || 0, w / 2, h / 2) }), (px, py) => [px + x + w / 2, py + y + h / 2]);
    const ellCmds = (cx, cy, rx, ry) => mapCmds(toCmds({ k: 'ellipse', w: rx * 2, h: ry * 2 }), (px, py) => [px + cx, py + cy]);
    function walk(node, m, st) {
      for (const el of node.children) {
        const tag = el.localName.toLowerCase();
        if (SKIP.has(tag) || prop(el, 'display') === 'none') continue;
        const m2 = mul(m, parseTransform(el.getAttribute('transform')));
        const st2 = { fill: svgPaint(prop(el, 'fill'), st.fill), stroke: svgPaint(prop(el, 'stroke'), st.stroke), sw: svgNum(prop(el, 'stroke-width'), st.sw) };
        if (tag === 'g' || tag === 'svg' || tag === 'a') { walk(el, m2, st2); continue; }
        const A = (k, d) => svgNum(el.getAttribute(k), d); let d = null;
        try {
          if (tag === 'path') d = parsePathD(el.getAttribute('d') || '');
          else if (tag === 'rect') d = rectCmds(A('x'), A('y'), A('width'), A('height'), A('rx'), A('ry'));
          else if (tag === 'circle') d = ellCmds(A('cx'), A('cy'), A('r'), A('r'));
          else if (tag === 'ellipse') d = ellCmds(A('cx'), A('cy'), A('rx'), A('ry'));
          else if (tag === 'line') d = [['M', A('x1'), A('y1')], ['L', A('x2'), A('y2')]];
          else if (tag === 'polyline' || tag === 'polygon') {
            const n = (el.getAttribute('points') || '').split(/[\s,]+/).filter(Boolean).map(Number);
            d = []; for (let k = 0; k + 1 < n.length; k += 2) d.push([k ? 'L' : 'M', n[k], n[k + 1]]); if (tag === 'polygon') d.push(['Z']);
          }
        } catch (e) { d = null; }
        if (d && d.length > 1 && items.length < 5000) items.push({ d: mapCmds(d, (x, y) => applyM(m2, x, y)), st: st2, k: Math.sqrt(Math.abs(m2[0] * m2[3] - m2[1] * m2[2])) || 1 });
      }
    }
    walk(doc.documentElement, ID, { fill: '#000000', stroke: null, sw: 1 });
    if (!items.length) throw new Error('no shapes found in this SVG (text needs to be converted to outlines first)');
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    items.forEach((it) => it.d.forEach((c) => { for (let k = 1; k < c.length; k += 2) { x0 = Math.min(x0, c[k]); x1 = Math.max(x1, c[k]); y0 = Math.min(y0, c[k + 1]); y1 = Math.max(y1, c[k + 1]); } }));
    const res = { items, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, extent: Math.max(x1 - x0, y1 - y0) || 1, out: new Map() };
    svgCache.set(text, res); if (svgCache.size > 8) svgCache.delete(svgCache.keys().next().value);
    return res;
  }
  function svgShapes(text, size, keep) {
    const P = parseSVG(text), key = size + '|' + keep;
    if (P.out.has(key)) return P.out.get(key);
    const k = size / P.extent, shapes = P.items.map((it) => {
      const d = mapCmds(it.d, (x, y) => [(x - P.cx) * k, (y - P.cy) * k]), closed = d[d.length - 1][0] === 'Z';
      if (keep) return shape('path', { d, closed, fill: it.st.fill, stroke: it.st.stroke, sw: it.st.stroke ? it.st.sw * it.k * k : 0 });
      return closed ? shape('path', { d, closed, fill: '#ffffff', sw: 0 }) : shape('path', { d, closed, fill: null, stroke: '#ffffff', sw: 2 });
    });
    P.out.set(key, shapes); return shapes;
  }
  // pen tool path: { pts:[{x,y,ix,iy,ox,oy}], closed }  (handles are offsets from the anchor)
  function penCmds(p) {
    const P = p.pts, d = [['M', P[0].x, P[0].y]];
    const seg = (a, b) => d.push(a.ox || a.oy || b.ix || b.iy ? ['C', a.x + (a.ox || 0), a.y + (a.oy || 0), b.x + (b.ix || 0), b.y + (b.iy || 0), b.x, b.y] : ['L', b.x, b.y]);
    for (let k = 1; k < P.length; k++) seg(P[k - 1], P[k]);
    if (p.closed) { seg(P[P.length - 1], P[0]); d.push(['Z']); }
    return d;
  }

  const compat = (ot, it) => !!ot && (ot === it || ot === 'any' || it === 'any'); // can an output of type ot feed an input of type it?

  // ---------- bounds (for Align / Distribute) ----------
  function shapeBounds(s) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of flatten(bakeCmds(s), 16)) for (const p of c.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    return x0 === Infinity ? null : { x0, y0, x1, y1 };
  }
  const unionBounds = (bs) => { const l = bs.filter(Boolean); return l.length ? { x0: Math.min(...l.map((b) => b.x0)), y0: Math.min(...l.map((b) => b.y0)), x1: Math.max(...l.map((b) => b.x1)), y1: Math.max(...l.map((b) => b.y1)) } : null; };

  // ---------- boolean shape operations (union / subtract / intersect / xor) ----------
  // Planar-arrangement method: split every edge where edges cross, then keep the edges whose two sides differ in
  // "is this point inside the result?". Chain those edges into rings. Handles overlaps, shared edges and holes.
  const GRID = 1e-6, EPS = 1e-5; // GRID only welds coincident vertices; coordinates are never moved
  function ringsOf(s) { // closed contours of a shape, in world space
    return flatten(bakeCmds(s), 32).filter((c) => c.closed && c.pts.length > 3).map((c) => c.pts.slice(0, -1));
  }
  function insideRings(rings, bb, x, y) {
    if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) return false;
    let inside = false;
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const yi = r[i][1], yj = r[j][1];
      if ((yi > y) !== (yj > y) && x < ((r[j][0] - r[i][0]) * (y - yi)) / (yj - yi) + r[i][0]) inside = !inside;
    }
    return inside;
  }
  // shapes: [{rings:[[ [x,y],.. ]]}]; sel(insideFlags[]) -> is this point part of the result?
  function booleanRegions(shapes, sel) {
    const snap = (v) => v, key = (x, y) => Math.round(x / GRID) + ',' + Math.round(y / GRID);
    const sh = shapes.map((s) => {
      const rings = s.rings.map((r) => r.map((p) => [snap(p[0]), snap(p[1])]));
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      rings.forEach((r) => r.forEach((p) => { a = Math.min(a, p[0]); c = Math.max(c, p[0]); b = Math.min(b, p[1]); d = Math.max(d, p[1]); }));
      return { rings, bb: [a - 1, b - 1, c + 1, d + 1] };
    });
    const segs = [];
    sh.forEach((s) => s.rings.forEach((r) => { for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; if (a[0] !== b[0] || a[1] !== b[1]) segs.push([a[0], a[1], b[0], b[1]]); } }));
    const n = segs.length; if (!n || n > 6000) return n > 6000 ? null : [];
    const splits = segs.map(() => []);
    const minx = segs.map((s) => Math.min(s[0], s[2])), maxx = segs.map((s) => Math.max(s[0], s[2])), miny = segs.map((s) => Math.min(s[1], s[3])), maxy = segs.map((s) => Math.max(s[1], s[3]));
    const order = segs.map((_, i) => i).sort((a, b) => minx[a] - minx[b]);
    const addPt = (i, x, y) => { const s = segs[i]; if ((x === s[0] && y === s[1]) || (x === s[2] && y === s[3])) return; splits[i].push([x, y]); };
    const onSeg = (s, x, y) => { const dx = s[2] - s[0], dy = s[3] - s[1], l2 = dx * dx + dy * dy, t = ((x - s[0]) * dx + (y - s[1]) * dy) / l2; return t > 1e-9 && t < 1 - 1e-9 && Math.abs((x - s[0]) * dy - (y - s[1]) * dx) / Math.sqrt(l2) < 1e-6; };
    for (let a = 0; a < n; a++) {
      const i = order[a], si = segs[i];
      for (let b = a + 1; b < n; b++) {
        const j = order[b]; if (minx[j] > maxx[i] + 1e-9) break;
        if (miny[j] > maxy[i] + 1e-9 || maxy[j] < miny[i] - 1e-9) continue;
        const sj = segs[j], d1x = si[2] - si[0], d1y = si[3] - si[1], d2x = sj[2] - sj[0], d2y = sj[3] - sj[1];
        const den = d1x * d2y - d1y * d2x, l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y);
        if (Math.abs(den) < 1e-9 * l1 * l2) { // parallel: split at overlapping collinear endpoints
          if (onSeg(si, sj[0], sj[1])) addPt(i, sj[0], sj[1]); if (onSeg(si, sj[2], sj[3])) addPt(i, sj[2], sj[3]);
          if (onSeg(sj, si[0], si[1])) addPt(j, si[0], si[1]); if (onSeg(sj, si[2], si[3])) addPt(j, si[2], si[3]);
          continue;
        }
        const t = ((sj[0] - si[0]) * d2y - (sj[1] - si[1]) * d2x) / den, u = ((sj[0] - si[0]) * d1y - (sj[1] - si[1]) * d1x) / den;
        if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) continue;
        const px = snap(si[0] + t * d1x), py = snap(si[1] + t * d1y);
        addPt(i, px, py); addPt(j, px, py);
      }
    }
    const vid = new Map(), verts = [];
    const vertex = (x, y) => { const k = key(x, y); let v = vid.get(k); if (v === undefined) { v = verts.length; verts.push([x, y]); vid.set(k, v); } return v; };
    const edges = new Map();
    segs.forEach((s, i) => {
      const dx = s[2] - s[0], dy = s[3] - s[1], pts = [[s[0], s[1]], ...splits[i].sort((p, q) => (p[0] - s[0]) * dx + (p[1] - s[1]) * dy - ((q[0] - s[0]) * dx + (q[1] - s[1]) * dy)), [s[2], s[3]]];
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = vertex(pts[k][0], pts[k][1]), b = vertex(pts[k + 1][0], pts[k + 1][1]); if (a === b) continue;
        const ek = a < b ? a + '_' + b : b + '_' + a; if (!edges.has(ek)) edges.set(ek, [a, b]);
      }
    });
    const flags = (x, y) => sh.map((s) => insideRings(s.rings, s.bb, x, y));
    const outgoing = new Map(), boundary = [];
    for (const [a, b] of edges.values()) {
      const [ax, ay] = verts[a], [bx, by] = verts[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len, mx = (ax + bx) / 2, my = (ay + by) / 2;
      const e = Math.min(EPS, len / 4), left = sel(flags(mx + nx * e, my + ny * e)), right = sel(flags(mx - nx * e, my - ny * e));
      if (left === right) continue;
      const edge = left ? { a, b, used: false } : { a: b, b: a, used: false }; // keep the result on the left of every edge
      boundary.push(edge); if (!outgoing.has(edge.a)) outgoing.set(edge.a, []); outgoing.get(edge.a).push(edge);
    }
    const rings = [];
    for (const e0 of boundary) {
      if (e0.used) continue;
      const ids = [e0.a]; let e = e0, ok = true;
      for (let guard = 0; guard < boundary.length + 2; guard++) {
        e.used = true; if (e.b === e0.a) break; ids.push(e.b);
        const cands = (outgoing.get(e.b) || []).filter((c) => !c.used); if (!cands.length) { ok = false; break; }
        if (cands.length === 1) { e = cands[0]; continue; }
        const dix = verts[e.b][0] - verts[e.a][0], diy = verts[e.b][1] - verts[e.a][1]; let best = null, bang = Infinity;
        for (const c of cands) { const ox = verts[c.b][0] - verts[c.a][0], oy = verts[c.b][1] - verts[c.a][1], ang = Math.atan2(dix * oy - diy * ox, dix * ox + diy * oy); if (ang < bang) { bang = ang; best = c; } }
        e = best;
      }
      if (!ok || ids.length < 3) continue;
      let pts = ids.map((v) => verts[v]); // drop collinear points created by splitting
      for (let k = 0; k < pts.length && pts.length > 3;) {
        const p = pts[(k + pts.length - 1) % pts.length], q = pts[k], r = pts[(k + 1) % pts.length];
        if (Math.abs((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])) < 1e-6 && (q[0] - p[0]) * (r[0] - q[0]) + (q[1] - p[1]) * (r[1] - q[1]) > 0) pts.splice(k, 1); else k++;
      }
      if (pts.length >= 3) rings.push(pts);
    }
    return rings;
  }
  const boolCache = new Map();
  function compoundShapes(A, B, op) {
    const flat = (list) => list.map((s) => ({ s, rings: ringsOf(s) })).filter((x) => x.rings.length);
    const a = flat(A), b = flat(B); if (!a.length) return [];
    const all = [...a, ...b], na = a.length, hasWith = b.length > 0;
    const ck = op + '|' + hasWith + '|' + JSON.stringify(all.map((x) => x.rings.map((r) => r.map((p) => [Math.round(p[0] * 100), Math.round(p[1] * 100)]))));
    let rings = boolCache.get(ck);
    if (!rings) {
      const any = (f, lo, hi) => { for (let k = lo; k < hi; k++) if (f[k]) return true; return false; };
      let sel;
      if (hasWith) {
        sel = { union: (f) => any(f, 0, f.length), subtract: (f) => any(f, 0, na) && !any(f, na, f.length), intersect: (f) => any(f, 0, na) && any(f, na, f.length), xor: (f) => any(f, 0, na) !== any(f, na, f.length) }[op];
      } else {
        sel = { union: (f) => any(f, 0, f.length), subtract: (f) => f[0] && !any(f, 1, f.length), intersect: (f) => f.every(Boolean), xor: (f) => f.filter(Boolean).length % 2 === 1 }[op];
      }
      rings = booleanRegions(all.map((x) => ({ rings: x.rings })), sel || (() => false));
      if (rings === null) throw new Error('too many points to combine; try fewer or simpler shapes');
      boolCache.set(ck, rings); if (boolCache.size > 24) boolCache.delete(boolCache.keys().next().value);
    }
    if (!rings.length) return [];
    const d = []; rings.forEach((r) => { r.forEach((p, i) => d.push([i ? 'L' : 'M', p[0], p[1]])); d.push(['Z']); });
    const f = a[0].s; return [{ ...pathShape(d), fill: f.fill ?? '#ffffff', stroke: f.stroke, sw: f.sw }];
  }

  // ---------- node definitions ----------
  const num = (n, d, extra) => ({ n, d, t: 'num', ...extra });
  const geo = (n) => ({ n, t: 'geo', d: null });
  const pts = (n) => ({ n, t: 'pts', d: null });
  const en = (n, o, d) => ({ n, t: 'enum', o, d: d || o[0] });
  const any = (n) => ({ n, t: 'any', d: null });
  const PORT_COLORS = { num: '#f5a524', geo: '#4cc2ff', pts: '#7ee787', any: '#c9a7ff', enum: '#888' };

  const OPS = {
    add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => (b === 0 ? 0 : a / b),
    mod: (a, b) => (b === 0 ? 0 : ((a % b) + b) % b), pow: (a, b) => Math.pow(a, b),
    min: Math.min, max: Math.max, sin: (a, b) => Math.sin(a * b), cos: (a, b) => Math.cos(a * b), abs: (a) => Math.abs(a),
  };
  const ATTRS = {
    x: (p) => p.x, y: (p) => p.y, index: (p) => p.i, u: (p) => p.u, v: (p) => p.v,
    angle: (p) => p.a || 0, degrees: (p) => ((p.a || 0) * 180) / Math.PI, distance: (p) => Math.hypot(p.x, p.y),
  };

  const NODES = {
    // --- values
    number: { label: 'Number', cat: 'Values', out: 'num', inputs: [num('value', 1)], run: (i) => i.value },
    time: { label: 'Time', cat: 'Values', out: 'num', inputs: [num('speed', 1)], run: (i, c) => c.time * i.speed },
    series: {
      label: 'Series', cat: 'Values', out: 'num', inputs: [num('count', 10), num('start', 0), num('step', 1)],
      run: (i) => Array.from({ length: Math.max(0, Math.min(5000, Math.round(i.count))) }, (_, k) => i.start + k * i.step),
    },
    random: {
      label: 'Random', cat: 'Values', out: 'num', inputs: [num('count', 10), num('min', 0), num('max', 1), num('seed', 1)],
      run: (i) => { const r = mulberry32(i.seed); return Array.from({ length: Math.max(0, Math.min(5000, Math.round(i.count))) }, () => i.min + r() * (i.max - i.min)); },
    },
    math: {
      label: 'Math', cat: 'Values', out: 'num', inputs: [num('a', 0), num('b', 1), en('op', Object.keys(OPS))],
      run: (i) => bc(OPS[i.op] || OPS.add, i.a, i.b),
    },
    remap: {
      label: 'Remap', cat: 'Values', out: 'num',
      inputs: [num('value', 0), num('inMin', 0), num('inMax', 1), num('outMin', 0), num('outMax', 100)],
      run: (i) => bc((v, a, b, c, d) => (b === a ? c : c + ((v - a) / (b - a)) * (d - c)), i.value, i.inMin, i.inMax, i.outMin, i.outMax),
    },
    // --- points
    grid: {
      label: 'Grid', cat: 'Points', out: 'pts', inputs: [num('cols', 10), num('rows', 10), num('width', 400), num('height', 400)],
      run: (i) => {
        const cols = Math.max(1, Math.min(200, Math.round(i.cols))), rows = Math.max(1, Math.min(200, Math.round(i.rows))), out = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const u = cols > 1 ? c / (cols - 1) : 0.5, v = rows > 1 ? r / (rows - 1) : 0.5;
          out.push({ x: (u - 0.5) * i.width, y: (v - 0.5) * i.height, i: out.length, u, v });
        }
        return out;
      },
    },
    ring: {
      label: 'Ring', cat: 'Points', out: 'pts', inputs: [num('count', 12), num('radius', 150), num('start', 0)],
      run: (i) => {
        const n = Math.max(0, Math.min(5000, Math.round(i.count)));
        return Array.from({ length: n }, (_, k) => {
          const a = rad(i.start) + (k / n) * TAU;
          return { x: Math.cos(a) * i.radius, y: Math.sin(a) * i.radius, i: k, u: k / n, v: 0, a };
        });
      },
    },
    scatter: {
      label: 'Scatter', cat: 'Points', out: 'pts', inputs: [num('count', 100), num('width', 400), num('height', 400), num('seed', 1)],
      run: (i) => {
        const r = mulberry32(i.seed), n = Math.max(0, Math.min(5000, Math.round(i.count)));
        return Array.from({ length: n }, (_, k) => { const u = r(), v = r(); return { x: (u - 0.5) * i.width, y: (v - 0.5) * i.height, i: k, u, v }; });
      },
    },
    attribute: {
      label: 'Attribute', cat: 'Points', out: 'num', inputs: [pts('pts'), en('attr', Object.keys(ATTRS))],
      run: (i) => i.pts.map(ATTRS[i.attr] || ATTRS.x),
    },
    noiseField: {
      label: 'Noise Field', cat: 'Points', out: 'num', inputs: [pts('pts'), num('scale', 0.005), num('time', 0), num('amount', 1)],
      run: (i) => i.pts.map((p) => noise3(p.x * i.scale, p.y * i.scale, i.time) * i.amount),
    },
    // --- shapes
    rect: {
      label: 'Rect', cat: 'Shapes', out: 'geo', inputs: [num('w', 40), num('h', 40), num('round', 0)],
      run: (i) => many((w, h, round) => shape('rect', { w, h, round }), i.w, i.h, i.round),
    },
    ellipse: {
      label: 'Ellipse', cat: 'Shapes', out: 'geo', inputs: [num('w', 40), num('h', 40)],
      run: (i) => many((w, h) => shape('ellipse', { w, h }), i.w, i.h),
    },
    polygon: {
      label: 'Polygon', cat: 'Shapes', out: 'geo', inputs: [num('sides', 6), num('radius', 30)],
      run: (i) => many((sides, r) => shape('polygon', { sides, r }), i.sides, i.radius),
    },
    star: {
      label: 'Star', cat: 'Shapes', out: 'geo', inputs: [num('points', 5), num('outer', 30), num('inner', 14)],
      run: (i) => many((points, outer, inner) => shape('star', { points, outer, inner }), i.points, i.outer, i.inner),
    },
    line: {
      label: 'Line', cat: 'Shapes', out: 'geo', inputs: [num('length', 60)],
      run: (i) => many((len) => shape('line', { len, fill: null, stroke: '#ffffff', sw: 2 }), i.length),
    },
    svg: {
      label: 'Import SVG', cat: 'Shapes', out: 'geo',
      inputs: [{ n: 'svg', t: 'svg', d: '' }, num('size', 300), num('keepColors', 0)],
      run: (i) => (i.svg ? svgShapes(i.svg, i.size || 300, !!i.keepColors) : []),
    },
    design: {
      label: 'Design', cat: 'Shapes', out: 'geo', inputs: [num('speed', 1), num('at', -1)],
      run: (i, ctx) => {
        const d = ctx.design; if (!d || !d.shapes) return [];
        const dur = Math.max(0.1, d.duration || 4); let t = i.at >= 0 ? i.at : ctx.time * (i.speed || 1);
        t = d.loop === false ? Math.min(t, dur) : ((t % dur) + dur) % dur;
        return designShapes(d, t);
      },
    },
    draw: {
      label: 'Draw', cat: 'Shapes', out: 'geo', inputs: [{ n: 'path', t: 'draw', d: null }],
      run: (i) => {
        const p = i.path; if (!p || !p.pts || p.pts.length < 2) return [];
        const d = penCmds(p);
        return [p.closed ? shape('path', { d, closed: true, fill: '#ffffff', sw: 0 }) : shape('path', { d, closed: false, fill: null, stroke: '#ffffff', sw: 2 })];
      },
    },
    // --- modify
    transform: {
      label: 'Transform', cat: 'Modify', out: 'geo',
      inputs: [geo('geo'), num('x', 0), num('y', 0), num('rotate', 0), num('sx', 1), num('sy', 1)],
      run: (i) => i.geo.map((s, k) => ({ ...s, m: mul(trs(at(i.x, k), at(i.y, k), rad(at(i.rotate, k)), at(i.sx, k), at(i.sy, k)), s.m) })),
    },
    copy: {
      label: 'Copy to Points', cat: 'Modify', out: 'geo', inputs: [geo('geo'), pts('pts'), num('scale', 1), num('rotate', 0)],
      run: (i) => {
        const out = [];
        i.pts.forEach((p, k) => {
          const t = trs(p.x, p.y, rad(at(i.rotate, k)), at(i.scale, k), at(i.scale, k));
          for (const s of i.geo) out.push({ ...s, m: mul(t, s.m) });
        });
        return out;
      },
    },
    style: {
      label: 'Style', cat: 'Modify', out: 'geo',
      inputs: [geo('geo'), num('hue', 200), num('sat', 0), num('bri', 100), num('alpha', 1), num('strokeW', 0), num('strokeBri', 100)],
      run: (i) => i.geo.map((s, k) => {
        const a = at(i.alpha, k), sw = at(i.strokeW, k);
        return {
          ...s,
          fill: a > 0 && !isOpen(s) ? hsb(at(i.hue, k), at(i.sat, k), at(i.bri, k), a) : null,
          stroke: sw > 0 ? hsb(at(i.hue, k), at(i.sat, k), at(i.strokeBri, k), a > 0 ? Math.max(a, 0.2) : 1) : null,
          sw,
        };
      }),
    },
    merge: {
      label: 'Merge', cat: 'Modify', out: 'geo', inputs: [geo('a'), geo('b'), geo('c')],
      run: (i) => [...i.a, ...i.b, ...i.c],
    },

    wave: {
      label: 'Wave', cat: 'Values', out: 'num',
      inputs: [num('value', 0), en('type', ['sine', 'square', 'triangle', 'sawtooth']), num('period', 100), num('amplitude', 1), num('offset', 0)],
      run: (i) => bc((v, per, amp, off) => {
        const t = (((v / (per || 1)) % 1) + 1) % 1;
        const w = i.type === 'square' ? (t < 0.5 ? 1 : -1) : i.type === 'triangle' ? 4 * Math.abs(t - 0.5) - 1 : i.type === 'sawtooth' ? 2 * t - 1 : Math.sin(t * TAU);
        return off + amp * w;
      }, i.value, i.period, i.amplitude, i.offset),
    },
    snap: {
      label: 'Snap', cat: 'Values', out: 'num', inputs: [num('value', 0), num('grid', 10)],
      run: (i) => bc((v, gr) => (gr ? Math.round(v / gr) * gr : v), i.value, i.grid),
    },
    // --- lists (work on numbers, points or shapes)
    count: { label: 'Count', cat: 'Lists', out: 'num', inputs: [any('list')], run: (i) => i.list.length },
    reverse: { label: 'Reverse', cat: 'Lists', out: 'any', inputs: [any('list')], run: (i) => [...i.list].reverse() },
    shuffle: {
      label: 'Shuffle', cat: 'Lists', out: 'any', inputs: [any('list'), num('seed', 1)],
      run: (i) => { const r = mulberry32(i.seed), a = [...i.list]; for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; },
    },
    slice: { label: 'Slice', cat: 'Lists', out: 'any', inputs: [any('list'), num('start', 0), num('count', 10)], run: (i) => i.list.slice(Math.max(0, i.start), Math.max(0, i.start) + Math.max(0, i.count)) },
    takeEvery: { label: 'Take Every', cat: 'Lists', out: 'any', inputs: [any('list'), num('n', 2)], run: (i) => i.list.filter((_, k) => k % Math.max(1, Math.round(i.n)) === 0) },
    repeat: { label: 'Repeat', cat: 'Lists', out: 'any', inputs: [any('list'), num('times', 2)], run: (i) => Array.from({ length: Math.max(0, Math.min(50, Math.round(i.times))) }, () => i.list).flat() },
    combine: { label: 'Combine', cat: 'Lists', out: 'any', inputs: [any('a'), any('b'), any('c')], run: (i) => [...i.a, ...i.b, ...i.c] },
    sort: {
      label: 'Sort', cat: 'Lists', out: 'any', inputs: [any('list'), en('by', ['value', 'x', 'y', 'distance'])],
      run: (i) => {
        const key = (v) => (typeof v === 'number' ? v : i.by === 'y' ? v.y : i.by === 'distance' ? Math.hypot(v.x, v.y) : v.x);
        return [...i.list].sort((a, b) => (key(a) ?? 0) - (key(b) ?? 0));
      },
    },
    // --- geometry (NodeBox-style)
    wiggle: {
      label: 'Wiggle', cat: 'Modify', out: 'geo', inputs: [geo('geo'), num('x', 10), num('y', 10), num('seed', 1)],
      run: (i) => { const r = mulberry32(i.seed); return i.geo.map((s, k) => ({ ...s, m: mul([1, 0, 0, 1, (r() * 2 - 1) * at(i.x, k), (r() * 2 - 1) * at(i.y, k)], s.m) })); },
    },
    reflect: {
      label: 'Reflect', cat: 'Modify', out: 'geo', inputs: [geo('geo'), num('angle', 90), num('x', 0), num('y', 0), num('keep', 1)],
      run: (i) => {
        const R = mul(trs(i.x, i.y, rad(i.angle), 1, 1), mul([1, 0, 0, -1, 0, 0], trs(0, 0, -rad(i.angle), 1, 1)));
        const Rm = mul(R, [1, 0, 0, 1, -i.x, -i.y]);
        const mirrored = i.geo.map((s) => ({ ...s, m: mul(Rm, s.m) }));
        return i.keep ? [...i.geo, ...mirrored] : mirrored;
      },
    },
    connect: {
      label: 'Connect', cat: 'Paths', out: 'geo', inputs: [pts('pts'), num('close', 0), num('smooth', 0)],
      run: (i) => {
        if (i.pts.length < 2) return [];
        const closed = !!i.close;
        const d = i.smooth > 0 ? smoothCmds(i.pts, closed, i.smooth * 1.5) : i.pts.map((p, k) => [k ? 'L' : 'M', p.x, p.y]).concat(closed ? [['Z']] : []);
        return [pathShape(d)];
      },
    },
    curve: {
      label: 'Curve', cat: 'Paths', out: 'geo',
      inputs: [num('x1', -200), num('y1', 100), num('cx1', -100), num('cy1', -200), num('cx2', 100), num('cy2', 300), num('x2', 200), num('y2', -100)],
      run: (i) => many((x1, y1, cx1, cy1, cx2, cy2, x2, y2) => pathShape([['M', x1, y1], ['C', cx1, cy1, cx2, cy2, x2, y2]]), i.x1, i.y1, i.cx1, i.cy1, i.cx2, i.cy2, i.x2, i.y2),
    },
    pathPoints: {
      label: 'Path Points', cat: 'Paths', out: 'pts', inputs: [geo('geo'), num('count', 24), num('offset', 0)],
      run: (i) => {
        const out = [], n = Math.max(1, Math.min(2000, Math.round(i.count)));
        for (const s of i.geo) for (const c of flatten(bakeCmds(s))) {
          const L = polyLen(c.pts); if (!L) continue;
          for (let k = 0; k < n; k++) {
            const u = c.closed ? k / n : n > 1 ? k / (n - 1) : 0;
            let d = (u + i.offset) * L; if (c.closed) d = ((d % L) + L) % L; else d = Math.min(L, Math.max(0, d));
            const p = along(c.pts, d); out.push({ x: p.x, y: p.y, i: out.length, u, v: 0, a: p.a });
          }
        }
        return out;
      },
    },
    resample: {
      label: 'Resample', cat: 'Paths', out: 'geo', inputs: [geo('geo'), num('count', 40)],
      run: (i) => {
        const n = Math.max(2, Math.min(2000, Math.round(i.count))), out = [];
        for (const s of i.geo) {
          const d = [];
          for (const c of flatten(bakeCmds(s))) {
            const L = polyLen(c.pts); if (!L) continue;
            for (let k = 0; k < n; k++) { const p = along(c.pts, (c.closed ? k / n : k / (n - 1)) * L); d.push([k ? 'L' : 'M', p.x, p.y]); }
            if (c.closed) d.push(['Z']);
          }
          if (d.length) out.push({ ...pathShape(d), fill: s.fill, stroke: s.stroke, sw: s.sw });
        }
        return out;
      },
    },
    wigglePoints: {
      label: 'Wiggle Points', cat: 'Paths', out: 'geo', inputs: [geo('geo'), num('amount', 8), num('seed', 1)],
      run: (i) => {
        const r = mulberry32(i.seed);
        return i.geo.map((s, k) => {
          const a = at(i.amount, k);
          let dx = 0, dy = 0;
          const d = toCmds(s.k === 'path' ? s : { ...s, k: 'path', d: bakeCmds(s) }).map((c) => {
            if (c[0] === 'Z') return c;
            if (c[0] === 'M' || c[0] === 'L') { dx = (r() * 2 - 1) * a; dy = (r() * 2 - 1) * a; } // C keeps the offset of the previous anchor
            return mapCmds([c], (x, y) => [x + dx, y + dy])[0];
          });
          return { ...pathShape(d), fill: s.fill, stroke: s.stroke, sw: s.sw };
        });
      },
    },
    movePoints: {
      label: 'Move Points', cat: 'Points', out: 'pts', inputs: [pts('pts'), num('dx', 0), num('dy', 0)],
      run: (i) => i.pts.map((p, k) => ({ ...p, x: p.x + at(i.dx, k), y: p.y + at(i.dy, k) })),
    },
    align: {
      label: 'Align', cat: 'Modify', out: 'geo',
      inputs: [geo('geo'), num('x', 0), num('y', 0), en('halign', ['center', 'left', 'right', 'none']), en('valign', ['middle', 'top', 'bottom', 'none']), en('mode', ['group', 'each'])],
      run: (i) => {
        const bs = i.geo.map(shapeBounds), ub = unionBounds(bs);
        const shift = (b) => {
          if (!b) return [0, 0];
          const dx = i.halign === 'left' ? i.x - b.x0 : i.halign === 'right' ? i.x - b.x1 : i.halign === 'center' ? i.x - (b.x0 + b.x1) / 2 : 0;
          const dy = i.valign === 'top' ? i.y - b.y0 : i.valign === 'bottom' ? i.y - b.y1 : i.valign === 'middle' ? i.y - (b.y0 + b.y1) / 2 : 0;
          return [dx, dy];
        };
        return i.geo.map((s, k) => { const [dx, dy] = shift(i.mode === 'each' ? bs[k] : ub); return dx || dy ? { ...s, m: mul([1, 0, 0, 1, dx, dy], s.m) } : s; });
      },
    },
    distribute: {
      label: 'Distribute', cat: 'Modify', out: 'geo',
      inputs: [geo('geo'), en('axis', ['horizontal', 'vertical']), num('gap', 10), num('span', 0), num('center', 0)],
      run: (i) => {
        const h = i.axis !== 'vertical', bs = i.geo.map(shapeBounds), idx = bs.map((b, k) => (b ? k : -1)).filter((k) => k >= 0);
        if (!idx.length) return i.geo;
        const size = (k) => (h ? bs[k].x1 - bs[k].x0 : bs[k].y1 - bs[k].y0), total = idx.reduce((a, k) => a + size(k), 0);
        const gap = i.span > 0 && idx.length > 1 ? (i.span - total) / (idx.length - 1) : i.gap, len = total + gap * (idx.length - 1);
        const out = i.geo.slice(); let pos = i.center - len / 2;
        idx.forEach((k) => { const d = pos - (h ? bs[k].x0 : bs[k].y0); out[k] = { ...out[k], m: mul(h ? [1, 0, 0, 1, d, 0] : [1, 0, 0, 1, 0, d], out[k].m) }; pos += size(k) + gap; });
        return out;
      },
    },
    compound: {
      label: 'Compound', cat: 'Paths', out: 'geo', inputs: [geo('geo'), geo('with'), en('op', ['union', 'subtract', 'intersect', 'xor'])],
      run: (i) => compoundShapes(i.geo, i.with, i.op),
    },
    // --- output
    output: {
      label: 'Output', cat: 'Output', out: null, singleton: true,
      inputs: [geo('geo'), num('hue', 0), num('sat', 0), num('bri', 6)],
      run: (i) => ({ geo: i.geo, bg: hsb(i.hue, i.sat, i.bri) }),
    },
  };


  const DESC = {
    number: 'A single number you can tweak.', time: 'Seconds since the sketch started. Connect it to animate things.',
    series: 'A list of numbers counting up: 0, 1, 2, 3…', random: 'A list of random numbers between min and max.',
    math: 'Add, multiply and more. Works on whole lists at once.', remap: 'Convert numbers from one range to another.',
    wave: 'Turn numbers into a smooth wave (sine, square, triangle…).', snap: 'Round numbers to the nearest grid step.',
    grid: 'A grid of points.', ring: 'Points arranged in a circle.', scatter: 'Random points inside a box.',
    attribute: 'Read a number from every point: x, y, index, angle…', noiseField: 'A smooth random value for every point.',
    rect: 'A rectangle (or rounded rectangle).', ellipse: 'An ellipse or circle.', polygon: 'A shape with any number of sides.',
    star: 'A star with any number of points.', line: 'A straight line.',
    count: 'How many items are in a list.', reverse: 'Flip a list backwards.', shuffle: 'Mix up the order of a list.',
    slice: 'Take a piece of a list.', takeEvery: 'Keep every nth item of a list.', repeat: 'Repeat a list several times.',
    combine: 'Join lists together.', sort: 'Put a list in order.',
    transform: 'Move, rotate and scale shapes.', copy: 'Place a copy of a shape on every point.',
    style: 'Set color, transparency and outline. Hue runs 0–360.', merge: 'Combine shapes into one group.',
    wiggle: 'Nudge every shape by a random amount.', reflect: 'Mirror shapes across a line.', connect: 'Draw a line (or smooth curve) through a list of points.',
    curve: 'A bezier curve with two handles.', pathPoints: 'Points spaced evenly along a shape or curve. Use angle to follow its direction.',
    resample: 'Rebuild a shape from evenly spaced points, ready to wiggle.', wigglePoints: 'Nudge the points of a path so edges turn organic.',
    movePoints: 'Shift every point by amounts you give it (lists allowed).',
    design: 'Everything you made in the Design tab, animated by its timeline. Copy it onto points, wiggle it, style it.', svg: 'Bring in a logo or illustration from an SVG file. Drag a file onto the graph, too.', draw: 'Draw your own shape with the pen: click for points, drag for curves.',
    align: 'Line shapes up to a point: left, center, right, top, middle, bottom. Treat the group as one, or each shape on its own.',
    distribute: 'Space shapes evenly along a row or a column, with a gap you choose or across a fixed length.',
    compound: 'Combine shapes into one: union (merge), subtract (cut out), intersect (keep the overlap) or xor.',
    output: 'What appears on the canvas. Set the background color here.',
  };
  Object.keys(NODES).forEach((k) => { NODES[k].desc = DESC[k] || ''; });


  // ---------- design documents: a vector artboard with keyframe animation ----------
  // doc = { shapes:[{id,name,kind,x,y,w,h,rot,opacity,radius,sides,inner,pts,closed,ow,oh,fill,fillOn,stroke,sw,visible,locked,keys}], duration, loop, bg }
  // keys = { prop: [{t, v, e}] }  (e = easing used from this key to the next)
  const EASE = {
    linear: (t) => t, ease: (t) => t * t * (3 - 2 * t), in: (t) => t * t, out: (t) => 1 - (1 - t) * (1 - t),
    inout: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2), hold: () => 0,
    back: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
    bounce: (t) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
  };
  function valueAt(s, p, t) {
    const ks = s.keys && s.keys[p];
    if (!ks || !ks.length) return s[p];
    if (t <= ks[0].t) return ks[0].v;
    const last = ks[ks.length - 1]; if (t >= last.t) return last.v;
    for (let i = 0; i < ks.length - 1; i++) {
      const a = ks[i], b = ks[i + 1];
      if (t >= a.t && t < b.t) return a.v + (b.v - a.v) * (EASE[a.e] || EASE.ease)((t - a.t) / (b.t - a.t));
    }
    return last.v;
  }
  function hexA(hex, a) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex;
    let h = m[1]; if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function designShape(s, t) {
    if (!s || s.visible === false) return null;
    const v = (p) => valueAt(s, p, t), w = Math.max(0.01, Math.abs(v('w'))), h = Math.max(0.01, Math.abs(v('h')));
    const op = Math.min(1, Math.max(0, v('opacity') ?? 1)), fill = s.fillOn !== false && s.fill ? hexA(s.fill, op) : null;
    let g;
    if (s.kind === 'rect') g = shape('rect', { w, h, round: Math.max(0, v('radius') || 0) });
    else if (s.kind === 'ellipse') g = shape('ellipse', { w, h });
    else if (s.kind === 'polygon' || s.kind === 'star') {
      const n = Math.max(3, Math.round(s.sides || 5)), inner = Math.min(0.95, Math.max(0.05, v('inner') ?? 0.45)), cnt = s.kind === 'star' ? n * 2 : n, pts = [];
      for (let i = 0; i < cnt; i++) { const a = (i / cnt) * TAU - Math.PI / 2, r = s.kind === 'star' && i % 2 ? inner : 1; pts.push([Math.cos(a) * r * (w / 2), Math.sin(a) * r * (h / 2)]); }
      g = pathShape(pts.map(([x, y], i) => [i ? 'L' : 'M', x, y]).concat([['Z']]));
    } else {
      if (!s.pts || s.pts.length < 2) return null;
      const fx = w / (s.ow || w), fy = h / (s.oh || h);
      g = pathShape(mapCmds(penCmds({ pts: s.pts, closed: !!s.closed }), (x, y) => [x * fx, y * fy]));
    }
    g.m = trs(v('x') || 0, v('y') || 0, rad(v('rot') || 0), 1, 1);
    g.fill = g.k === 'path' && !g.closed ? null : fill;
    g.sw = Math.max(0, Number(s.sw) || 0); g.stroke = s.stroke && g.sw > 0 ? hexA(s.stroke, op) : null;
    g.sid = s.id;
    return g;
  }
  const designShapes = (doc, t) => ((doc && doc.shapes) || []).map((s) => designShape(s, t)).filter(Boolean);

  // ---------- custom nodes (subnetworks) ----------
  // project.subs[id] = { name, nodes, edges, inputs:[{name,node,input,t,d,o}], out:nodeId }.  Instances have type 'sub:<id>'.
  const MISSING = { label: 'Missing node', cat: '', desc: '', out: null, inputs: [], run: () => { throw new Error('this custom node no longer exists'); } };
  function getDef(type, subs, depth = 0) {
    if (NODES[type]) return NODES[type];
    const sub = type.startsWith('sub:') && subs && subs[type.slice(4)];
    if (!sub || depth > 12) return MISSING;
    const outNode = sub.nodes.find((n) => n.id === sub.out);
    return {
      label: sub.name, cat: 'Custom', custom: true, desc: 'Your custom node. Click Open to see inside.',
      out: outNode ? getDef(outNode.type, subs, depth + 1).out : null,
      inputs: sub.inputs.filter((x, i, a) => a.findIndex((y) => y.name === x.name) === i).map((x) => ({ n: x.name, t: x.t, d: x.d, o: x.o })), // one port per name
      run: (inp, ctx) => {
        if ((ctx.depth || 0) > 12) throw new Error('custom nodes are nested too deeply');
        if (!outNode) return [];
        const inject = new Map(); sub.inputs.forEach((x) => inject.set(x.node + ':' + x.input, inp[x.name]));
        const v = evalGraph(sub, { ...ctx, depth: (ctx.depth || 0) + 1 }, sub.out, inject);
        if (ctx.tap && ctx.tap.id === type.slice(4) && !('value' in ctx.tap)) ctx.tap.value = v; // lets the editor preview this node's real output
        return v;
      },
    };
  }
  const validProject = (p) => {
    const ok = (gph) => gph && Array.isArray(gph.nodes) && Array.isArray(gph.edges) && gph.nodes.every((n) => NODES[n.type] || (n.type.startsWith('sub:') && p.subs && p.subs[n.type.slice(4)]));
    return ok(p) && Object.values(p.subs || {}).every(ok);
  };

  // ---------- graph evaluation ----------
  function evalGraph(graph, ctx, target, inject) {
    const cache = new Map(), stack = new Set();
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const src = new Map(graph.edges.map((e) => [e.to + ':' + e.input, e.from]));
    function ev(id) {
      if (cache.has(id)) return cache.get(id);
      if (stack.has(id)) throw new Error('Cycle detected in graph');
      stack.add(id);
      const n = byId.get(id), def = getDef(n.type, ctx.subs), inp = {};
      for (const s of def.inputs) {
        const from = src.get(id + ':' + s.n), key = id + ':' + s.n;
        let v = from !== undefined && byId.has(from) ? ev(from) : inject && inject.has(key) ? inject.get(key) : n.params[s.n] ?? s.d;
        if (s.t === 'any') v = isL(v) ? v : v == null ? [] : [v];
        else if ((s.t === 'geo' || s.t === 'pts') && (!isL(v) || !v.every((x) => x && typeof x === 'object'))) v = [];
        inp[s.n] = v;
      }
      let out;
      try { out = def.run(inp, ctx); } catch (e) { throw new Error(`${def.label}: ${e.message}`); }
      stack.delete(id);
      cache.set(id, out);
      return out;
    }
    return ev(target);
  }
  // Evaluate a project. With previewSub, show what that custom node outputs inside the sketch.
  function evaluate(project, ctx, previewSub) {
    const tap = previewSub ? { id: previewSub } : null;
    const c2 = { ...ctx, subs: project.subs || {}, design: project.design, depth: 0, tap };
    const outNode = project.nodes.find((n) => n.type === 'output');
    const r = outNode ? evalGraph(project, c2, outNode.id, null) : { geo: [], bg: '#000' };
    const sub = previewSub && c2.subs[previewSub];
    if (!sub) return r;
    const isGeo = (v) => isL(v) && v.every((x) => x && x.k);
    if ('value' in tap && isGeo(tap.value)) return { geo: tap.value, bg: hsb(0, 0, 6), preview: true };
    if (sub.out && sub.nodes.some((n) => n.id === sub.out)) { // not used in the sketch yet: preview with its default values
      const v = evalGraph(sub, { ...c2, tap: null }, sub.out, null);
      if (isGeo(v)) return { geo: v, bg: hsb(0, 0, 6), preview: true };
    }
    return { ...r, notGeo: true };
  }

  // ---------- rendering (origin at canvas center) ----------
  function drawShapes(c, geo) {
    for (const s of geo) {
      c.save();
      c.transform(...s.m);
      tracePath(c, s);
      if (s.fill) { c.fillStyle = s.fill; c.fill(); }
      if (s.stroke && s.sw > 0) { c.strokeStyle = s.stroke; c.lineWidth = s.sw; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); }
      c.restore();
    }
  }
  function drawScene(c, W, H, scene) {
    c.save();
    c.fillStyle = scene.bg; c.fillRect(0, 0, W, H);
    c.translate(W / 2, H / 2);
    drawShapes(c, scene.geo);
    c.restore();
  }

  function toSVG(scene, W, H) {
    const f = (n) => +n.toFixed(3);
    const body = scene.geo.map((s) => {
      const st = ` fill="${s.fill || 'none'}"` + (s.stroke && s.sw > 0 ? ` stroke="${s.stroke}" stroke-width="${s.sw}" stroke-linecap="round"` : '');
      const tf = ` transform="matrix(${s.m.map(f).join(' ')})"`;
      let el;
      if (s.k === 'rect') el = `<rect x="${f(-s.w / 2)}" y="${f(-s.h / 2)}" width="${f(s.w)}" height="${f(s.h)}"${s.round > 0 ? ` rx="${f(s.round)}"` : ''}`;
      else if (s.k === 'ellipse') el = `<ellipse rx="${f(Math.abs(s.w / 2))}" ry="${f(Math.abs(s.h / 2))}"`;
      else if (s.k === 'path') el = `<path d="${cmdsToD(s.d)}"`;
      else if (s.k === 'line') el = `<line x1="${f(-s.len / 2)}" y1="0" x2="${f(s.len / 2)}" y2="0"`;
      else el = `<polygon points="${polyPoints(s).map(([x, y]) => f(x) + ',' + f(y)).join(' ')}"`;
      return el + st + tf + '/>';
    }).join('\n    ');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n  <rect width="${W}" height="${H}" fill="${scene.bg}"/>\n  <g transform="translate(${W / 2} ${H / 2})">\n    ${body}\n  </g>\n</svg>\n`;
  }

  g.Loom = Object.assign(g.Loom || {}, { NODES, PORT_COLORS, getDef, validProject, shapeBounds, compoundShapes, booleanRegions, bakeCmds, compat, penCmds, cmdsToD, flatten, tracePath, drawShapes, designShape, designShapes, valueAt, EASE, isOpen, evaluate, drawScene, toSVG, hsb, noise3, mulberry32 });
})(window);
