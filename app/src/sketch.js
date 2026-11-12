/* Daub code mode: a Processing-style API over Canvas 2D (JavaScript flavour).
 * Origin top-left, y down. setup() once, draw() every frame.
 * Colors: colorMode(RGB) -> 0-255 channels; colorMode(HSB) -> h 0-360, s 0-100, b 0-100, a 0-1.
 *         colorMode(mode, max1, max2, max3, maxA) overrides ranges, as in Processing.
 */
(function (g) {
  'use strict';
  const { hsb, noise3, mulberry32 } = g.Daub;
  const TAU = Math.PI * 2;

  g.Daub.createSketch = function (c, W, H, dpr, code, assets = {}) {
    let rng = mulberry32(1), noiseOff = 0, spare = null;
    let looping = true, redrawOnce = false, fps = 60, t0 = performance.now();
    const MAXES = { rgb: [255, 255, 255, 255], hsb: [360, 100, 100, 1] };
    const st = {
      fill: '#fff', stroke: '#000', sw: 1, cap: 'round', join: 'miter', rectMode: 'corner', ellipseMode: 'center',
      mode: 'rgb', max: MAXES.rgb, textSize: 12, textAlign: 'left', fontFamily: 'Inter, sans-serif',
    };
    const styleStack = [];
    let shape = null, shapeMode = null;

    // parse any css color to [r, g, b, a(0-1)] (for lerpColor, red(), ...)
    const probe = document.createElement('canvas'); probe.width = probe.height = 1;
    const pc = probe.getContext('2d', { willReadFrequently: true }), rgbaCache = new Map();
    const rgba = (s) => {
      if (rgbaCache.has(s)) return rgbaCache.get(s);
      let m = typeof s === 'string' && /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(s); // fast paths: no canvas needed
      if (m) { const r = [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]; rgbaCache.set(s, r); return r; }
      m = typeof s === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
      if (m) { const h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1], r = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4), 16), 1]; rgbaCache.set(s, r); return r; }
      pc.clearRect(0, 0, 1, 1); pc.fillStyle = '#000'; pc.fillStyle = s; pc.fillRect(0, 0, 1, 1);
      const d = pc.getImageData(0, 0, 1, 1).data, r = [d[0], d[1], d[2], d[3] / 255]; rgbaCache.set(s, r); return r;
    };

    // Images. loadImage() cannot read files from disk in a browser: it returns the picture chosen with "Load image…" in the Code tab,
    // or a built-in demo picture. pixels[] holds css colors, so they work with fill(), red(), brightness(), lerpColor() …
    const newCanvas = (w, h) => { const k = document.createElement('canvas'); k.width = Math.max(1, Math.round(w)); k.height = Math.max(1, Math.round(h)); return k; };
    const px = (r, g2, b, a) => (a === 255 ? `rgb(${r},${g2},${b})` : `rgba(${r},${g2},${b},${a / 255})`);
    class Img {
      constructor(cv) { this.cv = cv; this.pixels = []; }
      get width() { return this.cv.width; }
      get height() { return this.cv.height; }
      loadPixels() {
        const w = this.width, h = this.height, d = this.cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, out = new Array(w * h);
        for (let i = 0; i < w * h; i++) out[i] = px(d[i * 4], d[i * 4 + 1], d[i * 4 + 2], d[i * 4 + 3]);
        this.pixels = out;
      }
      updatePixels() {
        const w = this.width, h = this.height, k = this.cv.getContext('2d', { willReadFrequently: true }), im = k.createImageData(w, h);
        for (let i = 0; i < w * h && i < this.pixels.length; i++) { const q = rgba(this.pixels[i]); im.data.set([q[0], q[1], q[2], Math.round(q[3] * 255)], i * 4); }
        k.putImageData(im, 0, 0);
      }
      get(x, y) { const d = this.cv.getContext('2d', { willReadFrequently: true }).getImageData(Math.floor(x), Math.floor(y), 1, 1).data; return px(d[0], d[1], d[2], d[3]); }
      resize(w, h) { // like Processing: a 0 keeps the shape. Shrinks in halves so big photos stay smooth.
        const sw = this.width, sh = this.height;
        if (!w && !h) return;
        if (!w) w = Math.max(1, Math.round((sw * h) / sh)); if (!h) h = Math.max(1, Math.round((sh * w) / sw));
        let cur = this.cv;
        while (cur.width / 2 > w || cur.height / 2 > h) {
          const k = newCanvas(Math.max(w, Math.ceil(cur.width / 2)), Math.max(h, Math.ceil(cur.height / 2)));
          k.getContext('2d').drawImage(cur, 0, 0, k.width, k.height); cur = k;
        }
        const out = newCanvas(w, h), oc = out.getContext('2d'); oc.imageSmoothingQuality = 'high'; oc.drawImage(cur, 0, 0, out.width, out.height);
        this.cv = out; this.pixels = [];
      }
      copy() { const k = newCanvas(this.width, this.height); k.getContext('2d').drawImage(this.cv, 0, 0); return new Img(k); }
    }
    // a small, original picture to run image sketches on: a lit sphere-head on black
    const demoImage = () => {
      const k = newCanvas(240, 300), x = k.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, 240, 300);
      const lit = x.createRadialGradient(95, 100, 10, 120, 150, 150);
      lit.addColorStop(0, '#fff'); lit.addColorStop(0.55, '#9a9a9a'); lit.addColorStop(1, '#161616');
      x.fillStyle = lit; x.beginPath(); x.ellipse(120, 150, 92, 118, 0, 0, TAU); x.fill();
      x.fillStyle = '#1b1b1b'; x.beginPath(); x.ellipse(120, 70, 92, 50, 0, Math.PI, TAU); x.fill();
      x.fillStyle = '#111'; [-34, 34].forEach((dx) => { x.beginPath(); x.ellipse(120 + dx, 138, 14, 9, 0, 0, TAU); x.fill(); });
      x.strokeStyle = '#222'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.arc(120, 168, 42, 0.25 * Math.PI, 0.75 * Math.PI); x.stroke();
      return new Img(k);
    };

    // 2D/3D vector, like Processing's PVector. Methods change the vector and return it; static versions return a new one.
    class Vec {
      constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
      set(x, y, z) { if (x instanceof Vec) { this.x = x.x; this.y = x.y; this.z = x.z; } else { this.x = x; this.y = y ?? 0; this.z = z ?? 0; } return this; }
      copy() { return new Vec(this.x, this.y, this.z); }
      add(a, b, d) { if (a instanceof Vec) { this.x += a.x; this.y += a.y; this.z += a.z; } else { this.x += a; this.y += b ?? 0; this.z += d ?? 0; } return this; }
      sub(a, b, d) { if (a instanceof Vec) { this.x -= a.x; this.y -= a.y; this.z -= a.z; } else { this.x -= a; this.y -= b ?? 0; this.z -= d ?? 0; } return this; }
      mult(n) { this.x *= n; this.y *= n; this.z *= n; return this; }
      div(n) { this.x /= n; this.y /= n; this.z /= n; return this; }
      mag() { return Math.hypot(this.x, this.y, this.z); }
      magSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
      normalize() { const m = this.mag(); if (m > 0) this.div(m); return this; }
      setMag(n) { return this.normalize().mult(n); }
      limit(max) { if (this.magSq() > max * max) this.setMag(max); return this; }
      dist(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
      dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
      heading() { return Math.atan2(this.y, this.x); }
      rotate(a) { const c2 = Math.cos(a), s2 = Math.sin(a), x = this.x * c2 - this.y * s2, y = this.x * s2 + this.y * c2; this.x = x; this.y = y; return this; }
      lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
      static add(a, b) { return a.copy().add(b); }
      static sub(a, b) { return a.copy().sub(b); }
      static mult(a, n) { return a.copy().mult(n); }
      static div(a, n) { return a.copy().div(n); }
      static dist(a, b) { return a.dist(b); }
      static fromAngle(a, len = 1) { return new Vec(Math.cos(a) * len, Math.sin(a) * len); }
      static random2D() { return Vec.fromAngle(rng() * TAU); }
    }

    // pieces for beginShape(TRIANGLE_STRIP) and friends
    const poly = (pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); paint(); };
    const drawModeShape = (V, mode) => {
      const P = V.map((s) => [s[1], s[2]]);
      if (mode === 'points') P.forEach(([x, y]) => p.point(x, y));
      else if (mode === 'lines') for (let i = 0; i + 1 < P.length; i += 2) p.line(P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]);
      else if (mode === 'triangles') for (let i = 0; i + 2 < P.length; i += 3) poly([P[i], P[i + 1], P[i + 2]]);
      else if (mode === 'triangle_strip') for (let i = 2; i < P.length; i++) poly([P[i - 2], P[i - 1], P[i]]);
      else if (mode === 'triangle_fan') for (let i = 2; i < P.length; i++) poly([P[0], P[i - 1], P[i]]);
      else if (mode === 'quads') for (let i = 0; i + 3 < P.length; i += 4) poly([P[i], P[i + 1], P[i + 2], P[i + 3]]);
      else if (mode === 'quad_strip') for (let i = 0; i + 3 < P.length; i += 2) poly([P[i], P[i + 1], P[i + 3], P[i + 2]]);
    };

    // Normalize any color call to 0-1 channels, then build a css color.
    const col = (a) => {
      if (typeof a[0] === 'string') return a[0];
      const n = (v, i) => v / st.max[i];
      let c1, c2, c3, al = 1;
      if (a.length === 1) { c1 = c2 = c3 = n(a[0], 2); if (st.mode === 'hsb') { c1 = 0; c2 = 0; } }
      else if (a.length === 2) { c1 = c2 = c3 = n(a[0], 2); al = n(a[1], 3); if (st.mode === 'hsb') { c1 = 0; c2 = 0; } }
      else { c1 = n(a[0], 0); c2 = n(a[1], 1); c3 = n(a[2], 2); if (a.length > 3) al = n(a[3], 3); }
      return st.mode === 'hsb'
        ? hsb(c1 * 360, c2 * 100, c3 * 100, al)
        : `rgba(${Math.round(c1 * 255)},${Math.round(c2 * 255)},${Math.round(c3 * 255)},${al})`;
    };
    const paint = () => {
      if (st.fill) { c.fillStyle = st.fill; c.fill(); }
      if (st.stroke && st.sw > 0) { c.strokeStyle = st.stroke; c.lineWidth = st.sw; c.lineCap = st.cap; c.lineJoin = st.join; c.stroke(); }
    };
    // rect/ellipse parameter modes
    const box = (mode, x, y, w, h) => {
      if (mode === 'center') return [x - w / 2, y - h / 2, w, h];
      if (mode === 'radius') return [x - w, y - h, w * 2, h * 2];
      if (mode === 'corners') return [x, y, w - x, h - y];
      return [x, y, w, h];
    };

    const p = {
      width: W, height: H, frameCount: 0, mouseX: 0, mouseY: 0, pmouseX: 0, pmouseY: 0, mouseIsPressed: false,
      PI: Math.PI, TWO_PI: TAU, TAU, HALF_PI: Math.PI / 2, QUARTER_PI: Math.PI / 4, CLOSE: true,
      CENTER: 'center', CORNER: 'corner', CORNERS: 'corners', RADIUS: 'radius', TOP: 'top', BOTTOM: 'bottom', BASELINE: 'baseline',
      LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, RETURN: 13, BACKSPACE: 8, TAB: 9, ESC: 27, DELETE: 46, SHIFT: 16, CONTROL: 17, ALT: 18, CODED: 'coded',
      RGB: 'rgb', HSB: 'hsb', ROUND: 'round', SQUARE: 'butt', PROJECT: 'square', MITER: 'miter', BEVEL: 'bevel',
      POINTS: 'points', LINES: 'lines', TRIANGLES: 'triangles', TRIANGLE_STRIP: 'triangle_strip', TRIANGLE_FAN: 'triangle_fan', QUADS: 'quads', QUAD_STRIP: 'quad_strip',
      ADD: 'add', BLEND: 'blend', MULTIPLY: 'multiply', SCREEN: 'screen', DIFFERENCE: 'difference',
      key: '', keyCode: 0, keyIsPressed: false, mouseButton: 0,

      // --- environment / structure
      size() {}, createCanvas() {}, smooth() {}, noSmooth() {}, pixelDensity() {},
      frameRate: (f) => { if (f) fps = Math.max(1, f); return fps; },
      noLoop: () => { looping = false; }, loop: () => { looping = true; }, redraw: () => { redrawOnce = true; },
      millis: () => performance.now() - t0,
      print: (...a) => console.log(...a), println: (...a) => console.log(...a),

      // --- color
      colorMode: (m, ...mx) => {
        st.mode = String(m).toLowerCase();
        st.max = mx.length === 1 ? [mx[0], mx[0], mx[0], mx[0]] : mx.length >= 3 ? [mx[0], mx[1], mx[2], mx[3] ?? MAXES[st.mode][3]] : MAXES[st.mode];
      },
      color: (...a) => col(a),
      background: (...a) => { c.save(); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = col(a); c.fillRect(0, 0, W, H); c.restore(); },
      clear: () => { c.save(); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H); c.restore(); },
      fill: (...a) => { st.fill = col(a); }, noFill: () => { st.fill = null; },
      stroke: (...a) => { st.stroke = col(a); }, noStroke: () => { st.stroke = null; },
      strokeWeight: (w) => { st.sw = w; }, strokeCap: (v) => { st.cap = v; }, strokeJoin: (v) => { st.join = v; },
      blendMode: (m) => { c.globalCompositeOperation = ({ add: 'lighter', blend: 'source-over', multiply: 'multiply', screen: 'screen', difference: 'difference' })[String(m).toLowerCase()] || 'source-over'; },

      // --- 2D primitives
      rectMode: (m) => { st.rectMode = m; }, ellipseMode: (m) => { st.ellipseMode = m; },
      rect: (x, y, w, h, r = 0) => { const b = box(st.rectMode, x, y, w, h ?? w); c.beginPath(); if (r && c.roundRect) c.roundRect(...b, r); else c.rect(...b); paint(); },
      square: (x, y, s) => p.rect(x, y, s, s),
      ellipse: (x, y, w, h) => { const [bx, by, bw, bh] = box(st.ellipseMode, x, y, w, h ?? w); c.beginPath(); c.ellipse(bx + bw / 2, by + bh / 2, Math.abs(bw / 2), Math.abs(bh / 2), 0, 0, TAU); paint(); },
      circle: (x, y, d) => p.ellipse(x, y, d, d),
      arc: (x, y, w, h, a0, a1) => { // filled like a pie slice, outlined along the curve only (as in Processing)
        const [bx, by, bw, bh] = box(st.ellipseMode, x, y, w, h), cx = bx + bw / 2, cy = by + bh / 2, rx = Math.abs(bw / 2), ry = Math.abs(bh / 2);
        if (st.fill) { c.beginPath(); c.moveTo(cx, cy); c.ellipse(cx, cy, rx, ry, 0, a0, a1); c.closePath(); c.fillStyle = st.fill; c.fill(); }
        if (st.stroke && st.sw > 0) { c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, a0, a1); c.strokeStyle = st.stroke; c.lineWidth = st.sw; c.lineCap = st.cap; c.stroke(); }
      },
      line: (x1, y1, x2, y2) => { if (!st.stroke) return; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = st.stroke; c.lineWidth = st.sw; c.lineCap = st.cap; c.stroke(); },
      point: (x, y) => { if (!st.stroke) return; c.beginPath(); c.arc(x, y, Math.max(0.5, st.sw / 2), 0, TAU); c.fillStyle = st.stroke; c.fill(); },
      triangle: (x1, y1, x2, y2, x3, y3) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath(); paint(); },
      quad: (x1, y1, x2, y2, x3, y3, x4, y4) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.lineTo(x4, y4); c.closePath(); paint(); },
      bezier: (x1, y1, cx1, cy1, cx2, cy2, x2, y2) => { c.beginPath(); c.moveTo(x1, y1); c.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2); const f = st.fill; st.fill = null; paint(); st.fill = f; },
      bezierPoint: (a, b, cc, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * cc + t * t * t * d; },

      // --- vertex shapes
      beginShape: (mode) => { shape = []; shapeMode = typeof mode === 'string' ? mode : null; },
      vertex: (x, y) => { shape && shape.push(['L', x, y]); },
      bezierVertex: (a, b, cc, d, e, f) => { shape && shape.push(['B', a, b, cc, d, e, f]); },
      quadraticVertex: (a, b, cc, d) => { shape && shape.push(['Q', a, b, cc, d]); },
      endShape: (close) => {
        if (!shape || !shape.length) return;
        if (shapeMode) { drawModeShape(shape.filter((s) => s[0] === 'L'), shapeMode); shape = null; shapeMode = null; return; }
        c.beginPath();
        shape.forEach((s, i) => {
          if (i === 0) c.moveTo(s[1], s[2]);
          else if (s[0] === 'L') c.lineTo(s[1], s[2]);
          else if (s[0] === 'B') c.bezierCurveTo(...s.slice(1));
          else c.quadraticCurveTo(...s.slice(1));
        });
        if (close) c.closePath();
        paint(); shape = null;
      },

      // --- text
      text: (s, x, y) => { c.font = `${st.textSize}px ${st.fontFamily}`; c.textAlign = st.textAlign; c.textBaseline = st.textBase || 'alphabetic'; if (st.fill) { c.fillStyle = st.fill; c.fillText(String(s), x, y); } },
      textSize: (n) => { st.textSize = n; },
      createFont: (name, size) => ({ name: String(name), size }),
      textFont: (f, size) => { if (f && f.name) { st.fontFamily = `"${f.name}", ${/courier|mono|consol|menlo|typewriter/i.test(f.name) ? 'monospace' : 'sans-serif'}`; } if (size || (f && f.size)) st.textSize = size || f.size; },
      textAlign: (h, v) => { st.textAlign = h === 37 ? 'left' : h === 39 ? 'right' : h === 'center' ? 'center' : 'left'; st.textBase = v === 'center' ? 'middle' : v === 'top' ? 'top' : v === 'bottom' ? 'bottom' : 'alphabetic'; },
      textWidth: (s) => { c.font = `${st.textSize}px ${st.fontFamily}`; return c.measureText(String(s)).width; },

      // --- transform & style stacks
      translate: (x, y) => c.translate(x, y), rotate: (a) => c.rotate(a), scale: (x, y) => c.scale(x, y ?? x),
      shearX: (a) => c.transform(1, 0, Math.tan(a), 1, 0, 0), shearY: (a) => c.transform(1, Math.tan(a), 0, 1, 0, 0),
      applyMatrix: (a, b, cc, d, e, f) => c.transform(a, b, cc, d, e, f),
      resetMatrix: () => c.setTransform(dpr, 0, 0, dpr, 0, 0),
      pushMatrix: () => c.save(), popMatrix: () => c.restore(),
      pushStyle: () => { styleStack.push({ ...st }); },
      popStyle: () => { if (styleStack.length) Object.assign(st, styleStack.pop()); },
      push: () => { c.save(); styleStack.push({ ...st }); },
      pop: () => { c.restore(); if (styleStack.length) Object.assign(st, styleStack.pop()); },

      // --- math & random
      random: (a, b) => {
        if (Array.isArray(a)) return a[Math.floor(rng() * a.length)];
        if (a === undefined) return rng();
        return b === undefined ? rng() * a : a + rng() * (b - a);
      },
      randomSeed: (s) => { rng = mulberry32(s); spare = null; },
      randomGaussian: (mean = 0, sd = 1) => {
        if (spare !== null) { const v = spare; spare = null; return mean + sd * v; }
        let u, v, s2;
        do { u = rng() * 2 - 1; v = rng() * 2 - 1; s2 = u * u + v * v; } while (s2 >= 1 || s2 === 0);
        const m = Math.sqrt((-2 * Math.log(s2)) / s2); spare = v * m; return mean + sd * u * m;
      },
      noise: (x, y = 0, z = 0) => noise3(x + noiseOff, y, z),
      noiseSeed: (s) => { noiseOff = s * 131.7; }, noiseDetail() {},
      map: (v, a, b, c2, d) => c2 + ((v - a) / (b - a)) * (d - c2),
      norm: (v, a, b) => (v - a) / (b - a),
      lerp: (a, b, t) => a + (b - a) * t,
      constrain: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
      dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
      mag: (x, y) => Math.hypot(x, y), sq: (v) => v * v,
      radians: (d) => (d * Math.PI) / 180, degrees: (r) => (r * 180) / Math.PI,

      // --- vectors, clock, colors, small helpers
      PVector: Vec, createVector: (x, y, z) => new Vec(x, y, z),
      hour: () => new Date().getHours(), minute: () => new Date().getMinutes(), second: () => new Date().getSeconds(),
      day: () => new Date().getDate(), month: () => new Date().getMonth() + 1, year: () => new Date().getFullYear(),
      lerpColor: (c1, c2, t) => { const a = rgba(c1), b = rgba(c2), m = (i) => Math.round(a[i] + (b[i] - a[i]) * t); return `rgba(${m(0)},${m(1)},${m(2)},${a[3] + (b[3] - a[3]) * t})`; },
      red: (v) => rgba(v)[0], green: (v) => rgba(v)[1], blue: (v) => rgba(v)[2], alpha: (v) => rgba(v)[3] * 255,
      brightness: (v) => (Math.max(...rgba(v).slice(0, 3)) / 255) * st.max[2],
      loadImage: () => (assets.image ? new Img(assets.image).copy() : demoImage()),
      createImage: (w, h) => new Img(newCanvas(w, h)),
      image: (im, x, y, w, h) => { c.drawImage(im.cv, x, y, w ?? im.width, h ?? im.height); },
      set: (x, y, ...a) => { c.save(); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = col(a); c.fillRect(Math.floor(x), Math.floor(y), 1, 1); c.restore(); },
      int: (v) => Math.trunc(v), float: (v) => parseFloat(v), str: (v) => String(v),
      nf: (v, left = 0, right = 0) => { const s = Math.abs(v).toFixed(right), [i, d] = s.split('.'); return (v < 0 ? '-' : '') + i.padStart(left, '0') + (d ? '.' + d : ''); },
      cursor() {}, noCursor() {},
    };
    ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'pow', 'min', 'max', 'exp', 'log'].forEach((k) => { p[k] = Math[k]; });

    // eslint-disable-next-line no-new-func
    const EVENTS = ['mousePressed', 'mouseReleased', 'mouseClicked', 'mouseMoved', 'mouseDragged', 'keyPressed', 'keyReleased', 'keyTyped'];
    const factory = new Function('p', `with(p){\n${code}\n;return {setup: typeof setup==='function'?setup:null, draw: typeof draw==='function'?draw:null, ${EVENTS.map((e) => `${e}: typeof ${e}==='function'?${e}:null`).join(', ')}};}`);
    const fns = factory(p);
    const begin = () => { c.setTransform(dpr, 0, 0, dpr, 0, 0); styleStack.length = 0; shape = null; shapeMode = null; };

    return {
      setup() { begin(); if (fns.setup) fns.setup(); },
      draw() { begin(); p.frameCount++; if (fns.draw) fns.draw(); },
      hasDraw: !!fns.draw,
      get looping() { return looping; },
      get fps() { return fps; },
      takeRedraw() { const r = redrawOnce; redrawOnce = false; return r; },
      // input from the canvas; event functions like mousePressed() or keyPressed() are called through fire()
      setMouse(x, y, down, button) {
        p.pmouseX = p.mouseX; p.pmouseY = p.mouseY; p.mouseX = x; p.mouseY = y; p.mouseIsPressed = !!down;
        if (down && button !== undefined) p.mouseButton = button === 0 ? 37 : button === 2 ? 39 : 'center';
      },
      setKey(key, code2, down) { p.key = key.length === 1 ? key : 'coded'; p.keyCode = code2; p.keyIsPressed = !!down; },
      fire(name) { const f = fns[name]; if (!f) return false; begin(); f(); return true; },
    };
  };
})(window);
