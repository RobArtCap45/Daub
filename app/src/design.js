/* Daub Design: a vector editor with layers, a pen tool and a keyframe timeline.
 * The document lives in project.design and feeds the node graph through the "Design" node.
 */
(function (g) {
  'use strict';
  const L = g.Daub;
  const $ = (s) => document.querySelector(s);
  const hc = document.createElement('canvas').getContext('2d');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const KIND = { rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', star: 'Star', path: 'Path', line: 'Line' };
  const ICON = {
    select: '<path d="M4.5 2.5l9.5 6-4.3 1.2L7.4 14z" fill="currentColor"/>',
    rect: '<rect x="3" y="4.5" width="12" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    ellipse: '<ellipse cx="9" cy="9" rx="6.3" ry="5.3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    polygon: '<path d="M9 2.6l6 4.4-2.3 6.9H5.3L3 7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    star: '<path d="M9 2l2.1 4.6 5 .5-3.8 3.4 1.1 4.9L9 12.8 4.6 15.4l1.1-4.9L1.9 7.1l5-.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    line: '<path d="M3.5 14.5l11-11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    pen: '<path d="M3 15l.8-3.4L12 3.4 14.6 6l-8.2 8.2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10.6 5l2.4 2.4" stroke="currentColor" stroke-width="1.5"/>',
  };
  const TOOLS = [['select', 'V', 'Select'], ['rect', 'R', 'Rectangle'], ['ellipse', 'O', 'Ellipse'], ['polygon', 'Y', 'Polygon'], ['star', 'S', 'Star'], ['line', 'L', 'Line'], ['pen', 'P', 'Pen']];
  const ACCENT = '#e8483a', TOL = 9;

  let hooks = null, cv = null, c = null, dpr = 1, CW = 0, CH = 0, ready = false;
  const D = { time: 0, tool: 'select', sel: [], zoom: 1, pan: { x: 0, y: 0 }, dirty: true, key: null, drag: null, pen: null, guides: null, marquee: null, fields: [], hover: null, panning: false };

  // ---------- document helpers
  const doc = () => { const P = hooks.project(); if (!P.design) P.design = { shapes: [], duration: 4, loop: true, bg: '#ffffff', next: 1 }; return P.design; };
  const byId = (id) => doc().shapes.find((s) => s.id === id);
  const selShapes = () => D.sel.map(byId).filter(Boolean);
  const first = () => selShapes()[0];
  const val = (s, p) => L.valueAt(s, p, D.time);
  const fmt = (v) => (Math.abs(v - Math.round(v)) < 0.005 ? String(Math.round(v)) : (Math.round(v * 100) / 100).toString());
  const snapT = (t) => Math.round(t * 60) / 60;
  const rot = (x, y, deg) => { const r = (deg * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r); return [x * co - y * si, x * si + y * co]; };
  const changed = (soft) => { D.dirty = true; hooks.changed(!!soft); }; // soft = continuous edit (scrubbing), merged into one undo step
  const dirty = () => { D.dirty = true; };
  const hasKeys = (s, p) => !!(s.keys && s.keys[p] && s.keys[p].length);

  function newShape(kind, props) {
    const d = doc(), n = d.shapes.filter((s) => s.kind === kind).length + 1;
    const s = {
      id: 'd' + d.next++, name: `${KIND[kind]} ${n}`, kind, x: 0, y: 0, w: 100, h: 100, rot: 0, opacity: 1, radius: 0, sides: 5, inner: 0.45,
      fill: '#e8483a', fillOn: kind !== 'line' && kind !== 'path', stroke: '#1d1d1b', sw: kind === 'line' || kind === 'path' ? 2 : 0, visible: true, locked: false, keys: {}, ...props,
    };
    d.shapes.push(s); return s;
  }
  // write a property value; animated properties get/update a keyframe at the playhead (auto-key)
  function setProp(s, p, v) {
    if (hasKeys(s, p)) {
      const t = snapT(D.time), ks = s.keys[p], k = ks.find((q) => Math.abs(q.t - t) < 1e-3);
      if (k) k.v = v; else { ks.push({ t, v, e: 'ease' }); ks.sort((a, b) => a.t - b.t); }
    } else s[p] = v;
  }
  function toggleKey(s, p) {
    const t = snapT(D.time); s.keys = s.keys || {}; const cur = val(s, p);
    const ks = (s.keys[p] = s.keys[p] || []), i = ks.findIndex((q) => Math.abs(q.t - t) < 1e-3);
    if (i >= 0) { ks.splice(i, 1); if (!ks.length) { s[p] = cur; D.key = null; } }
    else { ks.push({ t, v: cur, e: 'ease' }); ks.sort((a, b) => a.t - b.t); }
    changed(); buildProps(); buildTimeline();
  }

  // ---------- geometry
  const box = (s) => ({ x: val(s, 'x'), y: val(s, 'y'), w: Math.max(0.01, Math.abs(val(s, 'w'))), h: Math.max(0.01, Math.abs(val(s, 'h'))), rot: val(s, 'rot') || 0 });
  function corners(b) { return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, d]) => { const [rx, ry] = rot((a * b.w) / 2, (d * b.h) / 2, b.rot); return [b.x + rx, b.y + ry]; }); }
  function aabb(s) { const cs = corners(box(s)), xs = cs.map((p) => p[0]), ys = cs.map((p) => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; }
  function unionBox(list) { const bs = list.map(aabb); return { x0: Math.min(...bs.map((b) => b.x0)), x1: Math.max(...bs.map((b) => b.x1)), y0: Math.min(...bs.map((b) => b.y0)), y1: Math.max(...bs.map((b) => b.y1)) }; }
  const HANDLES = [['nw', -1, -1], ['n', 0, -1], ['ne', 1, -1], ['e', 1, 0], ['se', 1, 1], ['s', 0, 1], ['sw', -1, 1], ['w', -1, 0]];
  function handlePts(s) {
    const b = box(s), pts = HANDLES.map(([id, hx, hy]) => { const [rx, ry] = rot((hx * b.w) / 2, (hy * b.h) / 2, b.rot); return { id, hx, hy, x: b.x + rx, y: b.y + ry }; });
    const [rx, ry] = rot(0, -b.h / 2 - 26 / D.zoom, b.rot); pts.push({ id: 'rot', x: b.x + rx, y: b.y + ry });
    return pts;
  }
  const toScreen = (x, y) => [x * D.zoom + D.pan.x, y * D.zoom + D.pan.y];
  const toWorld = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - D.pan.x) / D.zoom, y: (e.clientY - r.top - D.pan.y) / D.zoom, sx: e.clientX - r.left, sy: e.clientY - r.top }; };
  const nearPx = (a, bx, by, r = TOL) => Math.hypot((a.x - bx) * D.zoom, (a.y - by) * D.zoom) <= r;

  function hitShape(s, p) {
    const gs = L.designShape(s, D.time); if (!gs) return false;
    hc.setTransform(1, 0, 0, 1, 0, 0); hc.save(); hc.transform(...gs.m); L.tracePath(hc, gs);
    const det = Math.abs(gs.m[0] * gs.m[3] - gs.m[1] * gs.m[2]) || 1;
    hc.lineWidth = Math.max(gs.sw || 0, 8 / D.zoom) / Math.sqrt(det);
    const inside = (gs.fill && hc.isPointInPath(p.x, p.y)) || ((gs.stroke || L.isOpen(gs)) && hc.isPointInStroke(p.x, p.y));
    hc.restore(); return !!inside;
  }
  function pickAt(p) { const ss = doc().shapes; for (let i = ss.length - 1; i >= 0; i--) { const s = ss[i]; if (s.visible !== false && !s.locked && hitShape(s, p)) return s; } return null; }

  // ---------- rendering
  function render() {
    const d = doc(); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#e9e9e6'; c.fillRect(0, 0, CW, CH);
    c.save(); c.translate(D.pan.x, D.pan.y); c.scale(D.zoom, D.zoom);
    c.shadowColor = 'rgba(0,0,0,.2)'; c.shadowBlur = 14; c.fillStyle = d.bg || '#ffffff'; c.fillRect(-300, -300, 600, 600); c.shadowColor = 'transparent';
    L.drawShapes(c, L.designShapes(d, D.time)); c.restore();
    c.fillStyle = '#8a8a84'; c.font = '11px Inter, sans-serif'; c.textBaseline = 'bottom'; c.fillText('Artboard 600 × 600', D.pan.x - 300 * D.zoom, D.pan.y - 300 * D.zoom - 6);
    overlay(); $('#zVal').textContent = Math.round(D.zoom * 100) + '%';
  }
  function overlay() {
    const hover = D.hover && byId(D.hover);
    if (hover && !D.sel.includes(hover.id) && D.tool === 'select') { const gs = L.designShape(hover, D.time); if (gs) { c.save(); c.translate(D.pan.x, D.pan.y); c.scale(D.zoom, D.zoom); c.transform(...gs.m); L.tracePath(c, gs); c.strokeStyle = ACCENT; c.lineWidth = 1.5 / D.zoom; c.stroke(); c.restore(); } }
    const sel = selShapes();
    if (sel.length && D.tool === 'select') {
      c.lineWidth = 1.5; c.strokeStyle = ACCENT;
      sel.forEach((s) => { const cs = corners(box(s)).map(([x, y]) => toScreen(x, y)); c.beginPath(); cs.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.stroke(); });
      if (sel.length === 1) {
        const s = sel[0], hp = handlePts(s);
        const rh = hp[hp.length - 1], n = hp.find((h) => h.id === 'n'), a = toScreen(n.x, n.y), b = toScreen(rh.x, rh.y);
        c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke();
        hp.forEach((h) => { const [x, y] = toScreen(h.x, h.y); c.fillStyle = '#fff'; c.beginPath(); if (h.id === 'rot') c.arc(x, y, 5, 0, 6.283); else c.rect(x - 4, y - 4, 8, 8); c.fill(); c.stroke(); });
      } else {
        const u = unionBox(sel), [x0, y0] = toScreen(u.x0, u.y0), [x1, y1] = toScreen(u.x1, u.y1);
        c.setLineDash([5, 4]); c.strokeRect(x0, y0, x1 - x0, y1 - y0); c.setLineDash([]);
      }
    }
    if (D.guides) { c.strokeStyle = '#ff2d95'; c.lineWidth = 1; D.guides.x.forEach((x) => { const [sx] = toScreen(x, 0); c.beginPath(); c.moveTo(sx, 0); c.lineTo(sx, CH); c.stroke(); }); D.guides.y.forEach((y) => { const [, sy] = toScreen(0, y); c.beginPath(); c.moveTo(0, sy); c.lineTo(CW, sy); c.stroke(); }); }
    if (D.marquee) { const m = D.marquee; c.fillStyle = 'rgba(232,72,58,.08)'; c.strokeStyle = ACCENT; c.lineWidth = 1; c.fillRect(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0); c.strokeRect(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0); }
    if (D.pen) penOverlay();
  }
  function penOverlay() {
    const P = D.pen, pts = P.pts; if (!pts.length) return;
    if (pts.length > 1) {
      c.beginPath(); L.penCmds({ pts, closed: false }).forEach((k) => { const q = (i) => toScreen(k[i], k[i + 1]); if (k[0] === 'M') c.moveTo(...q(1)); else if (k[0] === 'L') c.lineTo(...q(1)); else c.bezierCurveTo(...q(1), ...q(3), ...q(5)); });
      c.strokeStyle = '#1d1d1b'; c.lineWidth = 2; c.stroke();
    }
    if (P.cursor && !P.drag) { const l = pts[pts.length - 1], a = toScreen(l.x, l.y), b = toScreen(P.cursor.x, P.cursor.y); c.setLineDash([4, 4]); c.strokeStyle = '#8a8a84'; c.lineWidth = 1; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); c.setLineDash([]); }
    pts.forEach((p, i) => {
      if (i === P.sel) [[p.ix, p.iy], [p.ox, p.oy]].forEach(([ox, oy]) => { if (!ox && !oy) return; const a = toScreen(p.x, p.y), b = toScreen(p.x + ox, p.y + oy); c.strokeStyle = '#8a8a84'; c.lineWidth = 1; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); c.fillStyle = '#fff'; c.strokeStyle = ACCENT; c.beginPath(); c.arc(b[0], b[1], 4, 0, 6.283); c.fill(); c.stroke(); });
      const [x, y] = toScreen(p.x, p.y); c.fillStyle = i === P.sel ? ACCENT : '#fff'; c.strokeStyle = i === 0 ? ACCENT : '#1d1d1b'; c.lineWidth = 1.6; c.beginPath(); c.rect(x - 4.5, y - 4.5, 9, 9); c.fill(); c.stroke();
    });
  }

  // ---------- pointer interaction
  // snap the moving group's edges/centres to the artboard and to other layers; u = group bounds at drag start
  function snapMove(dx, dy, ids, u) {
    const w = u.x1 - u.x0, h = u.y1 - u.y0, nx0 = u.x0 + dx, ny0 = u.y0 + dy;
    const xs = [-300, 0, 300], ys = [-300, 0, 300];
    doc().shapes.filter((s) => !ids.includes(s.id) && s.visible !== false).forEach((s) => { const a = aabb(s); xs.push(a.x0, (a.x0 + a.x1) / 2, a.x1); ys.push(a.y0, (a.y0 + a.y1) / 2, a.y1); });
    const th = 6 / D.zoom, gx = [], gy = []; let bx = null, by = null;
    [0, w / 2, w].forEach((o) => xs.forEach((t) => { const d = t - (nx0 + o); if (Math.abs(d) < th && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, g: t }; }));
    [0, h / 2, h].forEach((o) => ys.forEach((t) => { const d = t - (ny0 + o); if (Math.abs(d) < th && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, g: t }; }));
    if (bx) { dx += bx.d; gx.push(bx.g); } if (by) { dy += by.d; gy.push(by.g); }
    D.guides = { x: gx, y: gy }; return [dx, dy];
  }

  function down(e) {
    if (e.button === 1 || (e.button === 0 && D.panning)) { startPan(e); return; }
    if (e.button !== 0) return;
    cv.setPointerCapture(e.pointerId); const p = toWorld(e);
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur(); // so shortcuts work right after using the inspector
    if (hooks.isPlaying()) { hooks.setPlaying(false); syncPlay(); } // editing pauses playback so keyframes land where you expect
    if (D.tool === 'pen') return penDown(e, p);
    if (D.tool !== 'select') return createDown(e, p);
    // select tool
    const cur = selShapes();
    if (cur.length === 1 && !cur[0].locked) {
      const s = cur[0], h = handlePts(s).find((q) => nearPx(p, q.x, q.y));
      if (h) { beginTransform(e, s, h, p); return; }
    }
    const hit = pickAt(p);
    if (hit) {
      if (e.shiftKey) { D.sel = D.sel.includes(hit.id) ? D.sel.filter((i) => i !== hit.id) : [...D.sel, hit.id]; }
      else if (!D.sel.includes(hit.id)) D.sel = [hit.id];
      selectionChanged();
      const ids = D.sel.slice(), orig = ids.map((id) => { const s = byId(id); return { s, x: val(s, 'x'), y: val(s, 'y') }; });
      D.drag = { mode: 'move', p0: p, ids, orig, moved: false, u: unionBox(ids.map(byId)) };
    } else {
      if (!e.shiftKey) { D.sel = []; selectionChanged(); }
      D.drag = { mode: 'marquee', x0: p.sx, y0: p.sy, base: e.shiftKey ? D.sel.slice() : [] };
    }
    dirty();
  }
  function beginTransform(e, s, h, p) {
    const b = box(s);
    D.drag = { mode: h.id === 'rot' ? 'rotate' : 'resize', h, s, b, w0: b.w, h0: b.h, ow: s.ow, snapshot: null };
    void e; void p;
  }
  function move(e) {
    const p = toWorld(e);
    if (D.pen && D.tool === 'pen') { D.pen.cursor = p; if (D.drag) penMove(e, p); dirty(); return; }
    const dr = D.drag;
    if (!dr) { // hover feedback
      if (D.tool === 'select') {
        const cur = selShapes(); let cur_cursor = 'default';
        if (cur.length === 1) { const h = handlePts(cur[0]).find((q) => nearPx(p, q.x, q.y)); if (h) cur_cursor = h.id === 'rot' ? 'grab' : 'nwse-resize'; }
        const hit = pickAt(p); const hid = hit ? hit.id : null; if (hid !== D.hover) { D.hover = hid; dirty(); }
        cv.style.cursor = cur_cursor !== 'default' ? cur_cursor : hit ? 'move' : 'default';
      } else cv.style.cursor = 'crosshair';
      return;
    }
    if (dr.mode === 'pan') { D.pan = { x: dr.px + (e.clientX - dr.cx), y: dr.py + (e.clientY - dr.cy) }; dirty(); return; }
    if (dr.mode === 'move') {
      let dx = p.x - dr.p0.x, dy = p.y - dr.p0.y; if (Math.abs(dx) + Math.abs(dy) > 0.5) dr.moved = true;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      if (!e.altKey) [dx, dy] = snapMove(dx, dy, dr.ids, dr.u); else D.guides = null;
      dr.orig.forEach(({ s, x, y }) => { setProp(s, 'x', x + dx); setProp(s, 'y', y + dy); });
      dirty(); updateProps(); return;
    }
    if (dr.mode === 'marquee') {
      D.marquee = { x0: Math.min(dr.x0, p.sx), y0: Math.min(dr.y0, p.sy), x1: Math.max(dr.x0, p.sx), y1: Math.max(dr.y0, p.sy) };
      const wx0 = (D.marquee.x0 - D.pan.x) / D.zoom, wx1 = (D.marquee.x1 - D.pan.x) / D.zoom, wy0 = (D.marquee.y0 - D.pan.y) / D.zoom, wy1 = (D.marquee.y1 - D.pan.y) / D.zoom;
      const ids = doc().shapes.filter((s) => { if (s.visible === false || s.locked) return false; const a = aabb(s); return a.x1 >= wx0 && a.x0 <= wx1 && a.y1 >= wy0 && a.y0 <= wy1; }).map((s) => s.id);
      D.sel = [...new Set([...dr.base, ...ids])]; selectionChanged(true); dirty(); return;
    }
    if (dr.mode === 'rotate') {
      const b = dr.b; let a = (Math.atan2(p.y - b.y, p.x - b.x) * 180) / Math.PI + 90; if (e.shiftKey) a = Math.round(a / 15) * 15;
      a = ((a + 180) % 360 + 360) % 360 - 180; setProp(dr.s, 'rot', a); dirty(); updateProps(); return;
    }
    if (dr.mode === 'resize') { resizeTo(e, p, dr); dirty(); updateProps(); return; }
    if (dr.mode === 'create') { createMove(e, p, dr); dirty(); return; }
  }
  function resizeTo(e, p, dr) {
    const { s, b, h } = dr, [lx, ly] = rot(p.x - b.x, p.y - b.y, -b.rot);
    let x0 = -b.w / 2, x1 = b.w / 2, y0 = -b.h / 2, y1 = b.h / 2;
    if (e.altKey) { if (h.hx) { x1 = h.hx * Math.abs(lx); x0 = -x1; } if (h.hy) { y1 = h.hy * Math.abs(ly); y0 = -y1; } }
    else { if (h.hx === 1) x1 = lx; else if (h.hx === -1) x0 = lx; if (h.hy === 1) y1 = ly; else if (h.hy === -1) y0 = ly; }
    let w = Math.max(1, Math.abs(x1 - x0)), hh = Math.max(1, Math.abs(y1 - y0));
    if (e.shiftKey && h.hx && h.hy) { const k = Math.max(w / b.w, hh / b.h); w = b.w * k; hh = b.h * k; if (h.hx === 1) x1 = x0 + w; else x0 = x1 - w; if (h.hy === 1) y1 = y0 + hh; else y0 = y1 - hh; }
    const [cx, cy] = rot((x0 + x1) / 2, (y0 + y1) / 2, b.rot);
    setProp(s, 'w', w); setProp(s, 'h', hh); setProp(s, 'x', b.x + cx); setProp(s, 'y', b.y + cy);
  }
  function up() {
    const dr = D.drag; D.drag = null; D.guides = null; D.marquee = null;
    if (D.pen) { D.pen.drag = false; dirty(); return; }
    if (!dr) return;
    if (dr.mode === 'marquee') { selectionChanged(); return; }
    if (dr.mode === 'create') { createUp(dr); return; }
    if (dr.mode === 'move' && !dr.moved) { /* plain click */ }
    else if (['move', 'rotate', 'resize'].includes(dr.mode)) changed();
    dirty(); buildTimeline();
  }
  function startPan(e) {
    cv.setPointerCapture(e.pointerId); D.drag = { mode: 'pan', cx: e.clientX, cy: e.clientY, px: D.pan.x, py: D.pan.y };
  }

  // ---------- creating shapes
  function createDown(e, p) {
    const sn = (v) => (e.shiftKey ? Math.round(v / 10) * 10 : v), p0 = { x: sn(p.x), y: sn(p.y) }, kind = D.tool;
    const s = kind === 'line' ? newShape('line', { x: p0.x, y: p0.y, w: 0.01, h: 0.01, ow: 0.01, oh: 0.01, closed: false, pts: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }) : newShape(kind, { x: p0.x, y: p0.y, w: 1, h: 1 });
    D.sel = [s.id]; D.drag = { mode: 'create', s, p0, kind, moved: false }; selectionChanged();
  }
  function createMove(e, p, dr) {
    const { s, p0, kind } = dr; let dx = p.x - p0.x, dy = p.y - p0.y; if (Math.abs(dx) + Math.abs(dy) > 3 / D.zoom) dr.moved = true;
    if (kind === 'line') {
      if (e.shiftKey) { const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy); dx = Math.cos(a) * l; dy = Math.sin(a) * l; }
      const p1 = { x: p0.x + dx, y: p0.y + dy }, cx = (p0.x + p1.x) / 2, cy = (p0.y + p1.y) / 2;
      s.x = cx; s.y = cy; s.w = s.ow = Math.max(0.01, Math.abs(dx)); s.h = s.oh = Math.max(0.01, Math.abs(dy)); s.pts = [{ x: p0.x - cx, y: p0.y - cy }, { x: p1.x - cx, y: p1.y - cy }]; return;
    }
    if (e.shiftKey) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
    if (e.altKey) { s.x = p0.x; s.y = p0.y; s.w = Math.max(1, Math.abs(dx) * 2); s.h = Math.max(1, Math.abs(dy) * 2); }
    else { s.x = p0.x + dx / 2; s.y = p0.y + dy / 2; s.w = Math.max(1, Math.abs(dx)); s.h = Math.max(1, Math.abs(dy)); }
  }
  function createUp(dr) {
    const s = dr.s;
    if (!dr.moved) { if (dr.kind === 'line') { doc().shapes = doc().shapes.filter((q) => q !== s); D.sel = []; } else { s.w = s.h = 100; s.x = dr.p0.x; s.y = dr.p0.y; } }
    setTool('select'); changed(); buildProps(); buildLayers(); buildTimeline(); selectionChanged();
  }

  // ---------- pen tool
  function penDown(e, p) {
    if (!D.pen) D.pen = { pts: [], sel: -1, drag: null, cursor: p };
    const P = D.pen, hit = P.pts.findIndex((q) => nearPx(p, q.x, q.y));
    const sel = P.pts[P.sel];
    if (sel) for (const w of ['o', 'i']) { if ((sel[w + 'x'] || sel[w + 'y']) && nearPx(p, sel.x + sel[w + 'x'], sel.y + sel[w + 'y'])) { D.drag = { mode: 'penhandle', w }; P.drag = true; return; } }
    if (hit === 0 && P.pts.length >= 3) { finishPen(true); return; }
    if (hit >= 0) { P.sel = hit; D.drag = { mode: 'penmove', ox: P.pts[hit].x, oy: P.pts[hit].y, p0: p }; P.drag = true; dirty(); return; }
    const sn = (v) => (e.shiftKey ? Math.round(v / 10) * 10 : v);
    P.pts.push({ x: sn(p.x), y: sn(p.y), ix: 0, iy: 0, ox: 0, oy: 0 }); P.sel = P.pts.length - 1; D.drag = { mode: 'pennew' }; P.drag = true; dirty();
  }
  function penMove(e, p) {
    const P = D.pen, dr = D.drag, q = P.pts[P.sel]; if (!q || !dr) return;
    if (dr.mode === 'penmove') { q.x = dr.ox + (p.x - dr.p0.x); q.y = dr.oy + (p.y - dr.p0.y); }
    else if (dr.mode === 'pennew') { if (Math.hypot(p.x - q.x, p.y - q.y) * D.zoom > 4) { q.ox = p.x - q.x; q.oy = p.y - q.y; q.ix = -q.ox; q.iy = -q.oy; } }
    else if (dr.mode === 'penhandle') { const a = dr.w, b = a === 'o' ? 'i' : 'o'; q[a + 'x'] = p.x - q.x; q[a + 'y'] = p.y - q.y; if (!e.altKey) { q[b + 'x'] = -q[a + 'x']; q[b + 'y'] = -q[a + 'y']; } }
  }
  function cancelPen() { D.pen = null; D.drag = null; hint(); dirty(); }
  function finishPen(closed) {
    const P = D.pen; if (!P) return;
    const pts = P.pts.filter((q, i, a) => i === 0 || Math.hypot(q.x - a[i - 1].x, q.y - a[i - 1].y) > 1);
    D.pen = null; D.drag = null; hint();
    if (pts.length < 2) { dirty(); return; }
    const s = newShape('path', { closed: !!closed, fillOn: !!closed, sw: 2 }); applyPath(s, { pts, closed: !!closed }, true);
    D.sel = [s.id]; setTool('select'); changed(); buildProps(); buildLayers(); buildTimeline(); selectionChanged();
  }
  // store world-space pen points on a shape: recentre on the curve's bounding box
  function applyPath(s, res, silent) {
    const flat = L.flatten(L.penCmds(res), 16).flatMap((q) => q.pts);
    const x0 = Math.min(...flat.map((q) => q[0])), x1 = Math.max(...flat.map((q) => q[0])), y0 = Math.min(...flat.map((q) => q[1])), y1 = Math.max(...flat.map((q) => q[1]));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    s.pts = res.pts.map((q) => ({ x: q.x - cx, y: q.y - cy, ix: q.ix || 0, iy: q.iy || 0, ox: q.ox || 0, oy: q.oy || 0 }));
    s.closed = !!res.closed; s.x = cx; s.y = cy; s.rot = 0; s.w = s.ow = Math.max(0.01, x1 - x0); s.h = s.oh = Math.max(0.01, y1 - y0);
    ['x', 'y', 'w', 'h', 'rot'].forEach((k) => { if (hasKeys(s, k)) delete s.keys[k]; });
    if (!silent) { changed(); buildProps(); buildTimeline(); }
  }
  function editPoints(s) {
    const b = box(s), fx = b.w / (s.ow || b.w), fy = b.h / (s.oh || b.h);
    const W = (px, py) => { const [rx, ry] = rot(px * fx, py * fy, b.rot); return [rx, ry]; };
    const pts = s.pts.map((q) => { const [x, y] = W(q.x, q.y), [ix, iy] = W(q.ix || 0, q.iy || 0), [ox, oy] = W(q.ox || 0, q.oy || 0); return { x: b.x + x, y: b.y + y, ix, iy, ox, oy }; });
    L.drawEditor.open({ pts, closed: s.closed }, (res) => { if (res) applyPath(s, res); });
  }
  const hint = () => { $('#penhint').hidden = D.tool !== 'pen'; };

  // ---------- tools, selection, panels
  function setTool(t) {
    if (D.pen && t !== 'pen') finishPen(false);
    D.tool = t; D.pen = null; cv.style.cursor = t === 'select' ? 'default' : 'crosshair';
    document.querySelectorAll('#tools button').forEach((b) => b.classList.toggle('on', b.dataset.tool === t)); hint(); dirty();
  }
  function selectionChanged(keepProps) { if (!keepProps) { buildProps(); buildTimeline(); } buildLayers(); D.key = null; dirty(); }

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  function field(label, prop, s, opts = {}) {
    const row = el('div', 'prow'), lab = el('label', 'scrub', label), inp = el('input'); inp.type = 'number'; inp.step = 'any'; if (opts.min !== undefined) inp.min = opts.min; if (opts.max !== undefined) inp.max = opts.max;
    const clampv = (v) => Math.min(opts.max ?? Infinity, Math.max(opts.min ?? -Infinity, v));
    const apply = (v) => { setProp(s, prop, clampv(v)); changed(true); updateProps(); if (hasKeys(s, prop)) buildTimeline(); };
    inp.onchange = () => { const v = parseFloat(inp.value); if (Number.isFinite(v)) apply(v); };
    inp.onkeydown = (e) => e.stopPropagation();
    lab.onpointerdown = (e) => { e.preventDefault(); const x0 = e.clientX, v0 = val(s, prop), k = opts.step || (Math.abs(v0) >= 20 ? 1 : 0.02); const mv = (m) => apply(Math.round((v0 + (m.clientX - x0) * k * (m.shiftKey ? 0.1 : 1)) * 100) / 100); const upf = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', upf); }; addEventListener('pointermove', mv); addEventListener('pointerup', upf); };
    row.append(lab, inp);
    let kb = null;
    if (opts.anim !== false) { kb = el('button', 'kbtn', '◇'); kb.title = 'Add or remove a keyframe at the playhead'; kb.onclick = () => toggleKey(s, prop); row.append(kb); }
    D.fields.push({ s, prop, inp, kb }); return row;
  }
  function colorRow(label, s, colorProp, onProp, extra) {
    const row = el('div', 'prow'), chk = el('input'); chk.type = 'checkbox'; chk.checked = s[onProp] !== false && !!s[colorProp]; chk.title = 'Show/hide';
    const col = el('input'); col.type = 'color'; col.value = /^#[0-9a-f]{6}$/i.test(s[colorProp]) ? s[colorProp] : '#000000';
    if (onProp === 'strokeOn') { // stroke is "on" when it has a width
      chk.checked = (s.sw || 0) > 0;
      chk.onchange = () => { if (chk.checked) s.sw = s.swPrev || 2; else { s.swPrev = s.sw || 2; s.sw = 0; } const w = row.querySelector('.swin'); if (w) w.value = s.sw; changed(); };
    } else chk.onchange = () => { s[onProp] = chk.checked; changed(); };
    col.oninput = () => { s[colorProp] = col.value; if (onProp === 'strokeOn') { if (!(s.sw > 0)) s.sw = s.swPrev || 2; chk.checked = true; const w = row.querySelector('.swin'); if (w) w.value = s.sw; } else { s[onProp] = true; chk.checked = true; } dirty(); }; col.onchange = () => changed();
    row.append(chk, el('label', '', label), col); if (extra) row.append(extra); return row;
  }
  function section(title) { const h = el('div', 'psec', title); return h; }
  function buildProps() {
    const P = $('#props'); P.innerHTML = ''; D.fields = []; const sel = selShapes(), d = doc();
    if (!sel.length) {
      P.append(section('Artboard'));
      const row = el('div', 'prow'), col = el('input'); col.type = 'color'; col.value = d.bg || '#ffffff'; col.oninput = () => { d.bg = col.value; dirty(); }; col.onchange = changed; row.append(el('label', '', 'Background'), col); P.append(row);
      P.append(el('p', 'phint', 'Pick a tool on the left and drag on the artboard to draw. Use the pen (P) for curves. Select a shape to change it and animate it on the timeline.'));
      return;
    }
    // alignment
    const al = el('div', 'palign');
    [['⇤', 'left', 'Align left'], ['⇔', 'hc', 'Align horizontal centers'], ['⇥', 'right', 'Align right'], ['⤒', 'top', 'Align top'], ['⇕', 'vc', 'Align vertical centers'], ['⤓', 'bottom', 'Align bottom']].forEach(([ic, how, tip]) => { const b = el('button', '', ic); b.title = tip; b.onclick = () => align(how); al.append(b); });
    P.append(al);
    if (sel.length > 1) { P.append(el('p', 'phint', `${sel.length} layers selected. Drag to move them together.`)); return; }
    const s = sel[0];
    const name = el('input', 'pname'); name.value = s.name; name.onkeydown = (e) => e.stopPropagation(); name.onchange = () => { s.name = name.value || KIND[s.kind]; changed(); buildLayers(); }; P.append(name);
    P.append(section('Layout'));
    const g2 = el('div', 'pgrid'); g2.append(field('X', 'x', s), field('Y', 'y', s), field('W', 'w', s, { min: 0.01 }), field('H', 'h', s, { min: 0.01 }), field('Rot', 'rot', s, { step: 1 })); P.append(g2);
    if (s.kind === 'rect' || s.kind === 'polygon' || s.kind === 'star') P.append(section('Shape'));
    if (s.kind === 'rect') P.append(field('Radius', 'radius', s, { min: 0 }));
    if (s.kind === 'polygon') P.append(field('Sides', 'sides', s, { min: 3, max: 24, step: 1, anim: false }));
    if (s.kind === 'star') { P.append(field('Points', 'sides', s, { min: 3, max: 24, step: 1, anim: false })); P.append(field('Inner', 'inner', s, { min: 0.05, max: 0.95 })); }
    P.append(section('Appearance')); P.append(field('Opacity', 'opacity', s, { min: 0, max: 1 }));
    const closedShape = s.kind !== 'line' && !(s.kind === 'path' && !s.closed);
    if (closedShape) P.append(colorRow('Fill', s, 'fill', 'fillOn'));
    const sw = el('input'); sw.type = 'number'; sw.min = 0; sw.step = 0.5; sw.value = s.sw; sw.title = 'Stroke width'; sw.className = 'swin'; sw.onkeydown = (e) => e.stopPropagation();
    sw.onchange = () => { s.sw = Math.max(0, parseFloat(sw.value) || 0); const ck = sw.parentElement.querySelector('input[type=checkbox]'); if (ck) ck.checked = s.sw > 0; changed(); };
    P.append(colorRow('Stroke', s, 'stroke', 'strokeOn', sw));
    if (s.kind === 'path' || s.kind === 'line') { const b = el('button', 'wide', 'Edit points…'); b.onclick = () => editPoints(s); P.append(b); }
    updateProps();
  }
  function updateProps() {
    D.fields.forEach(({ s, prop, inp, kb }) => {
      if (document.activeElement !== inp) inp.value = fmt(val(s, prop));
      if (kb) { const t = snapT(D.time), ks = (s.keys && s.keys[prop]) || [], on = ks.some((q) => Math.abs(q.t - t) < 1e-3); kb.textContent = on ? '◆' : '◇'; kb.classList.toggle('on', on); kb.classList.toggle('anim', ks.length > 0); }
    });
  }
  function align(how) {
    const sel = selShapes(); if (!sel.length) return;
    const u = sel.length > 1 ? unionBox(sel) : { x0: -300, x1: 300, y0: -300, y1: 300 };
    sel.forEach((s) => {
      const a = aabb(s); let dx = 0, dy = 0;
      if (how === 'left') dx = u.x0 - a.x0; else if (how === 'right') dx = u.x1 - a.x1; else if (how === 'hc') dx = (u.x0 + u.x1) / 2 - (a.x0 + a.x1) / 2;
      else if (how === 'top') dy = u.y0 - a.y0; else if (how === 'bottom') dy = u.y1 - a.y1; else dy = (u.y0 + u.y1) / 2 - (a.y0 + a.y1) / 2;
      if (dx) setProp(s, 'x', val(s, 'x') + dx); if (dy) setProp(s, 'y', val(s, 'y') + dy);
    });
    changed(); updateProps(); buildTimeline();
  }

  // layers
  let layerDrag = null;
  function buildLayers() {
    const box = $('#layers'); box.innerHTML = ''; const head = el('div', 'psec', 'Layers'); box.append(head);
    const list = el('div', 'llist'); const ss = doc().shapes;
    if (!ss.length) list.append(el('p', 'phint', 'No layers yet.'));
    for (let i = ss.length - 1; i >= 0; i--) {
      const s = ss[i], row = el('div', 'lrow' + (D.sel.includes(s.id) ? ' on' : '') + (s.visible === false ? ' off' : '')); row.draggable = true;
      const eye = el('span', 'lbtn', s.visible === false ? '○' : '●'); eye.title = 'Show/hide'; eye.onclick = (e) => { e.stopPropagation(); s.visible = s.visible === false; changed(); buildLayers(); };
      const lock = el('span', 'lbtn', s.locked ? '🔒' : '·'); lock.title = 'Lock'; lock.onclick = (e) => { e.stopPropagation(); s.locked = !s.locked; if (s.locked) D.sel = D.sel.filter((q) => q !== s.id); changed(); selectionChanged(); };
      const nm = el('span', 'lname', s.name); nm.ondblclick = () => { nm.contentEditable = 'true'; nm.focus(); }; nm.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); nm.blur(); } };
      nm.onblur = () => { nm.contentEditable = 'false'; if (nm.textContent.trim() && nm.textContent !== s.name) { s.name = nm.textContent.trim(); changed(); buildProps(); } };
      const kind = el('span', 'lkind', `<svg viewBox="0 0 18 18" width="14" height="14">${ICON[s.kind === 'path' ? 'pen' : s.kind] || ''}</svg>`);
      row.append(kind, nm, lock, eye);
      row.onclick = (e) => { if (e.shiftKey) D.sel = D.sel.includes(s.id) ? D.sel.filter((q) => q !== s.id) : [...D.sel, s.id]; else D.sel = [s.id]; selectionChanged(); setTool('select'); };
      row.ondragstart = () => { layerDrag = s.id; }; row.ondragover = (e) => { e.preventDefault(); row.classList.add('over'); }; row.ondragleave = () => row.classList.remove('over');
      row.ondrop = (e) => { e.preventDefault(); row.classList.remove('over'); if (layerDrag && layerDrag !== s.id) { const arr = doc().shapes, from = arr.findIndex((q) => q.id === layerDrag), to = arr.findIndex((q) => q.id === s.id), [m] = arr.splice(from, 1); arr.splice(to, 0, m); changed(); buildLayers(); } layerDrag = null; };
      list.append(row);
    }
    box.append(list);
    const bar = el('div', 'lbar'); [['Duplicate', duplicate], ['Delete', del], ['Forward', () => order(1)], ['Back', () => order(-1)]].forEach(([t, f]) => { const b = el('button', '', t); b.onclick = f; bar.append(b); }); box.append(bar);
  }
  function del() { const ids = new Set(D.sel); if (!ids.size) return; doc().shapes = doc().shapes.filter((s) => !ids.has(s.id)); D.sel = []; changed(); selectionChanged(); }
  function duplicate() {
    const out = []; selShapes().forEach((s) => { const n = clone(s); n.id = 'd' + doc().next++; n.name = s.name + ' copy'; n.x = (s.x || 0) + 20; n.y = (s.y || 0) + 20; Object.keys(n.keys || {}).forEach((k) => { if (k === 'x' || k === 'y') n.keys[k] = n.keys[k].map((q) => ({ ...q, v: q.v + 20 })); }); doc().shapes.push(n); out.push(n.id); });
    if (out.length) { D.sel = out; changed(); selectionChanged(); }
  }
  function order(dir) {
    const arr = doc().shapes, ids = D.sel.slice(); if (!ids.length) return;
    const idx = ids.map((id) => arr.findIndex((s) => s.id === id)).sort((a, b) => dir * (b - a));
    idx.forEach((i) => { const j = i + dir; if (j < 0 || j >= arr.length || ids.includes(arr[j].id)) return; [arr[i], arr[j]] = [arr[j], arr[i]]; });
    changed(); buildLayers();
  }

  // ---------- timeline
  const EASES = [['ease', 'Smooth'], ['linear', 'Linear'], ['in', 'Ease in'], ['out', 'Ease out'], ['inout', 'Ease in-out'], ['back', 'Overshoot'], ['bounce', 'Bounce'], ['hold', 'Hold']];
  const PROP_LABEL = { x: 'X', y: 'Y', w: 'Width', h: 'Height', rot: 'Rotation', opacity: 'Opacity', radius: 'Radius', inner: 'Inner' };
  function setTime(t, fromPlay) { const d = doc(); D.time = Math.max(0, Math.min(d.duration, t)); dirty(); updateProps(); const ph = $('.playhead'); if (ph) ph.style.left = (D.time / d.duration) * 100 + '%'; const tt = $('#tlTime'); if (tt) tt.textContent = D.time.toFixed(2) + 's'; void fromPlay; }
  function buildTimeline() {
    const T = $('#timeline'), d = doc(), s = first(), props = s ? Object.keys(s.keys || {}).filter((p) => s.keys[p].length) : [];
    T.innerHTML = '';
    const bar = el('div', 'tbar');
    const start = el('button', '', '⏮'); start.title = 'Back to start'; start.onclick = () => setTime(0);
    const play = el('button', '', hooks.isPlaying() ? '⏸' : '▶'); play.id = 'tlPlay'; play.title = 'Play / pause (Space)'; play.onclick = () => { hooks.setPlaying(!hooks.isPlaying()); play.textContent = hooks.isPlaying() ? '⏸' : '▶'; };
    const loop = el('label', 'tloop', '<input type="checkbox"> Loop'); loop.firstChild.checked = d.loop !== false; loop.firstChild.onchange = (e) => { d.loop = e.target.checked; changed(); };
    const tt = el('span', 'ttime', D.time.toFixed(2) + 's'); tt.id = 'tlTime';
    const dur = el('input'); dur.type = 'number'; dur.min = 0.5; dur.step = 0.5; dur.value = d.duration; dur.className = 'tdur'; dur.onkeydown = (e) => e.stopPropagation(); dur.onchange = () => { d.duration = Math.max(0.5, parseFloat(dur.value) || 4); setTime(D.time); changed(); buildTimeline(); };
    bar.append(start, play, loop, tt, el('span', 'tsep', '/'), dur, el('span', 'tsep', 'sec'));
    const kt = el('span', 'tkeytools'); kt.id = 'tkeytools'; bar.append(kt);
    T.append(bar); renderKeyTools();
    const grid = el('div', 'tgrid'), labels = el('div', 'tlabels'), lanes = el('div', 'tlanes'); lanes.id = 'lanes';
    labels.append(el('div', 'tl-head', s ? s.name : 'Timeline'));
    const ruler = el('div', 'ruler'); const step = d.duration <= 6 ? 0.5 : 1;
    for (let t = 0; t <= d.duration + 1e-6; t += step) { const tick = el('span', 'tick' + (Math.abs(t - Math.round(t)) < 1e-6 ? ' big' : ''), Math.abs(t - Math.round(t)) < 1e-6 ? String(Math.round(t)) : ''); tick.style.left = (t / d.duration) * 100 + '%'; ruler.append(tick); }
    lanes.append(ruler);
    const scrub = (e) => { const r = lanes.getBoundingClientRect(); setTime(((e.clientX - r.left) / r.width) * d.duration); };
    ruler.onpointerdown = (e) => { e.preventDefault(); scrub(e); const mv = scrub, upf = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', upf); }; addEventListener('pointermove', mv); addEventListener('pointerup', upf); };
    if (!props.length) lanes.append(el('div', 'tempty', s ? 'No animation yet. Move the playhead, then click ◇ next to a property to add a keyframe.' : 'Select a shape to animate it.'));
    props.forEach((p) => {
      labels.append(el('div', 'tl-label', PROP_LABEL[p] || p));
      const lane = el('div', 'lane');
      s.keys[p].forEach((kf, i) => {
        const dm = el('span', 'kf' + (D.key && D.key.p === p && D.key.i === i ? ' on' : '')); dm.style.left = (kf.t / d.duration) * 100 + '%'; dm.title = `${PROP_LABEL[p] || p}: ${fmt(kf.v)} @ ${kf.t.toFixed(2)}s`;
        dm.onpointerdown = (e) => {
          e.preventDefault(); e.stopPropagation(); D.key = { p, i }; setTime(kf.t); $$('.kf').forEach((q) => q.classList.remove('on')); dm.classList.add('on'); renderKeyTools();
          const mv = (m) => { const r = lanes.getBoundingClientRect(); const nt = snapT(Math.max(0, Math.min(d.duration, ((m.clientX - r.left) / r.width) * d.duration))); if (!s.keys[p].some((q, j) => j !== D.key.i && Math.abs(q.t - nt) < 1e-3)) { kf.t = nt; dm.style.left = (nt / d.duration) * 100 + '%'; setTime(nt); } };
          const upf = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', upf); const cur = s.keys[p][D.key.i]; s.keys[p].sort((a, b) => a.t - b.t); D.key.i = s.keys[p].indexOf(cur); changed(); buildTimeline(); };
          addEventListener('pointermove', mv); addEventListener('pointerup', upf);
        };
        lane.append(dm);
      });
      lanes.append(lane);
    });
    const ph = el('div', 'playhead'); ph.style.left = (D.time / d.duration) * 100 + '%'; lanes.append(ph);
    grid.append(labels, lanes); T.append(grid);
  }
  const $$ = (s) => [...document.querySelectorAll(s)];
  function renderKeyTools() {
    const kt = $('#tkeytools'); if (!kt) return; kt.innerHTML = ''; const s = first(), k = D.key && s && s.keys[D.key.p] && s.keys[D.key.p][D.key.i]; if (!k) return;
    const sel = el('select'); EASES.forEach(([v, t]) => { const o = el('option', '', t); o.value = v; sel.append(o); }); sel.value = k.e || 'ease'; sel.onchange = () => { k.e = sel.value; changed(); };
    const del = el('button', '', 'Delete key'); del.onclick = delKey; kt.append(el('label', 'tease', 'Easing to next key'), sel, del);
  }
  function delKey() { const s = first(); if (!s || !D.key) return; const ks = s.keys[D.key.p]; if (!ks) return; ks.splice(D.key.i, 1); D.key = null; changed(); buildProps(); buildTimeline(); }

  // ---------- keyboard (design tab only); returns true if handled
  function key(e) {
    if (e.target.matches && e.target.matches('input:not([type=color]):not([type=checkbox]),textarea,select,[contenteditable="true"]')) return false;
    const mod = e.ctrlKey || e.metaKey, k = e.key;
    if (D.pen) {
      if (k === 'Enter') { e.preventDefault(); finishPen(false); return true; }
      if (k === 'Escape') { e.preventDefault(); if (D.pen.pts.length >= 2) finishPen(false); else cancelPen(); return true; }
      if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); D.pen.pts.pop(); D.pen.sel = D.pen.pts.length - 1; dirty(); return true; }
    }
    if (mod && k.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return true; }
    if (mod && k.toLowerCase() === 'a') { e.preventDefault(); D.sel = doc().shapes.filter((s) => s.visible !== false && !s.locked).map((s) => s.id); selectionChanged(); return true; }
    if (mod) return false;
    const t = TOOLS.find(([, key]) => key.toLowerCase() === k.toLowerCase()); if (t) { setTool(t[0]); return true; }
    if (k === 'Escape') { if (D.tool !== 'select') setTool('select'); else { D.sel = []; selectionChanged(); } return true; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); if (D.key) delKey(); else del(); return true; }
    if (k === ']') { order(1); return true; } if (k === '[') { order(-1); return true; }
    if (k.startsWith('Arrow') && D.sel.length) { e.preventDefault(); const n = e.shiftKey ? 10 : 1; selShapes().forEach((s) => { if (k === 'ArrowLeft') setProp(s, 'x', val(s, 'x') - n); if (k === 'ArrowRight') setProp(s, 'x', val(s, 'x') + n); if (k === 'ArrowUp') setProp(s, 'y', val(s, 'y') - n); if (k === 'ArrowDown') setProp(s, 'y', val(s, 'y') + n); }); changed(); updateProps(); return true; }
    return false;
  }

  // ---------- view
  function resize() { const st = $('#dstage'); CW = st.clientWidth; CH = st.clientHeight; if (!CW || !CH) return; dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(CW * dpr); cv.height = Math.round(CH * dpr); cv.style.width = CW + 'px'; cv.style.height = CH + 'px'; dirty(); }
  function fit() { if (!CW) resize(); D.zoom = Math.max(0.1, Math.min(CW, CH) / 700); D.pan = { x: CW / 2, y: CH / 2 }; dirty(); }
  function zoomAt(f, sx = CW / 2, sy = CH / 2) { const nz = Math.max(0.1, Math.min(8, D.zoom * f)); D.pan = { x: sx - ((sx - D.pan.x) / D.zoom) * nz, y: sy - ((sy - D.pan.y) / D.zoom) * nz }; D.zoom = nz; dirty(); }
  function wheel(e) {
    e.preventDefault(); const r = cv.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    else { D.pan = { x: D.pan.x - e.deltaX, y: D.pan.y - e.deltaY }; dirty(); }
  }

  function init(h) {
    hooks = h; cv = $('#dcv'); c = cv.getContext('2d');
    const tools = $('#tools'); TOOLS.forEach(([id, k, name]) => { const b = el('button', '', `<svg viewBox="0 0 18 18" width="18" height="18">${ICON[id]}</svg>`); b.dataset.tool = id; b.title = `${name} (${k})`; b.onclick = () => setTool(id); tools.append(b); });
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('wheel', wheel, { passive: false });
    cv.addEventListener('pointerleave', () => { if (D.hover) { D.hover = null; dirty(); } });
    cv.addEventListener('dblclick', (e) => {
      if (D.tool === 'pen') { finishPen(false); return; }
      if (D.tool !== 'select') return; const s = pickAt(toWorld(e)); if (s && (s.kind === 'path' || s.kind === 'line')) editPoints(s);
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    $('#zIn').onclick = () => zoomAt(1.25); $('#zOut').onclick = () => zoomAt(0.8); $('#zFit').onclick = fit;
    new ResizeObserver(() => { if (!$('#designView').hidden) resize(); }).observe($('#dstage'));
    ready = true; setTool('select');
  }
  function show() { if (!ready) return; D.sel = D.sel.filter(byId); resize(); fit(); refresh(); }
  function refresh() { if (!ready) return; D.sel = D.sel.filter(byId); D.key = null; setTime(Math.min(D.time, doc().duration)); buildProps(); buildLayers(); buildTimeline(); dirty(); }
  // called every animation frame while the Design tab is open; returns the scene when it changed
  function frame(dt, playing) {
    if (!ready) return null; const d = doc(); let changedT = false;
    if (playing && !D.drag) { let t = D.time + dt; if (t > d.duration) { if (d.loop !== false) t %= d.duration; else { t = d.duration; hooks.setPlaying(false); } } D.time = t; changedT = true; const ph = $('.playhead'); if (ph) ph.style.left = (t / d.duration) * 100 + '%'; const tt = $('#tlTime'); if (tt) tt.textContent = t.toFixed(2) + 's'; updateProps(); }
    if (!D.dirty && !changedT) return null;
    D.dirty = false; render(); return { geo: L.designShapes(d, D.time), bg: d.bg || '#ffffff' };
  }

  const syncPlay = () => { const b = $('#tlPlay'); if (b && hooks) b.textContent = hooks.isPlaying() ? '⏸' : '▶'; };
  g.Daub.design = { init, show, refresh, frame, fit, key, setTime, syncPlay, get time() { return D.time; }, get pen() { return !!D.pen; } };
})(window);
