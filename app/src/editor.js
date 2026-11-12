/* Daub node editor: DOM nodes + SVG wires, pan/zoom, multi-select, custom nodes (subnetworks).
 *
 * project  = root graph { nodes, edges, subs }      (what gets saved)
 * graph    = the graph currently shown (root, or a custom node's inside)
 * stack    = ids of custom nodes we have opened ([] = main sketch)
 */
(function (g) {
  'use strict';
  const { PORT_COLORS, getDef } = g.Daub;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const LABELS = {
    bri: 'brightness', sat: 'saturation', strokeW: 'stroke width', strokeBri: 'stroke bright', sx: 'scale x', sy: 'scale y', w: 'width', h: 'height',
    inMin: 'from min', inMax: 'from max', outMin: 'to min', outMax: 'to max', n: 'every', pts: 'points', geo: 'shape', attr: 'read', op: 'operation',
    len: 'length', dx: 'move x', dy: 'move y', x1: 'start x', y1: 'start y', cx1: 'handle 1 x', cy1: 'handle 1 y', cx2: 'handle 2 x', cy2: 'handle 2 y',
    x2: 'end x', y2: 'end y', close: 'closed (0/1)', keep: 'keep original (0/1)', halign: 'horizontal', valign: 'vertical', with: 'with', span: 'span (0 = use gap)', center: 'center at',
  };
  const compat = (ot, it) => !!ot && (ot === it || ot === 'any' || it === 'any');

  class Editor {
    constructor(host, project, onChange) {
      this.el = host; this.onChange = onChange; this.pan = { x: 20, y: 20 }; this.scale = 1;
      this.stack = []; this.sel = new Set(); this.noteOpen = new Set();
      this.world = el('div', 'world');
      this.svg = document.createElementNS(SVGNS, 'svg'); this.svg.setAttribute('class', 'wires');
      this.world.appendChild(this.svg); host.appendChild(this.world);
      this.marquee = el('div', 'marquee'); this.marquee.hidden = true; host.appendChild(this.marquee);

      host.addEventListener('pointerdown', (e) => {
        if (e.target !== host && e.target !== this.world) return;
        if (e.shiftKey) return this.startMarquee(e);
        const sx = e.clientX - this.pan.x, sy = e.clientY - this.pan.y; let moved = 0;
        this.drag(e, (ev) => { moved = Math.max(moved, Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY)); this.pan = { x: ev.clientX - sx, y: ev.clientY - sy }; this.applyPan(); },
          () => { if (moved < 4) this.setSel([]); });
      });
      host.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        const r = host.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
        const ns = Math.max(0.3, Math.min(1.6, this.scale * Math.exp(-ev.deltaY * 0.0015)));
        this.pan = { x: mx - ((mx - this.pan.x) / this.scale) * ns, y: my - ((my - this.pan.y) / this.scale) * ns };
        this.scale = ns; this.applyPan(); this.drawWires();
      }, { passive: false });
      this.setProject(project);
    }

    // ----- project / navigation
    get subs() { return (this.project.subs = this.project.subs || {}); }
    def(type) { return getDef(type, this.subs); }
    get codeMode() { return false; } // the code-as-nodes editor (CodeEditor) turns this on
    get sub() { return this.stack.length ? this.subs[this.stack[this.stack.length - 1]] : null; }
    setProject(p, fit = true, keepPath = false) {
      this.project = p; this.subs;
      if (!(keepPath && this.stack.every((id) => this.subs[id]))) this.stack = [];
      this.graph = this.sub || this.project; this.sel = new Set();
      this.afterNav(fit);
    }
    setGraph(p, fit) { this.setProject(p, fit); } // backwards-compatible alias
    enter(id) { if (!this.subs[id] || this.stack.includes(id)) return; this.stack.push(id); this.graph = this.subs[id]; this.sel = new Set(); this.afterNav(true); }
    up() { if (!this.stack.length) return; this.stack.pop(); this.graph = this.sub || this.project; this.sel = new Set(); this.afterNav(true); }
    afterNav(fit) {
      this.el.classList.toggle('inside', this.stack.length > 0);
      this.rebuild(); if (fit) this.fit(); else this.applyPan();
      this.onNav && this.onNav(this.stack);
    }
    applyPan() { this.world.style.transform = `translate(${this.pan.x}px,${this.pan.y}px) scale(${this.scale})`; }
    // The editor cannot measure itself while its tab is hidden. Remember that, and finish when it is shown again.
    refresh() {
      if (!this.stale || !this.el.clientWidth) return;
      this.stale = false;
      if (this.needsFit) { this.needsFit = false; this.fit(); return; }
      this.applyPan(); this.drawWires();
      const view = this.el.getBoundingClientRect(); // the graph changed behind our back: if most of it is off-screen, bring it back
      const seen = [...this.world.querySelectorAll('.node')].filter((b) => { const q = b.getBoundingClientRect(); return q.right > view.left && q.left < view.right && q.bottom > view.top && q.top < view.bottom; }).length;
      if (seen < this.graph.nodes.length / 2) this.fit();
    }
    fit() {
      if (!this.el.clientWidth) { this.needsFit = true; this.stale = true; return; }
      const ns = this.graph.nodes; if (!ns.length) { this.pan = { x: 20, y: 20 }; this.scale = 1; this.applyPan(); return; }
      const els = [...this.world.querySelectorAll('.node')];
      const dim = (id, p, d) => { const b = els.find((x) => x.dataset.id === id); return b ? b[p] : d; };
      const x0 = Math.min(...ns.map((n) => n.x)), y0 = Math.min(...ns.map((n) => n.y));
      const x1 = Math.max(...ns.map((n) => n.x + dim(n.id, 'offsetWidth', 170))), y1 = Math.max(...ns.map((n) => n.y + dim(n.id, 'offsetHeight', 120)));
      const vw = this.el.clientWidth, vh = this.el.clientHeight, pad = 40;
      this.scale = Math.max(0.35, Math.min(1, (vw - pad * 2) / (x1 - x0), (vh - pad * 2) / (y1 - y0)));
      this.pan = { x: (vw - (x1 - x0) * this.scale) / 2 - x0 * this.scale, y: Math.max(pad / 2, (vh - (y1 - y0) * this.scale) / 2) - y0 * this.scale };
      this.applyPan(); this.drawWires();
    }
    changed() { this.onChange && this.onChange(); }

    // ----- selection
    setSel(ids) { this.sel = new Set(ids); this.paintSel(); }
    paintSel() {
      this.world.querySelectorAll('.node').forEach((b) => b.classList.toggle('sel', this.sel.has(b.dataset.id)));
      this.onSelect && this.onSelect();
    }
    selectedNodes() { return this.graph.nodes.filter((n) => this.sel.has(n.id)); }
    startMarquee(e) {
      const hr = this.el.getBoundingClientRect(), add = e.ctrlKey || e.metaKey, base = new Set(add ? this.sel : []);
      this.marquee.hidden = false;
      const upd = (ev) => {
        const x0 = Math.min(e.clientX, ev.clientX) - hr.left, y0 = Math.min(e.clientY, ev.clientY) - hr.top, x1 = Math.max(e.clientX, ev.clientX) - hr.left, y1 = Math.max(e.clientY, ev.clientY) - hr.top;
        Object.assign(this.marquee.style, { left: x0 + 'px', top: y0 + 'px', width: x1 - x0 + 'px', height: y1 - y0 + 'px' });
        const ids = new Set(base);
        this.world.querySelectorAll('.node').forEach((b) => {
          const n = this.graph.nodes.find((q) => q.id === b.dataset.id); if (!n) return;
          const nx0 = this.pan.x + n.x * this.scale, ny0 = this.pan.y + n.y * this.scale, nx1 = nx0 + b.offsetWidth * this.scale, ny1 = ny0 + b.offsetHeight * this.scale;
          if (nx1 >= x0 && nx0 <= x1 && ny1 >= y0 && ny0 <= y1) ids.add(n.id);
        });
        this.setSel(ids);
      };
      this.drag(e, upd, () => { this.marquee.hidden = true; }); upd(e);
    }

    drag(e, move, up) {
      e.preventDefault();
      const mv = (ev) => move(ev);
      const end = (ev) => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', end); up && up(ev); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', end);
    }

    // ----- editing the graph
    newId(prefix = 'n') { const ids = this.graph.nodes.map((n) => parseInt(n.id.replace(/\D/g, ''), 10) || 0); return prefix + (Math.max(0, ...ids) + 1); }
    addNode(type, wx, wy) {
      const k = this.graph.nodes.length, id = this.newId();
      this.graph.nodes.push({ id, type, x: wx ?? (-this.pan.x + 40) / this.scale + (k % 5) * 24, y: wy ?? (-this.pan.y + 40) / this.scale + (k % 5) * 24, params: {} });
      this.sel = new Set([id]); this.rebuild(); this.changed();
      if (type === 'draw' && this.onEditDraw) this.onEditDraw(id);
    }
    removeNodes(ids) {
      const set = new Set(ids);
      this.graph.nodes = this.graph.nodes.filter((n) => !set.has(n.id));
      this.graph.edges = this.graph.edges.filter((e) => !set.has(e.from) && !set.has(e.to));
      const sub = this.sub;
      if (sub && sub.inputs) {
        sub.inputs = sub.inputs.filter((i) => !set.has(i.node));
        if (set.has(sub.out)) { const c = [...sub.nodes].reverse().find((n) => this.def(n.type).out); sub.out = c ? c.id : null; }
      }
      this.sel = new Set(); this.pruneEdges(); this.rebuild(); this.changed();
    }
    removeNode(id) { this.removeNodes([id]); }
    // change what kind of node this is, keeping its values (used to add or remove an argument)
    retype(n, type) { n.type = type; this.pruneEdges(); this.rebuild(); this.changed(); }
    deleteSelected() { const ids = this.selectedNodes().filter((n) => !this.def(n.type).singleton).map((n) => n.id); if (ids.length) this.removeNodes(ids); }

    connect(from, to, input) {
      const a = this.graph.nodes.find((n) => n.id === from), b = this.graph.nodes.find((n) => n.id === to);
      if (!a || !b || from === to) return;
      const spec = this.def(b.type).inputs.find((s) => s.n === input);
      if (!spec || !compat(this.def(a.type).out, spec.t)) return;
      this.graph.edges = this.graph.edges.filter((e) => !(e.to === to && e.input === input) && !(spec.t === 'flow' && e.from === from && e.input === input));
      this.graph.edges.push({ from, to, input });
      this.rebuild(); this.changed();
    }
    // drop edges that point at ports that no longer exist (after editing a custom node's interface)
    pruneEdges() {
      for (const gph of [this.project, ...Object.values(this.subs)]) {
        gph.edges = gph.edges.filter((e) => {
          const f = gph.nodes.find((n) => n.id === e.from), t = gph.nodes.find((n) => n.id === e.to);
          if (!f || !t) return false;
          const spec = this.def(t.type).inputs.find((s) => s.n === e.input);
          return !!spec && compat(this.def(f.type).out, spec.t);
        });
      }
    }

    // ----- custom nodes
    groupSelected() {
      const gph = this.graph, ids = this.selectedNodes().filter((n) => !this.def(n.type).singleton).map((n) => n.id);
      if (!ids.length) return;
      const S = new Set(ids), nodes = gph.nodes.filter((n) => S.has(n.id));
      const inner = gph.edges.filter((e) => S.has(e.from) && S.has(e.to));
      const inc = gph.edges.filter((e) => !S.has(e.from) && S.has(e.to));
      const outg = gph.edges.filter((e) => S.has(e.from) && !S.has(e.to));
      let out = outg.length ? outg[0].from : null;
      if (!out) {
        const sinks = nodes.filter((n) => !inner.some((e) => e.from === n.id) && this.def(n.type).out).sort((a, b) => a.x - b.x);
        out = sinks.length ? sinks[sinks.length - 1].id : null;
      }
      const used = new Set(), uniq = (b) => { let nm = b, k = 2; while (used.has(nm)) nm = b + ' ' + k++; used.add(nm); return nm; };
      const inputs = [], portOf = new Map();
      inc.forEach((e) => {
        const n = nodes.find((x) => x.id === e.to), spec = this.def(n.type).inputs.find((s) => s.n === e.input);
        const name = uniq(e.input);
        inputs.push({ name, node: e.to, input: e.input, t: spec.t, d: n.params[e.input] ?? spec.d, o: spec.o });
        portOf.set(e, name);
      });
      const id = 's' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
      this.subs[id] = { name: 'Custom ' + (Object.keys(this.subs).length + 1), nodes: clone(nodes), edges: clone(inner), inputs, out };
      const cx = nodes.reduce((a, n) => a + n.x, 0) / nodes.length, cy = nodes.reduce((a, n) => a + n.y, 0) / nodes.length;
      gph.nodes = gph.nodes.filter((n) => !S.has(n.id));
      gph.edges = gph.edges.filter((e) => !S.has(e.from) && !S.has(e.to));
      const inst = this.newId();
      gph.nodes.push({ id: inst, type: 'sub:' + id, x: cx, y: cy, params: {} });
      inc.forEach((e) => gph.edges.push({ from: e.from, to: inst, input: portOf.get(e) }));
      outg.filter((e) => e.from === out).forEach((e) => gph.edges.push({ from: inst, to: e.to, input: e.input }));
      this.sel = new Set([inst]); this.pruneEdges(); this.rebuild(); this.changed();
    }
    togglePublish(nodeId, input) {
      const sub = this.sub; if (!sub) return;
      const k = sub.inputs.findIndex((i) => i.node === nodeId && i.input === input);
      if (k >= 0) sub.inputs.splice(k, 1);
      else {
        const n = sub.nodes.find((x) => x.id === nodeId), spec = this.def(n.type).inputs.find((s) => s.n === input);
        const names = new Set(sub.inputs.map((i) => i.name)); let nm = input, c = 2; while (names.has(nm)) nm = input + ' ' + c++;
        sub.inputs.push({ name: nm, node: nodeId, input, t: spec.t, d: n.params[input] ?? spec.d, o: spec.o });
      }
      this.pruneEdges(); this.rebuild(); this.changed();
    }
    setOut(nodeId) { const sub = this.sub; if (!sub) return; sub.out = nodeId; this.pruneEdges(); this.rebuild(); this.changed(); }
    renameSub(id, name) { if (this.subs[id]) { this.subs[id].name = name.trim() || 'Custom'; this.rebuild(); this.changed(); } }

    // ----- drawing
    rebuild() {
      [...this.world.querySelectorAll('.node')].forEach((n) => n.remove());
      const connected = new Set(this.graph.edges.map((e) => e.to + ':' + e.input));
      for (const n of this.graph.nodes) this.world.appendChild(this.buildNode(n, connected));
      if (this.el.clientWidth) this.drawWires(); else this.stale = true; // wires need real measurements; redraw when shown
      this.onSelect && this.onSelect();
    }

    buildNode(n, connected) {
      const def = this.def(n.type), sub = this.sub, custom = !!def.custom;
      const code = this.codeMode;
      const box = el('div', 'node' + (this.sel.has(n.id) ? ' sel' : '') + (custom ? ' custom' : '') + (!code && sub && sub.out === n.id ? ' isout' : '') + (code ? ' k-' + (def.cat || 'x') : '') + (def.container ? ' container' : ''));
      box.dataset.id = n.id; box.style.left = n.x + 'px'; box.style.top = n.y + 'px';
      const hd = el('div', 'hd'); hd.title = def.desc || ''; hd.appendChild(el('span', 'title', def.label));
      if (custom) {
        const open = el('span', 'open', 'Open'); open.title = 'Edit inside this custom node';
        open.addEventListener('pointerdown', (e) => e.stopPropagation()); open.onclick = () => this.enter(n.type.slice(4)); hd.appendChild(open);
      }
      if (def.container) {
        const open = el('span', 'open', 'Open'); open.title = 'Edit what is inside';
        open.addEventListener('pointerdown', (e) => e.stopPropagation()); open.onclick = () => this.enter(n.id); hd.appendChild(open);
      }
      if (def.variadic) {
        const k = def.inputs.filter((q) => q.t === 'text').length;
        const more = (d) => { const to = k + d; if (to < def.variadic.min || to > def.variadic.max) return; this.retype(n, `call:${def.variadic.fn}/${to}`); };
        const mk = (txt, title, d) => { const b = el('span', 'argbtn', txt); b.title = title; b.addEventListener('pointerdown', (e) => e.stopPropagation()); b.onclick = () => more(d); hd.appendChild(b); };
        mk('−', 'Remove the last argument', -1); mk('+', 'Add an argument', 1);
      }
      if (!code && sub && def.out) {
        const ob = el('span', 'outbtn' + (sub.out === n.id ? ' on' : ''), sub.out === n.id ? 'output' : '◦'); ob.title = 'Use this node as the output of the custom node';
        ob.addEventListener('pointerdown', (e) => e.stopPropagation()); ob.onclick = () => this.setOut(n.id); hd.appendChild(ob);
      }
      if (!def.singleton) { const x = el('span', 'x', '×'); x.addEventListener('pointerdown', (e) => e.stopPropagation()); x.onclick = () => this.removeNodes([n.id]); hd.appendChild(x); }
      if (def.out) {
        const out = el('span', 'dot out'); out.dataset.node = n.id; out.style.setProperty('--c', PORT_COLORS[def.out]);
        out.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.startWire(e, n.id); });
        hd.appendChild(out);
      }
      box.addEventListener('pointerdown', (e) => {
        if (e.shiftKey) { const s = new Set(this.sel); if (s.has(n.id)) s.delete(n.id); else s.add(n.id); this.setSel(s); }
        else if (!this.sel.has(n.id)) this.setSel([n.id]);
      });
      if (custom) hd.addEventListener('dblclick', (e) => { if (!e.target.closest('.dot,.x,.outbtn')) this.enter(n.type.slice(4)); });
      if (def.container) hd.addEventListener('dblclick', (e) => { if (!e.target.closest('.dot,.x,.open,.argbtn')) this.enter(n.id); });
      hd.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.dot,.x,.open,.outbtn,.argbtn') || e.shiftKey) return;
        const moving = this.selectedNodes(), start = moving.map((q) => ({ q, x: q.x, y: q.y })), px = e.clientX, py = e.clientY;
        this.drag(e, (ev) => {
          const dx = (ev.clientX - px) / this.scale, dy = (ev.clientY - py) / this.scale;
          start.forEach(({ q, x, y }) => { q.x = x + dx; q.y = y + dy; const b = this.world.querySelector(`.node[data-id="${q.id}"]`); if (b) { b.style.left = q.x + 'px'; b.style.top = q.y + 'px'; } });
          this.drawWires();
        }, () => this.changed());
      });
      box.appendChild(hd);

      for (const s of def.inputs) {
        if (s.t === 'svg' || s.t === 'draw' || s.t === 'note' || s.t === 'code') { box.appendChild(this.specialRow(n, s)); continue; }
        const isConn = connected.has(n.id + ':' + s.n);
        const published = !code && sub && sub.inputs && sub.inputs.some((i) => i.node === n.id && i.input === s.n);
        const row = el('div', 'row' + (isConn ? ' connected' : '') + (published ? ' published' : ''));
        const dot = el('span', 'dot in'); dot.dataset.node = n.id; dot.dataset.input = s.n; dot.style.setProperty('--c', PORT_COLORS[s.t]);
        dot.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          const edge = this.graph.edges.find((ed) => ed.to === n.id && ed.input === s.n);
          if (!edge) return;
          this.graph.edges = this.graph.edges.filter((ed) => ed !== edge); // pick up the wire
          this.rebuild(); this.startWire(e, edge.from);
        });
        const lab = el('label', '', s.label || LABELS[s.n] || s.n); row.append(dot, lab);
        if (s.t === 'text') {
          const v0 = String(n.params[s.n] ?? s.d ?? ''), multi = v0.includes('\n');
          const inp = el(multi ? 'textarea' : 'input'); if (multi) inp.rows = Math.min(8, v0.split('\n').length); else inp.type = 'text';
          inp.spellcheck = false; inp.value = v0; inp.placeholder = ' ';
          const numeric = (t) => /^-?\d+(?:\.\d+)?$/.test(t.trim());
          const mark = () => lab.classList.toggle('scrub', numeric(inp.value));
          inp.oninput = () => { n.params[s.n] = inp.value; mark(); this.changed(); };
          inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !multi && !ev.shiftKey) { ev.preventDefault(); inp.blur(); } ev.stopPropagation(); });
          row.appendChild(inp); mark(); lab.title = 'Drag left/right to change a number';
          lab.addEventListener('pointerdown', (ev) => {
            if (!numeric(inp.value)) return;
            ev.stopPropagation();
            const x0 = ev.clientX, v0n = parseFloat(inp.value), isInt = Number.isInteger(v0n), k = Math.max(0.01, Math.abs(v0n) / 100);
            this.drag(ev, (m) => {
              let v = v0n + (m.clientX - x0) * (isInt ? Math.max(1, k) : k) * (m.shiftKey ? 0.1 : 1);
              v = isInt && !m.shiftKey ? Math.round(v) : Math.round(v * 1000) / 1000;
              inp.value = v; n.params[s.n] = String(v); this.changed();
            });
          });
        } else if (s.t === 'num') {
          const inp = el('input'); inp.type = 'number'; inp.step = 'any'; inp.value = n.params[s.n] ?? s.d;
          inp.oninput = () => { n.params[s.n] = parseFloat(inp.value) || 0; this.changed(); };
          row.appendChild(inp);
          lab.classList.add('scrub'); lab.title = 'Drag left/right to change';
          lab.addEventListener('pointerdown', (ev) => {
            ev.stopPropagation();
            const x0 = ev.clientX, v0 = parseFloat(inp.value) || 0;
            const isInt = Number.isInteger(v0) && Math.abs(v0) >= 5, k = Math.max(0.01, Math.abs(v0) / 100);
            this.drag(ev, (m) => {
              let v = v0 + (m.clientX - x0) * k * (m.shiftKey ? 0.1 : 1);
              v = isInt ? Math.round(v) : Math.round(v * 1000) / 1000;
              inp.value = v; n.params[s.n] = v; this.changed();
            });
          });
        } else if (s.t === 'enum') {
          const sel = el('select');
          s.o.forEach((o) => { const op = el('option', '', o); op.value = o; sel.appendChild(op); });
          sel.value = n.params[s.n] ?? s.d;
          sel.onchange = () => { n.params[s.n] = sel.value; this.changed(); };
          row.appendChild(sel);
        }
        if (!code && sub && !isConn) {
          const pin = el('span', 'pin' + (published ? ' on' : '')); pin.title = published ? 'Shown on the custom node (click to hide)' : 'Show this value on the custom node';
          pin.addEventListener('pointerdown', (e) => e.stopPropagation()); pin.onclick = () => this.togglePublish(n.id, s.n);
          row.appendChild(pin);
        }
        box.appendChild(row);
      }
      return box;
    }

    // rows with no wire port: a file picker for SVGs, a thumbnail + Edit button for pen drawings
    specialRow(n, s) {
      const row = el('div', 'row wide');
      if (s.t === 'note' || s.t === 'code') {
        const v = String(n.params[s.n] ?? '');
        if (s.t === 'note' && !v && !this.noteOpen.has(n.id)) { // an empty note is just a small link
          const a = el('span', 'addnote', '+ comment'); a.title = 'Add a comment to this statement';
          a.onclick = () => { this.noteOpen.add(n.id); this.rebuild(); const t = this.world.querySelector(`.node[data-id="${n.id}"] textarea.note`); if (t) t.focus(); };
          row.appendChild(a); return row;
        }
        const t = el('textarea', s.t); t.spellcheck = false; t.value = v; t.rows = Math.max(s.t === 'code' ? 3 : 1, Math.min(10, v.split('\n').length));
        t.placeholder = s.t === 'code' ? 'code' : '// comment';
        t.oninput = () => { n.params[s.n] = t.value; this.changed(); };
        t.addEventListener('keydown', (ev) => { if (ev.key === 'Tab' && s.t === 'code') { ev.preventDefault(); t.setRangeText('  ', t.selectionStart, t.selectionEnd, 'end'); t.oninput(); } ev.stopPropagation(); });
        t.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        row.appendChild(t); return row;
      }
      if (s.t === 'svg') {
        const b = el('button', 'wbtn', n.params.svgName ? '📄 ' + n.params.svgName : 'Choose SVG file…'); b.title = 'Pick an .svg exported from Illustrator, Figma, Inkscape…';
        const f = document.createElement('input'); f.type = 'file'; f.accept = '.svg,image/svg+xml'; f.hidden = true;
        f.onchange = async () => { const file = f.files[0]; if (!file) return; n.params.svg = await file.text(); n.params.svgName = file.name; this.rebuild(); this.changed(); };
        b.onclick = () => f.click(); row.append(b, f);
      } else {
        const p = n.params.path, box = el('div', 'thumb');
        if (p && p.pts && p.pts.length > 1) {
          const cmds = g.Daub.penCmds(p), xs = [], ys = [];
          p.pts.forEach((q) => { xs.push(q.x, q.x + (q.ox || 0), q.x + (q.ix || 0)); ys.push(q.y, q.y + (q.oy || 0), q.y + (q.iy || 0)); });
          const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(10, Math.max(...xs) - x0), h = Math.max(10, Math.max(...ys) - y0), pad = Math.max(w, h) * 0.08;
          box.innerHTML = `<svg viewBox="${x0 - pad} ${y0 - pad} ${w + pad * 2} ${h + pad * 2}" preserveAspectRatio="xMidYMid meet"><path d="${g.Daub.cmdsToD(cmds)}" fill="${p.closed ? '#e8483a22' : 'none'}" stroke="#444" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
        } else box.textContent = 'Empty';
        const b = el('button', 'wbtn', p && p.pts && p.pts.length ? 'Edit shape…' : 'Draw shape…'); b.onclick = () => this.onEditDraw && this.onEditDraw(n.id);
        row.append(box, b);
      }
      return row;
    }
    addSvg(text, name, wx, wy) {
      const id = this.newId();
      this.graph.nodes.push({ id, type: 'svg', x: wx ?? (-this.pan.x + 60) / this.scale, y: wy ?? (-this.pan.y + 60) / this.scale, params: { svg: text, svgName: name } });
      this.sel = new Set([id]); this.rebuild(); this.changed();
    }

    startWire(e, fromId) {
      const fromNode = this.graph.nodes.find((n) => n.id === fromId);
      const path = document.createElementNS(SVGNS, 'path'); path.setAttribute('stroke', PORT_COLORS[this.def(fromNode.type).out]); path.style.strokeDasharray = '6 4';
      this.svg.appendChild(path);
      const a = this.portPos(this.world.querySelector(`.dot.out[data-node="${fromId}"]`));
      const wr = () => this.world.getBoundingClientRect();
      this.drag(e, (ev) => { path.setAttribute('d', this.pathD(a, { x: (ev.clientX - wr().left) / this.scale, y: (ev.clientY - wr().top) / this.scale })); }, (ev) => {
        path.remove();
        const t = document.elementFromPoint(ev.clientX, ev.clientY);
        const dot = t && t.closest && t.closest('.dot.in');
        if (dot) this.connect(fromId, dot.dataset.node, dot.dataset.input); else { this.rebuild(); this.changed(); }
      });
      path.setAttribute('d', this.pathD(a, a));
    }
    portPos(dot) {
      const r = dot.getBoundingClientRect(), w = this.world.getBoundingClientRect();
      return { x: (r.left + r.width / 2 - w.left) / this.scale, y: (r.top + r.height / 2 - w.top) / this.scale };
    }
    pathD(a, b) { const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; }
    drawWires() {
      this.svg.innerHTML = '';
      for (const e of this.graph.edges) {
        const o = this.world.querySelector(`.dot.out[data-node="${e.from}"]`);
        const i = this.world.querySelector(`.dot.in[data-node="${e.to}"][data-input="${e.input}"]`);
        if (!o || !i) continue;
        const path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('d', this.pathD(this.portPos(o), this.portPos(i)));
        this.svg.appendChild(path);
      }
    }
  }

  g.Daub.Editor = Editor;
})(window);
