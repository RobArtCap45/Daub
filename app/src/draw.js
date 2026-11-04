/* Daub pen editor: a full-screen overlay to draw a bezier shape.
 * Click = corner point, click-drag = smooth point with handles, click the first point to close.
 * Drag points/handles to adjust (Alt = move one handle alone), Delete removes the selected point, Shift snaps to a grid.
 */
(function (g) {
  'use strict';
  const { penCmds } = g.Daub;
  const $ = (s) => document.querySelector(s);
  const SPAN = 600; // world units across the square stage (-300..300)

  function open(initial, onDone) {
    const wrap = $('#pen'), cv = $('#pencv'), cx = cv.getContext('2d'), chk = $('#penClosed');
    const st = { pts: JSON.parse(JSON.stringify((initial && initial.pts) || [])), closed: !!(initial && initial.closed), sel: -1, drag: null };
    let S = 500, k = 1, dpr = Math.min(2, window.devicePixelRatio || 1);
    wrap.hidden = false; chk.checked = st.closed;

    const layout = () => {
      const stage = cv.parentElement; S = Math.max(240, Math.floor(Math.min(stage.clientWidth, stage.clientHeight) - 24)); k = S / SPAN;
      cv.style.width = cv.style.height = S + 'px'; cv.width = cv.height = Math.round(S * dpr); draw();
    };
    const toWorld = (e, snap) => {
      const r = cv.getBoundingClientRect(); let x = ((e.clientX - r.left) / r.width) * SPAN - SPAN / 2, y = ((e.clientY - r.top) / r.height) * SPAN - SPAN / 2;
      if (snap) { x = Math.round(x / 10) * 10; y = Math.round(y / 10) * 10; } return { x, y };
    };
    const px = (v) => (v + SPAN / 2) * k;
    const near = (a, b, r = 9) => Math.hypot(px(a.x) - px(b.x), px(a.y) - px(b.y)) <= r;

    function draw() {
      cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.fillStyle = '#fbfbfa'; cx.fillRect(0, 0, S, S);
      cx.lineWidth = 1;
      for (let v = -300; v <= 300; v += 50) { cx.strokeStyle = v === 0 ? '#c4c4be' : '#ebebe7'; cx.beginPath(); cx.moveTo(px(v), 0); cx.lineTo(px(v), S); cx.moveTo(0, px(v)); cx.lineTo(S, px(v)); cx.stroke(); }
      if (st.pts.length > 1) {
        cx.beginPath(); penCmds({ pts: st.pts, closed: st.closed }).forEach((c) => {
          const P = (i) => [px(c[i]), px(c[i + 1])];
          if (c[0] === 'M') cx.moveTo(...P(1)); else if (c[0] === 'L') cx.lineTo(...P(1)); else if (c[0] === 'C') cx.bezierCurveTo(...P(1), ...P(3), ...P(5)); else cx.closePath();
        });
        if (st.closed) { cx.fillStyle = 'rgba(232,72,58,.12)'; cx.fill(); }
        cx.strokeStyle = '#1d1d1b'; cx.lineWidth = 2; cx.stroke();
      }
      st.pts.forEach((p, i) => {
        if (i === st.sel) {
          [['i', p.x + (p.ix || 0), p.y + (p.iy || 0)], ['o', p.x + (p.ox || 0), p.y + (p.oy || 0)]].forEach(([, hx, hy]) => {
            if (Math.abs(hx - p.x) + Math.abs(hy - p.y) < 0.01) return;
            cx.strokeStyle = '#8a8a84'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(px(p.x), px(p.y)); cx.lineTo(px(hx), px(hy)); cx.stroke();
            cx.fillStyle = '#fff'; cx.strokeStyle = '#e8483a'; cx.beginPath(); cx.arc(px(hx), px(hy), 4.5, 0, 6.283); cx.fill(); cx.stroke();
          });
        }
        cx.fillStyle = i === st.sel ? '#e8483a' : '#fff'; cx.strokeStyle = i === 0 ? '#e8483a' : '#1d1d1b'; cx.lineWidth = 1.6;
        cx.beginPath(); cx.rect(px(p.x) - 4.5, px(p.y) - 4.5, 9, 9); cx.fill(); cx.stroke();
      });
      $('#penCount').textContent = st.pts.length ? `${st.pts.length} point${st.pts.length > 1 ? 's' : ''}` : 'Click anywhere to start';
    }

    function down(e) {
      cv.setPointerCapture(e.pointerId);
      const w = toWorld(e, e.shiftKey);
      const s = st.pts[st.sel];
      if (s) { // handles of the selected point
        for (const which of ['o', 'i']) {
          const h = { x: s.x + (s[which + 'x'] || 0), y: s.y + (s[which + 'y'] || 0) };
          if ((s[which + 'x'] || s[which + 'y']) && near(w, h)) { st.drag = { mode: 'handle', which }; return; }
        }
      }
      const hit = st.pts.findIndex((p) => near(w, p));
      if (hit === 0 && !st.closed && st.pts.length >= 3) { st.closed = true; chk.checked = true; st.sel = 0; draw(); return; }
      if (hit >= 0) { st.sel = hit; st.drag = { mode: 'move', ox: st.pts[hit].x, oy: st.pts[hit].y, sx: w.x, sy: w.y }; draw(); return; }
      st.pts.push({ x: w.x, y: w.y, ix: 0, iy: 0, ox: 0, oy: 0 }); st.sel = st.pts.length - 1; st.drag = { mode: 'new', sx: w.x, sy: w.y }; draw();
    }
    function move(e) {
      if (!st.drag) return;
      const w = toWorld(e, e.shiftKey && st.drag.mode !== 'handle'), p = st.pts[st.sel]; if (!p) return;
      if (st.drag.mode === 'move') { p.x = st.drag.ox + (w.x - st.drag.sx); p.y = st.drag.oy + (w.y - st.drag.sy); }
      else if (st.drag.mode === 'new') { if (Math.hypot(w.x - p.x, w.y - p.y) * k > 4) { p.ox = w.x - p.x; p.oy = w.y - p.y; p.ix = -p.ox; p.iy = -p.oy; } }
      else if (st.drag.mode === 'handle') {
        const a = st.drag.which, b = a === 'o' ? 'i' : 'o';
        p[a + 'x'] = w.x - p.x; p[a + 'y'] = w.y - p.y;
        if (!e.altKey) { p[b + 'x'] = -p[a + 'x']; p[b + 'y'] = -p[a + 'y']; }
      }
      draw();
    }
    const up = () => { st.drag = null; };
    const del = () => { if (st.sel >= 0) { st.pts.splice(st.sel, 1); st.sel = Math.min(st.sel, st.pts.length - 1); if (st.pts.length < 3) { st.closed = false; chk.checked = false; } draw(); } };
    function smooth() {
      const P = st.pts, n = P.length;
      P.forEach((p, i) => {
        const a = i > 0 ? P[i - 1] : st.closed ? P[n - 1] : p, b = i < n - 1 ? P[i + 1] : st.closed ? P[0] : p;
        p.ox = (b.x - a.x) / 6; p.oy = (b.y - a.y) / 6; p.ix = -p.ox; p.iy = -p.oy;
      });
      draw();
    }
    function finish(commit) {
      cleanup(); wrap.hidden = true;
      if (commit && st.pts.length >= 2) onDone({ pts: st.pts, closed: st.closed });
      else if (commit && st.pts.length === 0) onDone(null);
    }
    const onKey = (e) => {
      if (wrap.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); }
    };
    const handlers = [
      [cv, 'pointerdown', down], [cv, 'pointermove', move], [cv, 'pointerup', up], [window, 'resize', layout],
      [$('#penDone'), 'click', () => finish(true)], [$('#penCancel'), 'click', () => finish(false)],
      [$('#penClear'), 'click', () => { st.pts = []; st.sel = -1; st.closed = false; chk.checked = false; draw(); }],
      [$('#penSmooth'), 'click', smooth], [chk, 'change', () => { st.closed = chk.checked && st.pts.length >= 3; chk.checked = st.closed; draw(); }],
    ];
    handlers.forEach(([t, ev, fn]) => t.addEventListener(ev, fn));
    const keyTimer = setTimeout(() => window.addEventListener('keydown', onKey), 80); // not in the same tick as the key that opened us
    function cleanup() { clearTimeout(keyTimer); window.removeEventListener('keydown', onKey); handlers.forEach(([t, ev, fn]) => t.removeEventListener(ev, fn)); }
    layout();
  }

  g.Daub.drawEditor = { open };
})(window);
