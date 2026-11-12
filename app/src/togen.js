/* Daub "Sketch to nodes": turns a Processing-style sketch into the Nodes tab's own nodes (Grid, Ring, Copy to Points, Style …).
 *
 *   toNodes(code) -> { nodes, edges, subs, notes, stats }
 *
 * How: the sketch is run once with a recorder in place of the canvas (frame 1, mouse in the middle), which writes down every
 * shape it draws with its final position, size, rotation and colors. Then the shapes are matched with nodes:
 *   - shapes of one kind in a row become ONE shape node, copied to points,
 *   - their positions become a Grid or a Ring (with Move Points if it is off-center), else a Scatter (approximate),
 *   - a size, rotation or color that changes from shape to shape becomes Attribute -> Remap wired into Copy / Style,
 *   - lines, triangles, quads, shapes made with beginShape() and curves become Line, Draw and Curve nodes.
 * What it cannot express (text, images, animation, the mouse) is reported in `notes`.
 *
 * This file does not touch the page, so the tests load it straight into Node.
 */
(function (g) {
  'use strict';
  const D = (g.Daub = g.Daub || {});
  const TAU = Math.PI * 2, DEG = 180 / Math.PI;
  const MAX_SHAPES = 20000;

  // ---------------------------------------------------------------- colors
  const rgbToHsb = (r, g2, b) => {
    r /= 255; g2 /= 255; b /= 255;
    const mx = Math.max(r, g2, b), mn = Math.min(r, g2, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g2 - b) / d) % 6 : mx === g2 ? (b - r) / d + 2 : (r - g2) / d + 4;
    return { h: ((h * 60) + 360) % 360, s: mx ? (d / mx) * 100 : 0, b: mx * 100 };
  };
  const hsbToRgb = (h, s, v) => {
    h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); v = Math.max(0, Math.min(1, v));
    const f = (n) => { const k = (n + h / 60) % 6; return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255); };
    return [f(5), f(3), f(1)];
  };
  const parseColor = (s) => {
    if (Array.isArray(s)) return s;
    let m = /^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/.exec(String(s));
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s));
    if (m) { const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4), 16), 1]; }
    return [255, 255, 255, 1];
  };

  // ---------------------------------------------------------------- the recorder: a stand-in for the Processing API
  function record(code) {
    const notes = new Set(), shapes = [];
    let W = 600, H = 600, bg = null;
    let rng = D.mulberry32(1), noiseOff = 0, spare = null;
    const MAXES = { rgb: [255, 255, 255, 255], hsb: [360, 100, 100, 1] };
    let st = { fill: [255, 255, 255, 1], stroke: [0, 0, 0, 1], sw: 1, mode: 'rgb', max: MAXES.rgb, rectMode: 'corner', ellipseMode: 'center' };
    let M = [1, 0, 0, 1, 0, 0];
    const stack = [];
    let shape = null;

    const col = (a) => {
      if (typeof a[0] === 'string') return parseColor(a[0]);
      const n = (v, i) => v / st.max[i];
      let c1, c2, c3, al = 1;
      if (a.length === 1) { c1 = c2 = c3 = n(a[0], 2); if (st.mode === 'hsb') { c1 = 0; c2 = 0; } }
      else if (a.length === 2) { c1 = c2 = c3 = n(a[0], 2); al = n(a[1], 3); if (st.mode === 'hsb') { c1 = 0; c2 = 0; } }
      else { c1 = n(a[0], 0); c2 = n(a[1], 1); c3 = n(a[2], 2); if (a.length > 3) al = n(a[3], 3); }
      if (st.mode === 'hsb') { const [r, g2, b] = hsbToRgb(c1 * 360, c2, c3); return [r, g2, b, al]; }
      return [Math.round(c1 * 255), Math.round(c2 * 255), Math.round(c3 * 255), al];
    };
    const css = (c) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${c[3]})`;
    const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    const apply = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
    const sx = () => Math.hypot(M[0], M[1]), sy = () => Math.hypot(M[2], M[3]);
    const checkShear = () => { if (Math.abs(M[0] * M[2] + M[1] * M[3]) > 1e-6 * sx() * sy() + 1e-9) notes.add('A shear () was used, so some shapes are only roughly placed.'); };
    const add = (s) => {
      if (shapes.length >= MAX_SHAPES) return;
      s.fill = st.fill; s.stroke = st.stroke; s.sw = st.sw; shapes.push(s);
    };
    const box = (mode, x, y, w, h) => (mode === 'center' ? [x - w / 2, y - h / 2, w, h] : mode === 'radius' ? [x - w, y - h, w * 2, h * 2] : mode === 'corners' ? [x, y, w - x, h - y] : [x, y, w, h]);
    const nope = (what) => () => { notes.add(`${what} is not converted.`); };

    const p = {
      width: W, height: H, frameCount: 1, mouseX: W / 2, mouseY: H / 2, pmouseX: W / 2, pmouseY: H / 2, mouseIsPressed: false, mouseButton: 0, key: '', keyCode: 0, keyIsPressed: false,
      PI: Math.PI, TWO_PI: TAU, TAU, HALF_PI: Math.PI / 2, QUARTER_PI: Math.PI / 4, CLOSE: true,
      CENTER: 'center', CORNER: 'corner', CORNERS: 'corners', RADIUS: 'radius', LEFT: 37, RIGHT: 39, UP: 38, DOWN: 40, TOP: 'top', BOTTOM: 'bottom', BASELINE: 'baseline',
      RGB: 'rgb', HSB: 'hsb', ROUND: 'round', SQUARE: 'butt', PROJECT: 'square', MITER: 'miter', BEVEL: 'bevel',
      POINTS: 'points', LINES: 'lines', TRIANGLES: 'triangles', TRIANGLE_STRIP: 'triangle_strip', TRIANGLE_FAN: 'triangle_fan', QUADS: 'quads', QUAD_STRIP: 'quad_strip',
      ADD: 'add', BLEND: 'blend', MULTIPLY: 'multiply', SCREEN: 'screen', DIFFERENCE: 'difference',
      size: (w, h) => { W = w; H = h; p.width = w; p.height = h; p.mouseX = p.pmouseX = w / 2; p.mouseY = p.pmouseY = h / 2; }, createCanvas: (w, h) => p.size(w, h),
      smooth() {}, noSmooth() {}, pixelDensity() {}, frameRate() {}, noLoop() {}, loop() {}, redraw() {}, cursor() {}, noCursor() {}, fullScreen() {}, strokeCap() {}, strokeJoin() {}, blendMode() {},
      print() {}, println() {}, millis: () => 0, hour: () => 12, minute: () => 0, second: () => 0, day: () => 1, month: () => 1, year: () => 2026,
      // color and style
      colorMode: (m, ...mx) => { st.mode = String(m).toLowerCase(); st.max = mx.length === 1 ? [mx[0], mx[0], mx[0], mx[0]] : mx.length >= 3 ? [mx[0], mx[1], mx[2], mx[3] ?? MAXES[st.mode][3]] : MAXES[st.mode]; },
      color: (...a) => css(col(a)),
      background: (...a) => { bg = col(a); },
      clear() { bg = null; },
      fill: (...a) => { st.fill = col(a); }, noFill() { st.fill = null; },
      stroke: (...a) => { st.stroke = col(a); }, noStroke() { st.stroke = null; },
      strokeWeight: (w) => { st.sw = w; },
      lerpColor: (c1, c2, t) => { const a = parseColor(c1), b = parseColor(c2); return css(a.map((v, i) => v + (b[i] - v) * t)); },
      red: (c) => parseColor(c)[0], green: (c) => parseColor(c)[1], blue: (c) => parseColor(c)[2], alpha: (c) => parseColor(c)[3] * 255,
      brightness: (c) => (Math.max(...parseColor(c).slice(0, 3)) / 255) * st.max[2],
      rectMode: (m) => { st.rectMode = m; }, ellipseMode: (m) => { st.ellipseMode = m; },
      // transforms
      translate: (x, y) => { M = mul(M, [1, 0, 0, 1, x, y]); }, rotate: (a) => { const c = Math.cos(a), s = Math.sin(a); M = mul(M, [c, s, -s, c, 0, 0]); },
      scale: (x, y) => { M = mul(M, [x, 0, 0, y ?? x, 0, 0]); },
      shearX: (a) => { M = mul(M, [1, 0, Math.tan(a), 1, 0, 0]); }, shearY: (a) => { M = mul(M, [1, Math.tan(a), 0, 1, 0, 0]); },
      applyMatrix: (a, b, c, d, e, f) => { M = mul(M, [a, b, c, d, e, f]); }, resetMatrix: () => { M = [1, 0, 0, 1, 0, 0]; },
      pushMatrix: () => stack.push({ M: M.slice(), st: null }), popMatrix: () => { const s = stack.pop(); if (s) M = s.M; },
      pushStyle: () => stack.push({ M: null, st: { ...st } }), popStyle: () => { const s = stack.pop(); if (s && s.st) st = s.st; },
      push: () => stack.push({ M: M.slice(), st: { ...st } }), pop: () => { const s = stack.pop(); if (s) { if (s.M) M = s.M; if (s.st) st = s.st; } },
      // shapes
      rect: (x, y, w, h, r = 0) => {
        const [bx, by, bw, bh] = box(st.rectMode, x, y, w, h ?? w); checkShear();
        const [cx, cy] = apply(bx + bw / 2, by + bh / 2);
        add({ kind: 'rect', cx, cy, w: Math.abs(bw) * sx(), h: Math.abs(bh) * sy(), rot: Math.atan2(M[1], M[0]) * DEG, round: r * (sx() + sy()) / 2 });
      },
      square: (x, y, s) => p.rect(x, y, s, s),
      ellipse: (x, y, w, h) => {
        const [bx, by, bw, bh] = box(st.ellipseMode, x, y, w, h ?? w); checkShear();
        const [cx, cy] = apply(bx + bw / 2, by + bh / 2);
        add({ kind: 'ellipse', cx, cy, w: Math.abs(bw) * sx(), h: Math.abs(bh) * sy(), rot: Math.atan2(M[1], M[0]) * DEG });
      },
      circle: (x, y, d) => p.ellipse(x, y, d, d),
      line: (x1, y1, x2, y2) => {
        const a = apply(x1, y1), b = apply(x2, y2);
        shapes.length < MAX_SHAPES && shapes.push({ kind: 'line', cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, len: Math.hypot(b[0] - a[0], b[1] - a[1]), rot: Math.atan2(b[1] - a[1], b[0] - a[0]) * DEG, w: 0, h: 0, fill: null, stroke: st.stroke, sw: st.sw * (sx() + sy()) / 2 });
      },
      point: (x, y) => { const [cx, cy] = apply(x, y), d = Math.max(1, st.sw * sx()); shapes.length < MAX_SHAPES && shapes.push({ kind: 'ellipse', cx, cy, w: d, h: d, rot: 0, fill: st.stroke, stroke: null, sw: 0 }); },
      triangle: (...a) => p.quad(...a),
      quad: (...a) => { const pts = []; for (let i = 0; i < a.length; i += 2) pts.push(apply(a[i], a[i + 1])); add({ kind: 'path', pts, closed: true }); },
      bezier: (x1, y1, cx1, cy1, cx2, cy2, x2, y2) => {
        const q = [apply(x1, y1), apply(cx1, cy1), apply(cx2, cy2), apply(x2, y2)];
        shapes.length < MAX_SHAPES && shapes.push({ kind: 'curve', q, fill: null, stroke: st.stroke, sw: st.sw * (sx() + sy()) / 2 });
      },
      beginShape: (mode) => { shape = { mode: typeof mode === 'string' ? mode : null, pts: [] }; },
      vertex: (x, y) => { if (shape) shape.pts.push(apply(x, y)); },
      bezierVertex: (a, b, c, d, e, f) => { if (shape) { notes.add('Curved vertices in beginShape() are drawn as straight lines.'); shape.pts.push(apply(e, f)); } },
      quadraticVertex: (a, b, c, d) => { if (shape) { notes.add('Curved vertices in beginShape() are drawn as straight lines.'); shape.pts.push(apply(c, d)); } },
      endShape: (close) => {
        if (!shape) return;
        const { pts, mode } = shape; shape = null;
        if (pts.length < 2) return;
        if (!mode) add({ kind: 'path', pts, closed: !!close });
        else if (mode === 'triangle_strip') for (let i = 2; i < pts.length; i++) add({ kind: 'path', pts: [pts[i - 2], pts[i - 1], pts[i]], closed: true });
        else if (mode === 'triangle_fan') for (let i = 2; i < pts.length; i++) add({ kind: 'path', pts: [pts[0], pts[i - 1], pts[i]], closed: true });
        else if (mode === 'triangles') for (let i = 0; i + 2 < pts.length; i += 3) add({ kind: 'path', pts: pts.slice(i, i + 3), closed: true });
        else if (mode === 'quads') for (let i = 0; i + 3 < pts.length; i += 4) add({ kind: 'path', pts: pts.slice(i, i + 4), closed: true });
        else notes.add(`beginShape(${mode.toUpperCase()}) is not converted.`);
      },
      arc: nope('arc()'), text: nope('Text'), textSize() {}, textFont() {}, textAlign() {}, createFont: () => ({}), textWidth: () => 10,
      image: nope('Images'), loadImage: () => ({ width: 1, height: 1, pixels: [], resize() {}, loadPixels() {} }), createImage: () => ({ width: 1, height: 1, pixels: [] }),
      // math and random
      map: (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c), norm: (v, a, b) => (v - a) / (b - a), lerp: (a, b, t) => a + (b - a) * t,
      constrain: (v, lo, hi) => Math.min(hi, Math.max(lo, v)), dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1), mag: (x, y) => Math.hypot(x, y), sq: (v) => v * v,
      radians: (d) => (d * Math.PI) / 180, degrees: (r) => (r * 180) / Math.PI,
      random: (a, b) => { if (Array.isArray(a)) return a[Math.floor(rng() * a.length)]; if (a === undefined) return rng(); return b === undefined ? rng() * a : a + rng() * (b - a); },
      randomSeed: (s) => { rng = D.mulberry32(s); spare = null; },
      randomGaussian: (mean = 0, sd = 1) => {
        if (spare !== null) { const v = spare; spare = null; return mean + sd * v; }
        let u, v, s2; do { u = rng() * 2 - 1; v = rng() * 2 - 1; s2 = u * u + v * v; } while (s2 >= 1 || s2 === 0);
        const m = Math.sqrt((-2 * Math.log(s2)) / s2); spare = v * m; return mean + sd * u * m;
      },
      noise: (x, y = 0, z = 0) => D.noise3(x + noiseOff, y, z), noiseSeed: (s) => { noiseOff = s * 131.7; }, noiseDetail() {},
      int: (v) => Math.trunc(v), float: (v) => parseFloat(v), str: (v) => String(v), boolean: (v) => !!v, char: (v) => (typeof v === 'number' ? String.fromCharCode(v) : v),
      nf: (v, left = 0, right = 0) => { const s = Math.abs(v).toFixed(right), [i, d] = s.split('.'); return (v < 0 ? '-' : '') + i.padStart(left, '0') + (d ? '.' + d : ''); },
    };
    ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'pow', 'min', 'max', 'exp', 'log'].forEach((k) => { p[k] = Math[k]; });

    let failed = null;
    try {
      const EVENTS = ['mousePressed', 'mouseReleased', 'mouseClicked', 'mouseMoved', 'mouseDragged', 'keyPressed', 'keyReleased', 'keyTyped'];
      // eslint-disable-next-line no-new-func
      const fns = new Function('p', `with(p){\n${code}\n;return {setup: typeof setup==='function'?setup:null, draw: typeof draw==='function'?draw:null, ev: ${JSON.stringify(EVENTS)}.filter((e)=>{try{return typeof eval(e)==='function'}catch(x){return false}})};}`)(p);
      if (fns.setup) fns.setup();
      if (fns.draw) fns.draw();
      if (fns.ev.length) notes.add('Mouse and keyboard events are not converted.');
    } catch (e) {
      failed = e;
      notes.add(e instanceof ReferenceError ? `“${String(e.message).split(' ')[0]}” is not supported here, so the nodes show only what was drawn before it.` : `The sketch stopped with an error (${e.message}), so the nodes show only what was drawn before it.`);
    }
    return { shapes, bg, W, H, notes, failed };
  }

  // ---------------------------------------------------------------- matching shapes to nodes
  const NODES = () => D.NODES;
  const near = (a, b, t) => Math.abs(a - b) <= t;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);

  // x values grouped within `tol`
  const cluster = (vals, tol) => {
    const sorted = [...vals].sort((a, b) => a - b), out = [];
    for (const v of sorted) { const last = out[out.length - 1]; if (last && near(v, last.sum / last.n, tol)) { last.sum += v; last.n++; } else out.push({ sum: v, n: 1 }); }
    return out.map((c) => c.sum / c.n);
  };
  const even = (a, tol) => { if (a.length < 3) return true; const step = (a[a.length - 1] - a[0]) / (a.length - 1); return a.every((v, i) => near(v, a[0] + i * step, tol)); };

  // positions -> a Grid (and the order the instances must be in), or null
  function detectGrid(P) {
    const xs = cluster(P.map((q) => q.x), 0.75), ys = cluster(P.map((q) => q.y), 0.75);
    const cols = xs.length, rows = ys.length;
    if (cols * rows !== P.length || (cols === 1 && rows === 1) || cols > 200 || rows > 200 || !even(xs, 0.75) || !even(ys, 0.75)) return null;
    const idx = (arr, v) => { let b = 0; for (let i = 1; i < arr.length; i++) if (Math.abs(arr[i] - v) < Math.abs(arr[b] - v)) b = i; return b; };
    const order = new Array(P.length).fill(-1);
    for (let k = 0; k < P.length; k++) { const slot = idx(ys, P[k].y) * cols + idx(xs, P[k].x); if (order[slot] !== -1) return null; order[slot] = k; }
    const width = cols > 1 ? xs[cols - 1] - xs[0] : 100, height = rows > 1 ? ys[rows - 1] - ys[0] : 100;
    return { type: 'grid', params: { cols, rows, width, height }, cx: (xs[0] + xs[cols - 1]) / 2, cy: (ys[0] + ys[rows - 1]) / 2, order };
  }
  function detectRing(P) {
    const N = P.length;
    if (N < 3) return null;
    const cx = mean(P.map((q) => q.x)), cy = mean(P.map((q) => q.y));
    const r = mean(P.map((q) => Math.hypot(q.x - cx, q.y - cy)));
    if (r < 1 || !P.every((q) => near(Math.hypot(q.x - cx, q.y - cy), r, Math.max(0.75, r * 0.004)))) return null;
    const ang = P.map((q, k) => ({ k, a: Math.atan2(q.y - cy, q.x - cx) })).sort((a, b) => a.a - b.a);
    for (let i = 0; i < N; i++) { const d = (ang[(i + 1) % N].a - ang[i].a + TAU) % TAU; if (!near(d, TAU / N, 0.03 + 1 / r)) return null; }
    // start where the sketch's loop started, going the way it went, so values that grow with the loop counter stay a straight line
    const angOf = (k) => Math.atan2(P[k].y - cy, P[k].x - cx);
    const forward = ((angOf(1) - angOf(0) + TAU) % TAU) < Math.PI;
    const first = forward ? 0 : N - 1, at = ang.findIndex((q) => q.k === first);
    const order = ang.slice(at).concat(ang.slice(0, at)).map((q) => q.k);
    return { type: 'ring', params: { count: N, radius: r, start: angOf(first) * DEG }, cx, cy, order };
  }

  // a tiny graph builder
  function builder() {
    const nodes = [], edges = []; let n = 0;
    return {
      nodes, edges,
      add: (type, params = {}) => { const id = type === 'output' ? 'out' : 'n' + ++n; nodes.push({ id, type, x: 0, y: 0, params }); return id; },
      wire: (from, to, input) => edges.push({ from, to, input }),
    };
  }

  // fit a list of numbers to  a + b * attribute  (or call it constant). Returns { constant } | { attr, a, b, lo, hi } | null
  // `mod`: the values go round (angles, hues), so 10 and 370 are the same
  function fitList(vals, attrs, tol, mod) {
    const wrap = (d) => ((((d + mod / 2) % mod) + mod) % mod) - mod / 2;
    const raw = vals;
    if (mod) { vals = [raw[0]]; for (let i = 1; i < raw.length; i++) vals.push(vals[i - 1] + wrap(raw[i] - raw[i - 1])); } // follow the values round
    const lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo <= tol) return { constant: mean(vals) };
    for (const name of ['index', 'x', 'y', 'distance', 'degrees', 'u', 'v']) {
      const A = attrs[name]; if (!A) continue;
      const am = mean(A), vm = mean(vals);
      let sxy = 0, sxx = 0;
      for (let i = 0; i < vals.length; i++) { sxy += (A[i] - am) * (vals[i] - vm); sxx += (A[i] - am) ** 2; }
      if (sxx < 1e-9) continue;
      const b = sxy / sxx, a = vm - b * am;
      if (vals.every((v, i) => Math.abs(mod ? wrap(a + b * A[i] - v) : a + b * A[i] - v) <= tol)) return { attr: name, a, b, lo: Math.min(...A), hi: Math.max(...A) };
    }
    return null;
  }
  const round = (v, d = 3) => { const k = 10 ** d; return Math.round(v * k) / k; };

  function toNodes(code) {
    const rec = record(String(code));
    const { shapes, W, H } = rec, notes = rec.notes;
    const B = builder();
    const stats = { shapes: shapes.length, approximate: 0, skipped: 0 };
    const outs = []; // geo node ids, in paint order

    const styleOf = (s) => { // Style node values for one recorded shape, or null if it paints nothing
      const f = s.fill && s.fill[3] > 0 ? s.fill : null, k = s.stroke && s.sw > 0 && s.stroke[3] > 0 ? s.stroke : null;
      if (!f && !k) return null;
      if (f) {
        const h = rgbToHsb(f[0], f[1], f[2]);
        if (k) { const kb = rgbToHsb(k[0], k[1], k[2]); return { hue: h.h, sat: h.s, bri: h.b, alpha: f[3], strokeW: s.sw, strokeBri: kb.b, mixed: Math.abs(kb.h - h.h) > 20 && kb.s > 15 && h.s > 15 }; }
        return { hue: h.h, sat: h.s, bri: h.b, alpha: f[3], strokeW: 0, strokeBri: 100 };
      }
      const kb = rgbToHsb(k[0], k[1], k[2]);
      return { hue: kb.h, sat: kb.s, bri: kb.b, alpha: 0, strokeW: s.sw, strokeBri: kb.b }; // alpha 0 = outline only
    };
    const geoOf = (s) => { // one shape -> its node
      if (s.kind === 'rect') return B.add('rect', { w: round(s.w), h: round(s.h), round: round(s.round || 0) });
      if (s.kind === 'ellipse') return B.add('ellipse', { w: round(s.w), h: round(s.h) });
      return B.add('line', { length: round(s.len) });
    };
    const centered = (s) => ({ x: s.cx - W / 2, y: s.cy - H / 2 });

    // 1. cut the shapes into batches: runs of one kind, or two or three kinds alternating
    const groupable = (s) => s.kind === 'rect' || s.kind === 'ellipse' || s.kind === 'line';
    const keyOf = (s) => (s.kind === 'rect' ? `rect${s.round > 0 ? 'r' : ''}` : s.kind === 'ellipse' ? 'ellipse' : s.kind === 'line' ? 'line' : 'other');
    const batches = [];
    for (let i = 0; i < shapes.length;) {
      if (!groupable(shapes[i])) { batches.push([shapes[i]]); i++; continue; }
      const key = keyOf(shapes[i]);
      let j = i; while (j < shapes.length && keyOf(shapes[j]) === key) j++;
      if (j - i >= 4) { batches.push(shapes.slice(i, j)); i = j; continue; }
      let done = false;
      for (let per = 2; per <= 3 && !done; per++) { // e.g. rect, ellipse, rect, ellipse …
        const keys = shapes.slice(i, i + per).map(keyOf);
        if (new Set(keys).size < per || keys.some((k) => k === 'other')) continue;
        let m = i; while (m < shapes.length && keyOf(shapes[m]) === keys[(m - i) % per]) m++;
        const periods = Math.floor((m - i) / per);
        if (periods >= 4) {
          for (let q = 0; q < per; q++) batches.push(shapes.slice(i, i + periods * per).filter((_, x) => x % per === q));
          i += periods * per; done = true;
        }
      }
      if (!done) { batches.push(shapes.slice(i, j)); i = j; }
    }

    // 2. each batch -> nodes
    const mergeAll = (ids) => { // Merge takes three at a time
      while (ids.length > 3) { const next = []; for (let i = 0; i < ids.length; i += 3) { const grp = ids.slice(i, i + 3); if (grp.length === 1) { next.push(grp[0]); continue; } const m = B.add('merge'); grp.forEach((id, k) => B.wire(id, m, 'abc'[k])); next.push(m); } ids = next; }
      if (ids.length === 1) return ids[0];
      const m = B.add('merge'); ids.forEach((id, k) => B.wire(id, m, 'abc'[k])); return m;
    };
    const styled = (geo, st) => { // wrap a geo node in a Style node with constant values
      const sid = B.add('style', { hue: round(st.hue, 1), sat: round(st.sat, 1), bri: round(st.bri, 1), alpha: round(st.alpha, 2), strokeW: round(st.strokeW, 2), strokeBri: round(st.strokeBri, 1) });
      B.wire(geo, sid, 'geo'); return sid;
    };
    const individual = (s) => {
      const st = styleOf(s); if (!st) { stats.skipped++; return null; }
      if (st.mixed) notes.add('Where a shape has a fill and an outline in different hues, the outline takes the fill’s hue.');
      let geo;
      if (s.kind === 'path') {
        const pts = s.pts.map(([x, y]) => ({ x: round(x - W / 2, 2), y: round(y - H / 2, 2) }));
        geo = B.add('draw', { path: { pts, closed: !!s.closed } });
      } else if (s.kind === 'curve') {
        const [a, b, c, d] = s.q.map(([x, y]) => [round(x - W / 2, 2), round(y - H / 2, 2)]);
        geo = B.add('curve', { x1: a[0], y1: a[1], cx1: b[0], cy1: b[1], cx2: c[0], cy2: c[1], x2: d[0], y2: d[1] });
      } else {
        const t = centered(s), base = geoOf(s);
        geo = B.add('transform', { x: round(t.x, 2), y: round(t.y, 2), rotate: round(s.rot, 2) }); B.wire(base, geo, 'geo');
      }
      return styled(geo, st);
    };

    for (const batch of batches) {
      const first = batch[0];
      if (!/^(rect|ellipse|line)$/.test(first.kind)) { for (const s of batch) { const id = individual(s); if (id) outs.push(id); } continue; }
      const live = batch.filter((s) => styleOf(s));
      stats.skipped += batch.length - live.length;
      if (!live.length) continue;
      if (live.length < 4) { for (const s of live) outs.push(individual(s)); continue; }

      // positions -> Grid / Ring / Scatter
      let P = live.map(centered), layout = detectGrid(P) || detectRing(P), scatter = false;
      if (!layout && live.length <= 12) { const ids = live.map(individual); if (ids.every(Boolean)) outs.push(mergeAll(ids)); continue; }
      let inst = live;
      if (layout) { inst = layout.order.map((k) => live[k]); P = inst.map(centered); }
      else {
        scatter = true; stats.approximate += live.length;
        const xs = P.map((q) => q.x), ys = P.map((q) => q.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        layout = { type: 'scatter', params: { count: live.length, width: round(x1 - x0, 1), height: round(y1 - y0, 1), seed: 1 }, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
        notes.add(`${live.length} shapes sit at random-looking places. A Scatter node stands in for them, so the pattern is similar but not the same.`);
      }
      let pts = B.add(layout.type, layout.type === 'grid' || layout.type === 'scatter' ? Object.fromEntries(Object.entries(layout.params).map(([k, v]) => [k, round(v, 3)])) : { count: layout.params.count, radius: round(layout.params.radius, 3), start: round(layout.params.start, 3) });
      if (Math.abs(layout.cx) > 0.4 || Math.abs(layout.cy) > 0.4) { const mv = B.add('movePoints', { dx: round(layout.cx, 3), dy: round(layout.cy, 3) }); B.wire(pts, mv, 'pts'); pts = mv; }

      // the exact point attributes the engine will compute, to fit the per-shape values against
      const ptsList = (() => {
        const N = NODES(), q = layout.params; let list = layout.type === 'grid' ? N.grid.run({ cols: q.cols, rows: q.rows, width: q.width, height: q.height }) : layout.type === 'ring' ? N.ring.run({ count: q.count, radius: q.radius, start: q.start }) : N.scatter.run({ count: q.count, width: q.width, height: q.height, seed: q.seed });
        return list.map((o) => ({ ...o, x: o.x + layout.cx, y: o.y + layout.cy }));
      })();
      const attrs = {}; if (!scatter) for (const a of ['index', 'x', 'y', 'distance', 'degrees', 'u', 'v']) attrs[a] = NODES().attribute.run({ pts: ptsList, attr: a });

      const sts = inst.map(styleOf);
      const param = (vals, tol, label, mod) => { // a number, or a little graph that computes the list
        const f = scatter ? (Math.max(...vals) - Math.min(...vals) <= tol ? { constant: mean(vals) } : null) : fitList(vals, attrs, tol, mod);
        if (f && 'constant' in f) return { value: f.constant };
        if (f) {
          const at = B.add('attribute', { attr: f.attr }); B.wire(pts, at, 'pts');
          const rm = B.add('remap', { inMin: round(f.lo, 4), inMax: round(f.hi, 4), outMin: round(f.a + f.b * f.lo, 4), outMax: round(f.a + f.b * f.hi, 4) }); B.wire(at, rm, 'value');
          return { node: rm };
        }
        stats.approximate += 1; notes.add(`${label} changes from shape to shape in a way the nodes cannot copy exactly, so a Random node gives similar values.`);
        const rn = B.add('random', { count: vals.length, min: round(Math.min(...vals), 3), max: round(Math.max(...vals), 3), seed: 1 });
        return { node: rn };
      };
      const set = (id, input, r) => { if (r.node) B.wire(r.node, id, input); else B.nodes.find((q) => q.id === id).params[input] = round(r.value, 4); };

      // The shapes: either one shape copied to every point (when they only differ in size), or a list of shapes, each moved to its place
      const aspects = inst.map((q) => q.w / (q.h || 1)), kind = inst[0].kind;
      const listMode = !scatter && kind !== 'line' && Math.max(...aspects) - Math.min(...aspects) > 0.02 * Math.max(...aspects);
      let geoNode;
      if (listMode) {
        const base = B.add(kind, kind === 'rect' ? { round: round(inst[0].round || 0, 3) } : {});
        set(base, 'w', param(inst.map((q) => q.w), 0.3, 'The width')); set(base, 'h', param(inst.map((q) => q.h), 0.3, 'The height'));
        const tr = B.add('transform', {}); B.wire(base, tr, 'geo');
        for (const axis of ['x', 'y']) { const at = B.add('attribute', { attr: axis }); B.wire(pts, at, 'pts'); B.wire(at, tr, axis); }
        set(tr, 'rotate', param(inst.map((q) => q.rot), 1, 'The rotation', 360));
        geoNode = tr;
      } else {
        const base = geoOf(inst[0]); // the shape every point gets a copy of, at the first shape's size
        const w0 = kind === 'line' ? inst[0].len : inst[0].w || 1;
        const cp = B.add('copy', {}); B.wire(base, cp, 'geo'); B.wire(pts, cp, 'pts');
        set(cp, 'scale', param(inst.map((q) => (q.kind === 'line' ? q.len : q.w) / (w0 || 1)), 0.02, 'The size'));
        set(cp, 'rotate', param(inst.map((q) => q.rot), 1, 'The rotation', 360));
        geoNode = cp;
      }
      const sid = B.add('style', {}); B.wire(geoNode, sid, 'geo');
      set(sid, 'hue', param(sts.map((q) => q.hue), 3.6, 'The color', 360));
      set(sid, 'sat', param(sts.map((q) => q.sat), 3, 'The color'));
      set(sid, 'bri', param(sts.map((q) => q.bri), 3, 'The color'));
      set(sid, 'alpha', param(sts.map((q) => q.alpha), 0.03, 'The opacity'));
      set(sid, 'strokeW', param(sts.map((q) => q.strokeW), 0.1, 'The outline width'));
      set(sid, 'strokeBri', param(sts.map((q) => q.strokeBri), 3, 'The outline brightness'));
      outs.push(sid);
    }

    if (shapes.length >= MAX_SHAPES) notes.add(`Only the first ${MAX_SHAPES} shapes were converted.`);
    if (!shapes.length && !notes.size) notes.add('Nothing was drawn in the first frame, so there is nothing to convert.');
    if (stats.skipped) notes.add(`${stats.skipped} shape${stats.skipped === 1 ? '' : 's'} with no fill and no outline ${stats.skipped === 1 ? 'was' : 'were'} left out.`);
    notes.add('The nodes show the first frame, with the mouse in the middle. Animation and the mouse are not converted: add a Time node to the Nodes tab to animate.');

    // output node: the background, and everything merged in paint order
    const bgc = rec.bg ? rgbToHsb(rec.bg[0], rec.bg[1], rec.bg[2]) : { h: 0, s: 0, b: 0 };
    const out = B.add('output', { hue: round(bgc.h, 1), sat: round(bgc.s, 1), bri: round(bgc.b, 1) });
    if (outs.length) B.wire(mergeAll(outs), out, 'geo');

    // layout: left to right by depth, top to bottom within a column
    const depth = new Map();
    const dep = (id) => { if (depth.has(id)) return depth.get(id); depth.set(id, 0); const d = Math.max(-1, ...B.edges.filter((e) => e.to === id).map((e) => dep(e.from))) + 1; depth.set(id, d); return d; };
    B.nodes.forEach((q) => dep(q.id));
    const rowOf = new Map();
    B.nodes.forEach((q) => { const d = depth.get(q.id), r = rowOf.get(d) || 0; rowOf.set(d, r + 1); q.x = d * 250; q.y = r * 175; });
    return { nodes: B.nodes, edges: B.edges, subs: {}, notes: [...notes], stats };
  }

  D.togen = { toNodes, record };
})(window);
