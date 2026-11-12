/* Daub app: tabs, render loop, examples, undo/redo, import/export, autosave. */
(function () {
  'use strict';
  const { NODES, Editor, CodeEditor, codegraph: cg, examples, validProject } = window.Daub;
  const $ = (s) => document.querySelector(s);
  const W = 600, H = 600, dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = $('#cv'); cv.width = W * dpr; cv.height = H * dpr;
  const c = cv.getContext('2d');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const DEFAULT_CODE = examples.code[0].code;

  let codeView = 'text'; // 'text' | 'nodes': how the Code tab shows the sketch
  let pendingCodeGraph = null; // the saved layout of the code's nodes, used if it still matches the code
  let acc = 0, mode = 'nodes', playing = true, time = 0, last = performance.now(), sketch = null, lastScene = null;
  let graph = clone(examples.nodes[0].graph);
  $('#code').value = DEFAULT_CODE;
  try { // this app used to be called Loom: carry over a sketch (and the welcome-card flag) saved under the old names
    if (!localStorage.getItem('daub.v1') && localStorage.getItem('loom.v1')) localStorage.setItem('daub.v1', localStorage.getItem('loom.v1'));
    if (!localStorage.getItem('daub.seen') && localStorage.getItem('loom.seen')) localStorage.setItem('daub.seen', '1');
  } catch (e) { /* ignore */ }
  // ---- projects, kept in this browser: an index, the current id, and one snapshot per project
  const PK = 'daub.projects', CK = 'daub.cur', SK = (id) => 'daub.p.' + id;
  const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const newPid = () => 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  let projects = lsGet(PK) || [], currentId = null, startView = null;
  try {
    let saved = null;
    if (projects.length) {
      const ent = projects.find((q) => q.id === localStorage.getItem(CK)) || projects[0];
      currentId = ent.id; saved = lsGet(SK(currentId));
    } else { // first run with projects: the one sketch this browser had becomes the first project
      saved = lsGet('daub.v1'); currentId = newPid(); projects = [{ id: currentId, name: saved ? 'My sketch' : 'Untitled', updated: Date.now() }];
    }
    if (saved && saved.graph && validProject(saved.graph)) { graph = saved.graph; $('#code').value = saved.code || DEFAULT_CODE; pendingCodeGraph = saved.codeGraph || null; startView = saved.view || null; }
  } catch (e) { /* ignore */ }
  if (!currentId) { currentId = newPid(); projects = [{ id: currentId, name: 'Untitled', updated: Date.now() }]; }

  const status = (msg, err) => { const s = $('#status'); s.textContent = err ? '⚠ ' + msg : msg; s.classList.toggle('err', !!err); };
  let toastTimer;
  const toast = (msg, ms = 2600) => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); if (ms) toastTimer = setTimeout(() => { t.hidden = true; }, ms); };
  let saveTimer, dirty = false;
  const snapshot = () => ({ version: 3, graph: editor.project, code: $('#code').value, codeGraph: savedCodeGraph(), view: { mode, codeView } });
  function saveNow() {
    clearTimeout(saveTimer);
    const ent = projects.find((q) => q.id === currentId); if (!ent) return;
    if (!lsSet(SK(currentId), snapshot())) { toast('Could not save: this browser\u2019s storage is full. Use File \u2192 Save to keep a copy.', 6000); return; }
    ent.updated = Date.now(); lsSet(PK, projects);
    try { localStorage.setItem(CK, currentId); localStorage.removeItem('daub.v1'); } catch (e) { /* ignore */ }
    dirty = false; renderProjectBar();
  }
  const autosave = () => { dirty = true; renderProjectBar(); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400); };
  window.addEventListener('pagehide', () => { if (dirty) saveNow(); });

  // ---- undo / redo (snapshots of the node graph)
  let hist = [], hi = 0, histTimer;
  const flush = () => { clearTimeout(histTimer); const s = JSON.stringify(editor.project); if (s !== hist[hi]) { hist.length = hi + 1; hist.push(s); hi++; if (hist.length > 100) { hist.shift(); hi--; } } };
  const commit = () => { clearTimeout(histTimer); histTimer = setTimeout(flush, 300); };
  const restore = (k) => { if (activeEd() === cgEditor && cgEditor) return crestore(k); flush(); const t = hi + k; if (t < 0 || t >= hist.length) return; hi = t; editor.setProject(JSON.parse(hist[hi]), false, true); window.Daub.design.refresh(); autosave(); if (!playing || mode === 'nodes') renderNodes(); };
  // replace the whole project (examples, Open…)
  const loadProject = (p) => { editor.setProject(p); resetHistory(); window.Daub.design.refresh(); autosave(); };
  const resetHistory = () => { hist = [JSON.stringify(editor.project)]; hi = 0; };

  const editor = new Editor($('#graph'), graph, () => { autosave(); commit(); if (!playing) renderNodes(); });
  resetHistory();
  window.Daub.design.init({
    project: () => editor.project, changed: (soft) => { autosave(); if (soft) commit(); else flush(); }, status: toast,
    isPlaying: () => playing, setPlaying: (v) => { playing = v; },
  });

  // ---- add-node popup (double-click or right-click on the graph)
  const addBox = $('#add'), addq = $('#addq'), addlist = $('#addlist');
  let addPos = { x: 0, y: 0 }, sel = 0, matches = [], addEd = editor;
  const baseEntries = Object.entries(NODES).filter(([, d]) => !d.singleton).map(([type, d]) => ({ type, label: d.label, cat: d.cat, desc: d.desc }));
  let entries = baseEntries;
  const refreshEntries = () => {
    const custom = Object.entries(editor.subs).filter(([id]) => !editor.stack.includes(id)).map(([id, s]) => ({ type: 'sub:' + id, label: s.name, cat: 'Custom', desc: 'Your custom node.' }));
    entries = addEd === cgEditor ? cg.entries() : [...custom, ...baseEntries];
  };
  function fillList() {
    const q = addq.value.trim().toLowerCase();
    matches = entries.filter((e) => !q || (e.label + ' ' + e.cat + ' ' + e.desc).toLowerCase().includes(q));
    sel = Math.min(sel, Math.max(0, matches.length - 1));
    addlist.innerHTML = '';
    matches.forEach((m, k) => {
      const d = document.createElement('div'); d.className = k === sel ? 'sel' : '';
      d.innerHTML = `<b>${m.label}</b><small>${m.desc}</small>`;
      d.onmousedown = (e) => { e.preventDefault(); pick(m); };
      addlist.appendChild(d);
    });
    const s = addlist.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
  }
  function pick(m) { addBox.hidden = true; addEd.addNode(m.type, addPos.x, addPos.y); }
  function openAdd(e, ed = editor) {
    e.preventDefault(); addEd = ed;
    const w = ed.world.getBoundingClientRect();
    addPos = { x: (e.clientX - w.left) / ed.scale, y: (e.clientY - w.top) / ed.scale };
    addBox.style.left = Math.min(e.clientX, innerWidth - 280) + 'px'; addBox.style.top = Math.min(e.clientY, innerHeight - 380) + 'px';
    refreshEntries(); addq.value = ''; sel = 0; fillList(); addBox.hidden = false; addq.focus();
  }
  $('#graph').addEventListener('dblclick', (e) => { if (e.target === $('#graph') || e.target === editor.world) openAdd(e); });
  $('#graph').addEventListener('contextmenu', (e) => { if (e.target === $('#graph') || e.target === editor.world) openAdd(e); });
  $('#cgraph').addEventListener('dblclick', (e) => { if (e.target === $('#cgraph') || e.target === cgEditor.world) openAdd(e, cgEditor); });
  $('#cgraph').addEventListener('contextmenu', (e) => { if (e.target === $('#cgraph') || e.target === cgEditor.world) openAdd(e, cgEditor); });
  addq.addEventListener('input', () => { sel = 0; fillList(); });
  addq.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') addBox.hidden = true;
    else if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, matches.length - 1); fillList(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); fillList(); e.preventDefault(); }
    else if (e.key === 'Enter' && matches[sel]) pick(matches[sel]);
  });
  addq.addEventListener('blur', () => { addBox.hidden = true; });


  // ---- Code as nodes: the Code tab can show the same program as a graph of statements (see codegraph.js).
  // The text is the file; the graph is another view of it. Edit either one and the other follows when you switch.
  let cgText = null, codeImage = null, runTimer;
  const cMsg = $('#cMsg');
  const sayCode = (msg, err) => { cMsg.textContent = msg || ''; cMsg.className = err ? 'err' : ''; };
  const countMsg = () => { const st = cg.stats(cgEditor.project); return `${st.nodes} node${st.nodes === 1 ? '' : 's'}${st.raw ? ` · ${st.raw} kept as raw code` : ''}`; };
  const cgEditor = new CodeEditor($('#cgraph'), cg.compile(''), () => { cgChanged(); ccommit(); });
  const activeEd = () => (mode === 'nodes' ? editor : mode === 'code' && codeView === 'nodes' ? cgEditor : null);
  const savedCodeGraph = () => (cgText !== null && cgText === $('#code').value ? cgEditor.project : undefined);
  let chist = [], chi = 0, chTimer;
  const resetCgHistory = () => { chist = [JSON.stringify(cgEditor.project)]; chi = 0; };
  const cflush = () => { clearTimeout(chTimer); const s = JSON.stringify(cgEditor.project); if (s !== chist[chi]) { chist.length = chi + 1; chist.push(s); chi++; if (chist.length > 100) { chist.shift(); chi--; } } };
  const ccommit = () => { clearTimeout(chTimer); chTimer = setTimeout(cflush, 300); };
  function crestore(k) { cflush(); const t = chi + k; if (t < 0 || t >= chist.length) return; chi = t; cgEditor.setProject(JSON.parse(chist[chi]), false, true); cgChanged(); }
  // a node changed: write the code again and run it
  function cgChanged() {
    try {
      const text = cg.generate(cgEditor.project);
      $('#code').value = text; cgText = text; cgEditor.hsb = /colorMode\s*\(\s*HSB/.test(text); sayCode(countMsg()); autosave();
      clearTimeout(runTimer); runTimer = setTimeout(() => { if (mode === 'code') runSketch(); }, 120);
    } catch (e) { sayCode(e.message, true); if (e.nodeId) cgEditor.setSel([e.nodeId]); }
  }
  // the text changed: make the nodes from it (keeping a saved layout when it still matches)
  function loadCodeGraph(text) {
    try {
      let project = null;
      if (pendingCodeGraph) { try { if (cg.generate(pendingCodeGraph) === text) project = pendingCodeGraph; } catch (e) { /* use the code */ } pendingCodeGraph = null; }
      cgEditor.hsb = /colorMode\s*\(\s*HSB/.test(text);
      cgEditor.setProject(project || cg.compile(text)); cgText = text; resetCgHistory();
      return true;
    } catch (e) { sayCode((e.line ? `Line ${e.line}: ` : '') + e.message, true); toast('Fix the code first: ' + (e.line ? `line ${e.line}: ` : '') + e.message, 4000); return false; }
  }
  function setCodeView(v) {
    let failed = false;
    if (v === 'nodes' && cgText !== $('#code').value && !loadCodeGraph($('#code').value)) { v = 'text'; failed = true; }
    codeView = v; document.body.dataset.cview = v;
    $('#cvText').classList.toggle('on', v === 'text'); $('#cvNodes').classList.toggle('on', v === 'nodes');
    $('#code').hidden = v === 'nodes'; $('#codeNodes').hidden = v === 'text';
    if (v === 'nodes') { cgEditor.refresh(); sayCode(countMsg()); } else if (!failed) sayCode('');
    renderProjectBar();
  }
  cgEditor.onWireDrop = (from, ev) => { cgEditor.setSel([from]); openAdd(ev, cgEditor); }; // drop a wire on empty space to add a node there
  const cBar = $('#cBar');
  cgEditor.onSelect = () => {
    const ids = cgEditor.selectedNodes().filter((n) => n.type !== 'start'); cBar.innerHTML = '';
    const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; cBar.appendChild(b); };
    if (ids.length) { add('Duplicate (Ctrl+D)', () => cgEditor.duplicateSelected()); add('Delete', () => cgEditor.deleteSelected()); }
    cBar.hidden = !cBar.children.length;
  };
  $('#cvText').onclick = () => setCodeView('text'); $('#cvNodes').onclick = () => setCodeView('nodes');
  $('#toCode').onclick = () => { setMode('code'); setCodeView('nodes'); };
  const cCrumbs = $('#cCrumbs');
  cgEditor.onNav = (stack) => {
    cCrumbs.hidden = !stack.length; cCrumbs.innerHTML = '';
    if (!stack.length) return;
    const mk = (label, depth) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { while (cgEditor.stack.length > depth) cgEditor.up(); }; return b; };
    const sep = () => { const i = document.createElement('i'); i.textContent = '›'; return i; };
    cCrumbs.appendChild(mk('Program', 0));
    stack.forEach((id, k) => {
      cCrumbs.appendChild(sep());
      if (k === stack.length - 1) { const b = document.createElement('b'); b.textContent = cgEditor.titleOf(id); cCrumbs.appendChild(b); } else cCrumbs.appendChild(mk(cgEditor.titleOf(id), k + 1));
    });
  };
  // a picture for loadImage(): chosen here, or dropped on the preview
  const useImage = (file) => {
    if (!file || !/^image\//.test(file.type)) return toast('That file is not a picture.');
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, 2000 / Math.max(im.width, im.height)), cvs = document.createElement('canvas');
      cvs.width = Math.max(1, Math.round(im.width * k)); cvs.height = Math.max(1, Math.round(im.height * k));
      cvs.getContext('2d').drawImage(im, 0, 0, cvs.width, cvs.height); URL.revokeObjectURL(url);
      codeImage = cvs; $('#clearImg').hidden = false;
      toast(`loadImage() now gives “${file.name}”. It is not saved with the sketch.`, 3600);
      if (mode === 'code') { playing = true; runSketch(); }
    };
    im.onerror = () => { URL.revokeObjectURL(url); toast('Could not open that picture.'); };
    im.src = url;
  };
  $('#loadImg').onclick = () => $('#imgFile').click();
  $('#imgFile').onchange = (e) => { useImage(e.target.files[0]); e.target.value = ''; };
  $('#clearImg').onclick = () => { codeImage = null; $('#clearImg').hidden = true; if (mode === 'code') runSketch(); };
  $('#preview').addEventListener('dragover', (e) => { if (mode === 'code') e.preventDefault(); });
  $('#preview').addEventListener('drop', (e) => { if (mode !== 'code') return; const f = [...e.dataTransfer.files].find((x) => /^image\//.test(x.type)); if (f) { e.preventDefault(); useImage(f); } });

  // ---- the project bar (name, saved dot, where you are) and the Projects menu
  const projName = () => { const q = projects.find((x) => x.id === currentId); return q ? q.name : ''; };
  function renderProjectBar() {
    const nm = $('#projName'), tabs = { design: 'Design', nodes: 'Nodes', script: 'Script', code: 'Code' };
    if (document.activeElement !== nm) nm.value = projName();
    $('#projDot').className = dirty ? 'dirty' : ''; $('#projDot').title = dirty ? 'Saving…' : 'Saved in this browser';
    $('#projView').textContent = mode === 'code' ? `Code · ${codeView === 'nodes' ? 'Nodes' : 'Text'}` : tabs[mode] || '';
    document.title = `${projName() || 'Untitled'} – Daub`;
  }
  const BLANK = () => ({ graph: { nodes: [{ id: 'out', type: 'output', x: 0, y: 0, params: {} }], edges: [] }, code: 'function setup() {\n}\n\nfunction draw() {\n  background(20);\n}\n', view: { mode: 'nodes', codeView: 'text' } });
  // put a snapshot on screen (quiet: stay on the current tab)
  function applySnapshot(d, quiet) {
    const ok = d && d.graph && validProject(d.graph), snap = ok ? d : BLANK();
    loadProject(clone(snap.graph));
    $('#code').value = snap.code || DEFAULT_CODE; cgText = null; pendingCodeGraph = snap.codeGraph || null;
    const v = snap.view || {};
    codeView = v.codeView === 'nodes' ? 'nodes' : 'text'; if (codeView === 'text') setCodeView('text');
    if (quiet) return;
    playing = true;
    setMode(v.mode || (snap.graph.design && snap.graph.design.shapes && snap.graph.design.shapes.length && snap.graph.nodes.length <= 1 ? 'design' : 'nodes'));
  }
  function startProject(name, snap, quiet = true) { // save this one, make a new one
    saveNow();
    currentId = newPid(); projects.push({ id: currentId, name: name || 'Untitled', updated: Date.now() });
    applySnapshot(snap, quiet); saveNow();
  }
  const newProject = (name, snap) => startProject(name || 'Untitled', snap, false);
  function openProject(id) {
    if (id === currentId) return;
    saveNow(); currentId = id; applySnapshot(lsGet(SK(id)), false); saveNow();
  }
  function deleteProject() {
    const gone = currentId;
    try { localStorage.removeItem(SK(gone)); } catch (e) { /* ignore */ }
    projects = projects.filter((q) => q.id !== gone);
    if (!projects.length) { currentId = newPid(); projects = [{ id: currentId, name: 'Untitled', updated: Date.now() }]; applySnapshot(null, false); }
    else { const next = [...projects].sort((a, b) => b.updated - a.updated)[0]; currentId = next.id; applySnapshot(lsGet(SK(next.id)), false); }
    lsSet(PK, projects); saveNow(); toast('Project deleted');
  }
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString(); };
  function renderProjectList() {
    const list = $('#projList'); list.innerHTML = '';
    const add = (label, fn, cls) => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.onclick = fn; list.appendChild(b); return b; };
    add('＋ New project', () => { newProject(); const n = $('#projName'); n.focus(); n.select(); });
    add('Duplicate this project', () => { saveNow(); startProject(projName() + ' copy', clone(snapshot()), false); toast('Duplicated'); });
    const del = add('Delete this project…', (e) => {
      e.stopPropagation();
      if (del.dataset.sure) { del.dataset.sure = ''; document.querySelector('#projMenu').open = false; deleteProject(); return; }
      del.dataset.sure = '1'; del.textContent = `Click again to delete “${projName()}”`; del.classList.add('warn');
    }, '');
    list.appendChild(document.createElement('hr'));
    const h = document.createElement('h5'); h.textContent = 'Your projects'; list.appendChild(h);
    [...projects].sort((a, b) => b.updated - a.updated).forEach((q) => {
      const b = add(q.name, () => openProject(q.id), q.id === currentId ? 'cur' : '');
      const sm = document.createElement('small'); sm.textContent = (q.id === currentId ? 'open now · ' : '') + ago(q.updated); b.appendChild(sm);
    });
  }
  $('#projMenu').addEventListener('toggle', () => { if ($('#projMenu').open) { saveNow(); renderProjectList(); } });
  const pn = $('#projName');
  pn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') pn.blur(); else if (e.key === 'Escape') { pn.value = projName(); pn.blur(); } });
  pn.addEventListener('focus', () => pn.select());
  pn.addEventListener('blur', () => { const q = projects.find((x) => x.id === currentId); if (q) { q.name = pn.value.trim() || 'Untitled'; lsSet(PK, projects); } renderProjectBar(); });

  // ---- rendering
  function renderNodes() {
    try {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sid = editor.stack.length ? editor.stack[editor.stack.length - 1] : null;
      lastScene = window.Daub.evaluate(editor.project, { time }, sid);
      window.Daub.drawScene(c, W, H, lastScene);
      status(lastScene.preview ? `Previewing “${editor.sub.name}” · ${lastScene.geo.length} shapes`
        : lastScene.notGeo ? 'This custom node outputs numbers or points, so the whole sketch is shown.' : `${lastScene.geo.length} shapes`);
    } catch (e) { status(e.message, true); }
  }
  function runSketch() {
    try {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      sketch = window.Daub.createSketch(c, W, H, dpr, $('#code').value, { image: codeImage });
      sketch.setup(); sketch.draw();
      status('Running');
    } catch (e) { sketch = null; status(e.message, true); }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (mode === 'design') { // the design editor draws itself; we mirror its scene onto the export canvas
      const sc = window.Daub.design.frame(dt, playing);
      if (sc) { c.setTransform(dpr, 0, 0, dpr, 0, 0); window.Daub.drawScene(c, W, H, sc); lastScene = sc; }
      return;
    }
    if (!playing) return;
    time += dt;
    if (mode === 'nodes' || mode === 'script') renderNodes();
    else if (sketch && sketch.hasDraw) {
      acc += dt;
      const again = sketch.takeRedraw();
      if (!again && (!sketch.looping || acc < 1 / sketch.fps - 0.002)) return;
      acc = 0;
      try { sketch.draw(); } catch (e) { sketch = null; status(e.message, true); }
    }
  }

  // ---- Script tab: the text language. Text <-> node graph.
  const sc = window.Daub.script, sEl = $('#script'), sMsg = $('#sMsg');
  let lastSig = '', pendingTimer = null, pending = false;
  const strip = (nodes) => nodes.map((n) => [n.id, n.type, n.params]); // positions don't count as changes
  const sigOf = (p) => JSON.stringify([strip(p.nodes), p.edges, Object.entries(p.subs || {}).map(([id, s]) => [id, s.name, strip(s.nodes), s.edges, s.inputs, s.out])]);
  const sayScript = (msg, err) => { sMsg.textContent = msg; sMsg.className = err ? 'err' : 'ok'; sMsg.dataset.line = err && err.line ? err.line : ''; };
  function generateScript() {
    try { sEl.value = sc.decompile(editor.project); lastSig = sigOf(editor.project); sayScript('This is your node graph as text. Edit it and the graph updates.'); }
    catch (e) { sEl.value = ''; sayScript(e.message, { line: 0 }); }
  }
  function applyScript() {
    pending = false; clearTimeout(pendingTimer);
    try {
      const res = sc.compile(sEl.value, editor.project), p = editor.project;
      p.nodes = res.nodes; p.edges = res.edges; p.subs = res.subs;
      editor.setProject(p, true); flush(); autosave(); lastSig = sigOf(p);
      const custom = Object.keys(p.subs).length;
      sayScript(`OK · ${p.nodes.length} node${p.nodes.length === 1 ? '' : 's'}${custom ? `, ${custom} custom node${custom === 1 ? '' : 's'}` : ''}`);
      renderNodes();
    } catch (e) { sayScript((e.line ? `Line ${e.line}: ` : '') + e.message, e); }
  }
  const queueScript = () => { pending = true; clearTimeout(pendingTimer); pendingTimer = setTimeout(applyScript, 450); };
  sEl.addEventListener('input', queueScript);
  sEl.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); sEl.setRangeText('  ', sEl.selectionStart, sEl.selectionEnd, 'end'); queueScript(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); applyScript(); }
  });
  sMsg.onclick = () => { // jump to the line with the error
    const ln = +sMsg.dataset.line; if (!ln) return; const lines = sEl.value.split('\n'); let off = 0; for (let i = 0; i < ln - 1; i++) off += lines[i].length + 1;
    sEl.focus(); sEl.setSelectionRange(off, off + (lines[ln - 1] || '').length);
  };
  $('#sTidy').onclick = () => {
    try { const r = sc.compile(sEl.value, editor.project); sEl.value = sc.decompile({ nodes: r.nodes, edges: r.edges, subs: r.subs }); applyScript(); }
    catch (e) { sayScript((e.line ? `Line ${e.line}: ` : '') + e.message, e); }
  };
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function buildRef() {
    const q = $('#sRefQ').value.trim().toLowerCase(), list = $('#sRefList'); list.innerHTML = '';
    sc.reference(editor.subs).filter((r) => !q || `${r.name} ${r.desc} ${r.cat}`.toLowerCase().includes(q)).forEach((r) => {
      const d = document.createElement('div'); d.className = 'rrow'; d.innerHTML = `<code>${esc(r.sig)}</code><small>${esc(r.desc)}</small>`;
      d.onclick = () => { const s = sEl.selectionStart; sEl.setRangeText(r.name + '()', s, sEl.selectionEnd, 'end'); const at = s + r.name.length + 1; sEl.focus(); sEl.setSelectionRange(at, at); queueScript(); };
      list.appendChild(d);
    });
  }
  $('#sRefQ').addEventListener('input', buildRef);
  function enterScript() { if (sigOf(editor.project) !== lastSig) generateScript(); buildRef(); }
  const flushScript = () => { if (pending) applyScript(); };

  // ---- mode / examples
  function setMode(m) {
    if (mode === 'script' && m !== 'script') flushScript();
    mode = m; document.body.dataset.mode = m;
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === m));
    $('#nodesView').hidden = m !== 'nodes'; $('#codeView').hidden = m !== 'code'; $('#designView').hidden = m !== 'design'; $('#scriptView').hidden = m !== 'script';
    if (m === 'script') enterScript();
    document.querySelector('main').classList.toggle('wide', m === 'design');
    renderProjectBar();
    if (m === 'nodes') editor.refresh(); // the graph may have changed while this tab was hidden (measure after the layout settles)
    if (m === 'design') playing = false; // opens paused so editing is steady; the ▶ button plays
    if (m === 'code') { if (codeView === 'nodes') setCodeView('nodes'); runSketch(); } else if (m === 'design') { window.Daub.design.show(); window.Daub.design.syncPlay(); } else renderNodes();
  }
  document.querySelectorAll('.tabs button').forEach((b) => { b.onclick = () => setMode(b.dataset.tab); });
  const exList = $('#exList');
  const heading = (t) => { const h = document.createElement('h5'); h.textContent = t; exList.appendChild(h); };
  const item = (t, fn) => { const b = document.createElement('button'); b.textContent = t; b.onclick = fn; exList.appendChild(b); };
  heading('Design sketches');
  (examples.designs || []).forEach((ex) => item(ex.name, () => { startProject(ex.name); const p = clone(ex.graph); loadProject(p); setMode('design'); playing = true; window.Daub.design.syncPlay(); }));
  heading('Node sketches');
  examples.nodes.forEach((ex) => item(ex.name, () => { startProject(ex.name); loadProject(clone(ex.graph)); setMode('nodes'); playing = true; }));
  heading('Script sketches');
  (examples.scripts || []).forEach((ex) => item(ex.name, () => { startProject(ex.name); sEl.value = ex.text; applyScript(); playing = true; setMode('script'); }));
  let lastCat = null;
  examples.code.forEach((ex) => {
    if (ex.cat !== lastCat) { heading('Code · ' + (ex.cat || 'Sketches')); lastCat = ex.cat; }
    item(ex.name, () => { startProject(ex.name); $('#code').value = ex.code; cgText = null; pendingCodeGraph = null; autosave(); playing = true; setMode('code'); });
  });

  // close menus when clicking elsewhere or choosing something
  document.addEventListener('click', (e) => document.querySelectorAll('details.menu[open]').forEach((d) => { if (!d.contains(e.target) || e.target.closest('.pop button')) d.open = false; }));

  // ---- controls
  const run = () => { playing = true; if (mode === 'code') runSketch(); window.Daub.design.syncPlay(); };
  $('#run').onclick = run; $('#stop').onclick = () => { playing = false; window.Daub.design.syncPlay(); };
  $('#fit').onclick = () => (mode === 'design' ? window.Daub.design.fit() : (activeEd() || editor).fit());
  $('#undo').onclick = () => restore(-1); $('#redo').onclick = () => restore(1);
  $('#code').addEventListener('input', autosave);
  $('#code').addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); const t = e.target; t.setRangeText('  ', t.selectionStart, t.selectionEnd, 'end'); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); }
  });
  // input for code sketches: mouse and keyboard on the canvas call mousePressed(), keyPressed() and friends
  const cvPos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  const fireSketch = (name) => { if (!sketch || mode !== 'code') return; try { sketch.fire(name); } catch (err) { sketch = null; status(err.message, true); } };
  cv.tabIndex = 0;
  cv.addEventListener('pointermove', (e) => { if (!sketch) return; sketch.setMouse(...cvPos(e), e.buttons, e.button); fireSketch(e.buttons ? 'mouseDragged' : 'mouseMoved'); });
  cv.addEventListener('pointerdown', (e) => { if (!sketch) return; cv.focus(); sketch.setMouse(...cvPos(e), 1, e.button); fireSketch('mousePressed'); });
  cv.addEventListener('pointerup', (e) => { if (!sketch) return; sketch.setMouse(...cvPos(e), 0, e.button); fireSketch('mouseReleased'); fireSketch('mouseClicked'); });
  cv.addEventListener('keydown', (e) => { if (!sketch || mode !== 'code' || e.ctrlKey || e.metaKey) return; e.preventDefault(); sketch.setKey(e.key, e.keyCode, true); fireSketch('keyPressed'); if (e.key.length === 1) fireSketch('keyTyped'); });
  cv.addEventListener('keyup', (e) => { if (!sketch || mode !== 'code') return; sketch.setKey(e.key, e.keyCode, false); fireSketch('keyReleased'); });
  document.addEventListener('keydown', (e) => {
    if (!$('#pen').hidden) return; // the pen editor handles its own keys
    if (mode === 'design' && window.Daub.design.key(e)) return;
    if (mode === 'code' && document.activeElement === cv && !(e.ctrlKey || e.metaKey)) return; // the sketch owns the keyboard while its canvas has focus
    const t = e.target, typing = t.matches && t.matches('input:not([type=color]):not([type=checkbox]),textarea,select,[contenteditable="true"]');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !(t.matches && t.matches('textarea,input[type=text]'))) { e.preventDefault(); restore(e.shiftKey ? 1 : -1); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); restore(1); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g' && mode === 'nodes') { e.preventDefault(); editor.groupSelected(); }
    else if (typing) return;
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && activeEd() === cgEditor) { e.preventDefault(); cgEditor.duplicateSelected(); }
    else if (e.key === 'Escape' && activeEd() && activeEd().stack.length) activeEd().up();
    else if (e.key === 'Enter' && activeEd()) { const ae = activeEd(), n = ae.selectedNodes()[0]; if (n) { if (ae === cgEditor) { if (ae.def(n.type).container) ae.enter(n.id); } else if (n.type.startsWith('sub:')) ae.enter(n.type.slice(4)); } }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && activeEd()) { e.preventDefault(); activeEd().deleteSelected(); }
    else if (e.key.toLowerCase() === 'f' && activeEd()) activeEd().fit();
    else if (e.key.toLowerCase() === 'f' && mode === 'design') window.Daub.design.fit();
    else if (e.key === ' ') { e.preventDefault(); if (playing) { playing = false; window.Daub.design.syncPlay(); } else run(); }
  });

  // ---- pen drawing and SVG import
  editor.onEditDraw = (id) => {
    const n = editor.graph.nodes.find((x) => x.id === id); if (!n) return;
    window.Daub.drawEditor.open(n.params.path, (res) => { if (res) { n.params.path = res; editor.rebuild(); editor.changed(); } });
  };
  const importSvgFile = async (file, pos) => {
    if (!file) return;
    try {
      const text = await file.text();
      if (!/<svg[\s>]/i.test(text)) throw new Error('That file is not an SVG.');
      setMode('nodes'); editor.addSvg(text, file.name, pos && pos.x, pos && pos.y);
    } catch (err) { status(err.message, true); }
  };
  $('#importSvg').onclick = () => $('#svgFile').click();
  $('#svgFile').onchange = (e) => { importSvgFile(e.target.files[0]); e.target.value = ''; };
  const gEl = $('#graph');
  gEl.addEventListener('dragover', (e) => { e.preventDefault(); gEl.classList.add('drop'); });
  gEl.addEventListener('dragleave', () => gEl.classList.remove('drop'));
  gEl.addEventListener('drop', (e) => {
    e.preventDefault(); gEl.classList.remove('drop');
    const f = [...e.dataTransfer.files].find((x) => /\.svg$/i.test(x.name) || x.type === 'image/svg+xml'); if (!f) return;
    const w = editor.world.getBoundingClientRect(); importSvgFile(f, { x: (e.clientX - w.left) / editor.scale, y: (e.clientY - w.top) / editor.scale });
  });

  // ---- breadcrumbs (inside a custom node) and selection action bar
  const crumbs = $('#crumbs'), bar = $('#bar');
  editor.onNav = (stack) => {
    crumbs.hidden = !stack.length; crumbs.innerHTML = '';
    if (!stack.length) { renderNodes(); return; }
    const back = document.createElement('button'); back.textContent = '← Back to sketch'; back.onclick = () => editor.up(); crumbs.appendChild(back);
    const id = stack[stack.length - 1], name = document.createElement('span');
    name.className = 'crumbname'; name.contentEditable = 'true'; name.spellcheck = false; name.textContent = editor.subs[id].name; name.title = 'Click to rename';
    name.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } e.stopPropagation(); };
    name.onblur = () => { editor.renameSub(id, name.textContent); name.textContent = editor.subs[id].name; };
    crumbs.appendChild(name);
    const tip = document.createElement('small'); tip.textContent = 'Click ◦ on a row to show it on the custom node · click ◦ in a header to set its output'; crumbs.appendChild(tip);
    renderNodes();
  };
  editor.onSelect = () => {
    const sel = editor.selectedNodes(), groupable = sel.filter((n) => !editor.def(n.type).singleton);
    bar.innerHTML = '';
    const add = (label, fn, cls) => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.onclick = fn; bar.appendChild(b); };
    if (sel.length === 1 && sel[0].type.startsWith('sub:')) add('Open custom node', () => editor.enter(sel[0].type.slice(4)), 'primary');
    if (groupable.length) add(groupable.length > 1 ? `Make custom node from ${groupable.length} nodes` : 'Make custom node', () => editor.groupSelected());
    bar.hidden = !bar.children.length;
  };
  editor.onSelect();

  // ---- welcome card
  const welcome = $('#welcome');
  const seen = () => { try { return localStorage.getItem('daub.seen'); } catch (e) { return '1'; } };
  const dismiss = () => { welcome.hidden = true; try { localStorage.setItem('daub.seen', '1'); } catch (e) { /* ignore */ } };
  if (!seen()) welcome.hidden = false;
  $('#welcomeOk').onclick = dismiss;
  $('#help').onclick = () => { setMode('nodes'); welcome.hidden = false; };
  $('#graph').addEventListener('pointerdown', () => { if (!welcome.hidden && seen()) welcome.hidden = true; });

  // ---- files
  const download = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  $('#png').onclick = () => cv.toBlob((b) => download('daub.png', b));
  $('#svg').onclick = () => {
    if (mode === 'code' || !lastScene) return toast('SVG export works from the Design and Nodes tabs.');
    download('daub.svg', new Blob([window.Daub.toSVG(lastScene, W, H)], { type: 'image/svg+xml' }));
  };
  $('#save').onclick = () => download((projName() || 'sketch').replace(/[^\w.-]+/g, '-') + '.daub.json', new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' }));
  $('#open').onclick = () => $('#file').click();
  $('#file').onchange = async (e) => {
    try {
      const d = JSON.parse(await e.target.files[0].text());
      if (!d.graph || !validProject(d.graph)) throw new Error('That file is not a Daub sketch.');
      newProject((e.target.files[0].name || 'Opened sketch').replace(/\.daub\.json$|\.json$/i, ''), d);
    } catch (err) { status(err.message, true); }
    e.target.value = '';
  };

  // ---- a small in-page question box (window.prompt does not exist in the desktop app)
  function askNumber(title, hint, initial) {
    return new Promise((resolve) => {
      const box = $('#ask'), input = $('#askInput'), ok = $('#askOk'), cancel = $('#askCancel');
      $('#askTitle').textContent = title; $('#askHint').textContent = hint; input.value = initial; box.hidden = false; input.focus(); input.select();
      const done = (v) => { box.hidden = true; ok.onclick = cancel.onclick = input.onkeydown = null; resolve(v); };
      ok.onclick = () => done(parseFloat(input.value));
      cancel.onclick = () => done(NaN);
      input.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') done(parseFloat(input.value)); else if (e.key === 'Escape') done(NaN); };
    });
  }

  // ---- video export: records the preview canvas for N seconds
  $('#video').onclick = async () => {
    if (!window.MediaRecorder || !cv.captureStream) return toast('Video export is not supported in this browser.');
    const d = editor.project.design, def = mode === 'design' ? Math.max(0.5, (d && d.duration) || 4) : 5;
    const secs = await askNumber('Export video', 'How many seconds should the video be? (1–120)', def);
    if (!(secs > 0) || secs > 120) return;
    playing = true; time = 0;
    if (mode === 'design') window.Daub.design.setTime(0); else if (mode === 'code') runSketch();
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(cv.captureStream(30), { mimeType: mime, videoBitsPerSecond: 8e6 }), chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => { download('daub.webm', new Blob(chunks, { type: 'video/webm' })); toast('Saved daub.webm'); };
    rec.start(); toast(`Recording ${secs}s…`, 0); setTimeout(() => rec.stop(), secs * 1000);
  };

  // ---- desktop app (Electron): native menu commands arrive here and press the matching button
  if (window.daubDesktop) {
    document.body.classList.add('desktop', window.daubDesktop.platform);
    window.daubDesktop.onMenu((action) => {
      const typing = document.activeElement && document.activeElement.matches('textarea,input:not([type=color]):not([type=checkbox])');
      if (action === 'undo' || action === 'redo') {
        if (typing) document.execCommand(action); // inside a text box, undo the typing
        else if (activeEd() || mode === 'design') $('#' + action).click(); // otherwise undo the sketch
        return;
      }
      const buttons = { open: '#open', save: '#save', importSvg: '#importSvg', png: '#png', svg: '#svg', video: '#video' };
      if (buttons[action]) $(buttons[action]).click();
    });
  }

  window.Daub.app = { editor, cgEditor, projects: () => projects, startProject, openProject, runSketch, renderNodes, setMode, setCodeView, toast };
  if (startView && startView.mode && startView.mode !== 'nodes') { if (startView.codeView === 'nodes') codeView = 'nodes'; setMode(startView.mode); }
  renderProjectBar(); saveNow();
  renderNodes();
  requestAnimationFrame(frame);
})();
