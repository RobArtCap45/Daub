/* Daub script: a small text language that compiles to node graphs, and back.
 *
 *   let pts = grid(14, 14, 460, 460)                  // call a node like a function; name a value with let
 *   star(5, 22, 10)                                   // arguments: positional, or name: value
 *     |> copy(pts: pts, scale: noiseField(pts) * 2)   // |> sends the value on the left into the next node
 *     |> output(bri: 6)                               // math is plain operators: + - * / % ^
 *
 *   def petals(count = 12, hue = 0) { ... }           // your own custom node; parameters become its controls
 *
 * Rules the compiler and decompiler share:
 *   - a piped value goes into the first input (in order) that accepts its type and was not named explicitly;
 *   - positional arguments fill the remaining inputs in order.
 */
(function (g) {
  'use strict';
  const L = g.Daub, { NODES, getDef, compat } = L;

  class ScriptError extends Error { constructor(msg, pos) { super(msg); this.line = pos ? pos.line : 0; this.col = pos ? pos.col : 0; } }
  const fail = (msg, pos) => { throw new ScriptError(msg, pos); };
  const TYPE_NAME = { num: 'numbers', geo: 'shapes', pts: 'points', any: 'a list', enum: 'a choice' };
  const KEYWORDS = new Set(['let', 'def']);
  const OPS = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod', '^': 'pow' };
  const INFIX = { add: ['+', 1], sub: ['-', 1], mul: ['*', 2], div: ['/', 2], mod: ['%', 2], pow: ['^', 3] };
  const FOLD = { '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => (b === 0 ? 0 : a / b), '%': (a, b) => (b === 0 ? 0 : ((a % b) + b) % b), '^': (a, b) => Math.pow(a, b) };

  const slug = (s) => {
    const w = String(s).replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    if (!w.length) return 'custom';
    const r = w.map((x, i) => (i ? x[0].toUpperCase() + x.slice(1) : x[0].toLowerCase() + x.slice(1))).join('');
    return /^[0-9]/.test(r) ? 'n' + r : r;
  };
  const humanize = (n) => { const t = n.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase(); return t[0].toUpperCase() + t.slice(1); };
  function distance(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
  const suggest = (word, list) => { let best = null, bd = 3; list.forEach((c) => { const d = distance(word.toLowerCase(), c.toLowerCase()); if (d < bd || (d === bd && best === null)) { bd = d; best = c; } }); return best && bd <= 2 ? ` Did you mean “${best}”?` : ''; };

  // the one rule shared by compile and decompile: which input receives a piped value
  function matchInput(def, leftType, taken) {
    for (const s of def.inputs) {
      if (taken.has(s.n) || s.t === 'svg' || s.t === 'draw' || s.t === 'enum') continue;
      if (leftType == null || compat(leftType, s.t)) return s;
    }
    return null;
  }

  // ---------------------------------------------------------------- lexer
  function lex(src) {
    const toks = []; let i = 0, line = 1, col = 1, depth = 0;
    const push = (t, v, l, c) => toks.push({ t, v, line: l, col: c });
    while (i < src.length) {
      const ch = src[i], l = line, c = col;
      if (ch === '\n') { if (depth === 0) push('nl', '\n', l, c); i++; line++; col = 1; continue; }
      if (/\s/.test(ch)) { i++; col++; continue; }
      if ((ch === '/' && src[i + 1] === '/') || ch === '#') { while (i < src.length && src[i] !== '\n') { i++; col++; } continue; }
      let m;
      if ((m = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i, i + 40)))) { push('num', parseFloat(m[0]), l, c); i += m[0].length; col += m[0].length; continue; }
      if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i, i + 80)))) { push('id', m[0], l, c); i += m[0].length; col += m[0].length; continue; }
      if (ch === '"' || ch === "'") {
        let j = i + 1; while (j < src.length && src[j] !== ch && src[j] !== '\n') j++;
        if (src[j] !== ch) fail('This text is missing its closing quote.', { line: l, col: c });
        push('str', src.slice(i + 1, j), l, c); col += j - i + 1; i = j + 1; continue;
      }
      if (ch === '|' && src[i + 1] === '>') { push('op', '|>', l, c); i += 2; col += 2; continue; }
      if ('()[]{},:=+-*/%^;'.includes(ch)) { if (ch === '(' || ch === '[') depth++; if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1); push('op', ch, l, c); i++; col++; continue; }
      fail(`I don't understand the character “${ch}”.`, { line: l, col: c });
    }
    push('eof', '', line, col);
    return toks;
  }

  // ---------------------------------------------------------------- parser
  class Parser {
    constructor(toks) { this.t = toks; this.i = 0; }
    peek() { return this.t[this.i]; }
    pos() { const k = this.peek(); return { line: k.line, col: k.col }; }
    is(t, v) { const k = this.peek(); return k.t === t && (v === undefined || k.v === v); }
    next() { return this.t[this.i++]; }
    expectOp(v, what) { if (!this.is('op', v)) fail(`Expected ${what || '“' + v + '”'}${this.peek().t === 'eof' ? ' but the script ended' : ` but found “${this.peek().v === '\n' ? 'end of line' : this.peek().v}”`}.`, this.pos()); return this.next(); }
    skipSeps() { while (this.is('nl') || this.is('op', ';')) this.i++; }
    program() { const out = []; this.skipSeps(); while (!this.is('eof')) { out.push(this.statement()); this.endStatement(); this.skipSeps(); } return out; }
    endStatement() { if (this.is('nl') || this.is('op', ';') || this.is('eof') || this.is('op', '}')) return; fail(`Unexpected “${this.peek().v}”. Each line should hold one statement; use |> to continue a chain.`, this.pos()); }
    statement() {
      const p = this.pos();
      if (this.is('id', 'let')) { this.next(); const n = this.next(); if (n.t !== 'id' || KEYWORDS.has(n.v)) fail('After “let” I expected a name, like  let size = 40', { line: n.line, col: n.col }); this.expectOp('=', '“=” after the name'); return { k: 'let', name: n.v, expr: this.pipe(), pos: p }; }
      if (this.is('id', 'def')) return this.def();
      return { k: 'expr', expr: this.pipe(), pos: p };
    }
    def() {
      const p = this.pos(); this.next(); const n = this.next();
      if (n.t !== 'id' || KEYWORDS.has(n.v)) fail('After “def” I expected a name, like  def petals(count = 12) { … }', { line: n.line, col: n.col });
      this.expectOp('(', '“(” after the node name'); const params = [];
      while (!this.is('op', ')')) {
        const q = this.next(); if (q.t !== 'id') fail('Expected a parameter name.', { line: q.line, col: q.col });
        let def; if (this.is('op', '=')) { this.next(); def = this.unary(); }
        params.push({ name: q.v, def, pos: { line: q.line, col: q.col } }); if (this.is('op', ',')) this.next(); else break;
      }
      this.expectOp(')'); let body;
      if (this.is('op', '=')) { this.next(); body = [{ k: 'expr', expr: this.pipe(), pos: this.pos() }]; }
      else {
        this.skipSeps(); this.expectOp('{', '“{” to start the node body'); this.skipSeps(); body = [];
        while (!this.is('op', '}')) { if (this.is('eof')) fail('This { is never closed with }.', p); body.push(this.statement()); this.endStatement(); this.skipSeps(); }
        this.next();
      }
      return { k: 'def', name: n.v, params, body, pos: p };
    }
    pipe() {
      let left = this.add();
      for (;;) {
        let j = this.i; while (this.t[j].t === 'nl') j++;
        if (this.t[j].t === 'op' && this.t[j].v === '|>') { this.i = j + 1; while (this.is('nl')) this.i++; const call = this.callOrName(); left = { k: 'pipe', left, call, pos: call.pos }; } else break;
      }
      return left;
    }
    callOrName() {
      const t = this.next(); if (t.t !== 'id') fail('After |> I expected a node name, like  |> copy(…)', { line: t.line, col: t.col });
      return this.finishCall(t);
    }
    finishCall(t) {
      const call = { k: 'call', name: t.v, args: [], pos: { line: t.line, col: t.col } };
      if (!this.is('op', '(')) return call;
      this.next();
      while (!this.is('op', ')')) {
        if (this.is('eof')) fail('This ( is never closed with ).', call.pos);
        const a = {}; a.pos = this.pos();
        if (this.is('id') && this.t[this.i + 1].t === 'op' && this.t[this.i + 1].v === ':') { a.name = this.next().v; this.next(); }
        a.expr = this.pipe(); call.args.push(a);
        if (this.is('op', ',')) this.next(); else break;
      }
      this.expectOp(')', '“)” to close the arguments of ' + t.v);
      return call;
    }
    add() { let l = this.mul(); while (this.is('op', '+') || this.is('op', '-')) { const o = this.next(); l = { k: 'bin', op: o.v, l, r: this.mul(), pos: { line: o.line, col: o.col } }; } return l; }
    mul() { let l = this.unary(); while (this.is('op', '*') || this.is('op', '/') || this.is('op', '%')) { const o = this.next(); l = { k: 'bin', op: o.v, l, r: this.unary(), pos: { line: o.line, col: o.col } }; } return l; }
    unary() { if (this.is('op', '-')) { const o = this.next(); return { k: 'neg', e: this.unary(), pos: { line: o.line, col: o.col } }; } return this.power(); }
    power() { const b = this.atom(); if (this.is('op', '^')) { const o = this.next(); return { k: 'bin', op: '^', l: b, r: this.unary(), pos: { line: o.line, col: o.col } }; } return b; }
    atom() {
      const t = this.next(), pos = { line: t.line, col: t.col };
      if (t.t === 'num') return { k: 'num', v: t.v, pos };
      if (t.t === 'str') return { k: 'str', v: t.v, pos };
      if (t.t === 'id') { if (KEYWORDS.has(t.v)) fail(`“${t.v}” is a keyword and can't be used here.`, pos); return this.is('op', '(') ? this.finishCall(t) : { k: 'id', name: t.v, pos }; }
      if (t.t === 'op' && t.v === '(') { const e = this.pipe(); this.expectOp(')'); return e; }
      fail(t.t === 'eof' ? 'The script ended where a value was expected.' : t.t === 'nl' ? 'This line ends where a value was expected.' : `I expected a value here but found “${t.v}”.`, pos);
    }
  }

  // ---------------------------------------------------------------- compiler (text -> graph)
  function compile(text, existing) {
    const ast = new Parser(lex(text)).program();
    const subs = {}, userFns = new Map(), used = new Set(), existingProject = existing || { nodes: [], subs: {} };
    const fnTable = new Map(); Object.entries(NODES).forEach(([type, d]) => { fnTable.set(type, type); fnTable.set(slug(d.label), type); });
    const allNames = () => [...userFns.keys(), ...Object.keys(NODES)];
    const newScope = (label, existingNodes) => ({ label, nodes: [], edges: [], vars: new Map(), params: null, inputs: [], paramTypes: new Map(), nextId: 1, existingNodes: existingNodes || [] });
    const reserved = new Set(); // ids the script asks for with id: "…" must never be handed out to other nodes
    (function walk(x) { if (Array.isArray(x)) return x.forEach(walk); if (x && typeof x === 'object') { if (x.k === 'call') x.args.forEach((a) => { if (a.name === 'id' && a.expr.k === 'str') reserved.add(a.expr.v); }); Object.values(x).forEach(walk); } }(ast));
    const newNode = (sc, type, wantId) => {
      let id = wantId && !sc.nodes.some((n) => n.id === wantId) ? wantId : null;
      while (!id) { const c = 'n' + sc.nextId++; if (!reserved.has(c) && !sc.nodes.some((n) => n.id === c)) id = c; }
      const n = { id, type, x: 0, y: 0, params: {} }; sc.nodes.push(n); return n;
    };
    const valType = (v) => (v.t === 'node' ? v.out : v.t === 'lit' && typeof v.v === 'number' ? 'num' : null);

    function resolveFn(name, pos) {
      if (userFns.has(name)) { const type = 'sub:' + userFns.get(name); return { type, def: getDef(type, subs) }; }
      const type = fnTable.get(name); if (type) return { type, def: NODES[type] };
      return fail(`I don't know a node called “${name}”.` + suggest(name, [...allNames(), ...[...fnTable.keys()]]), pos);
    }

    function bind(sc, node, def, fnName, spec, v, pos) {
      const label = `${fnName}'s “${spec.n}”`;
      if (v.t === 'node') {
        if (!compat(v.out, spec.t)) fail(`${label} needs ${TYPE_NAME[spec.t] || spec.t}, but this is ${TYPE_NAME[v.out] || 'something else'}.`, pos);
        sc.edges.push({ from: v.id, to: node.id, input: spec.n });
      } else if (v.t === 'lit') {
        if (spec.t === 'num' || spec.t === 'any') { if (typeof v.v !== 'number') fail(`${label} needs a number, but this is text.`, pos); node.params[spec.n] = v.v; }
        else if (spec.t === 'enum') { if (!spec.o.includes(String(v.v))) fail(`${label} can be: ${spec.o.join(', ')}.` + suggest(String(v.v), spec.o), pos); node.params[spec.n] = String(v.v); }
        else fail(`${label} needs ${TYPE_NAME[spec.t] || spec.t}; a plain value won't do.`, pos);
      } else if (v.t === 'word') {
        if (spec.t === 'enum' && spec.o.includes(v.v)) node.params[spec.n] = v.v;
        else if (spec.t === 'enum') fail(`“${v.v}” isn't one of the choices for ${label}: ${spec.o.join(', ')}.` + suggest(v.v, spec.o), pos);
        else fail(`I don't know the name “${v.v}”. Names come from “let”, or from the parameters of a “def”.` + suggest(v.v, [...sc.vars.keys(), ...(sc.params ? sc.params.keys() : [])]), pos);
      } else if (v.t === 'param') {
        const prev = sc.paramTypes.get(v.name); if (prev && prev !== spec.t && !(compat(prev, spec.t))) fail(`“${v.name}” is used as ${TYPE_NAME[prev]} and as ${TYPE_NAME[spec.t]}.`, pos);
        sc.paramTypes.set(v.name, spec.t);
        const d = v.def !== undefined ? v.def : spec.d; if (typeof d === 'number' && (spec.t === 'num' || spec.t === 'any')) node.params[spec.n] = d; if (typeof d === 'string' && spec.t === 'enum') node.params[spec.n] = d;
        sc.inputs.push({ name: v.name, node: node.id, input: spec.n, t: spec.t, d, o: spec.o });
      }
    }

    function value(a, sc) {
      switch (a.k) {
        case 'num': return { t: 'lit', v: a.v };
        case 'str': return { t: 'lit', v: a.v, str: true };
        case 'id':
          if (sc.vars.has(a.name)) return sc.vars.get(a.name);
          if (sc.params && sc.params.has(a.name)) return { t: 'param', name: a.name, def: sc.params.get(a.name).def };
          return { t: 'word', v: a.name, pos: a.pos };
        case 'call': return call(a, sc, null);
        case 'pipe': return call(a.call, sc, value(a.left, sc));
        case 'neg': { const v = value(a.e, sc); if (v.t === 'lit' && typeof v.v === 'number') return { t: 'lit', v: -v.v }; return math(sc, '*', v, { t: 'lit', v: -1 }, a.pos); }
        case 'bin': return math(sc, a.op, value(a.l, sc), value(a.r, sc), a.pos);
        default: return fail('Unsupported expression.', a.pos);
      }
    }
    function math(sc, op, l, r, pos) {
      if (l.t === 'lit' && r.t === 'lit' && typeof l.v === 'number' && typeof r.v === 'number') return { t: 'lit', v: FOLD[op](l.v, r.v) };
      const n = newNode(sc, 'math'); n.params.op = OPS[op]; const def = NODES.math;
      [['a', l], ['b', r]].forEach(([name, v]) => {
        if (v.t === 'node' && v.out !== 'num' && v.out !== 'any') fail(`Math (${op}) only works on numbers, but this is ${TYPE_NAME[v.out] || 'something else'}.`, pos);
        bind(sc, n, def, 'math', def.inputs.find((s) => s.n === name), v, pos);
      });
      return { t: 'node', id: n.id, out: 'num' };
    }

    function call(a, sc, piped) {
      const { type, def } = resolveFn(a.name, a.pos), inputs = def.inputs;
      const named = new Map(); const positional = []; let idArg = null;
      for (const arg of a.args) {
        if (arg.name === 'id') { idArg = arg.expr.k === 'str' ? arg.expr.v : arg.expr.k === 'id' ? arg.expr.name : null; continue; }
        if (arg.name) {
          if (!inputs.some((s) => s.n === arg.name && s.t !== 'svg' && s.t !== 'draw')) fail(`“${a.name}” has no input called “${arg.name}”.` + suggest(arg.name, inputs.map((s) => s.n)) + ` Its inputs: ${inputs.filter((s) => s.t !== 'svg' && s.t !== 'draw').map((s) => s.n).join(', ') || '(none)'}.`, arg.pos);
          if (named.has(arg.name)) fail(`“${arg.name}” is given twice.`, arg.pos);
          named.set(arg.name, { expr: arg.expr, pos: arg.pos });
        } else positional.push(arg);
      }
      let pipedInput = null;
      if (piped) {
        pipedInput = matchInput(def, valType(piped), new Set(named.keys()));
        if (!pipedInput) fail(`${a.name}() has nowhere to put ${TYPE_NAME[valType(piped)] || 'this value'}: no free input accepts it.`, a.pos);
      }
      const free = inputs.filter((s) => s.t !== 'svg' && s.t !== 'draw' && !named.has(s.n) && s !== pipedInput);
      if (positional.length > free.length) fail(`${a.name}() takes at most ${free.length + named.size + (pipedInput ? 1 : 0)} values, but got ${positional.length + named.size + (pipedInput ? 1 : 0)}.`, positional[free.length].pos);
      const vals = [];
      named.forEach((n, name) => vals.push({ spec: inputs.find((s) => s.n === name), v: value(n.expr, sc), pos: n.pos }));
      positional.forEach((p, k) => vals.push({ spec: free[k], v: value(p.expr, sc), pos: p.pos }));
      if (pipedInput) vals.push({ spec: pipedInput, v: piped, pos: a.pos });
      const node = newNode(sc, type, idArg);
      vals.forEach(({ spec, v, pos }) => bind(sc, node, def, a.name, spec, v, pos));
      if (idArg) { const old = sc.existingNodes.find((n) => n.id === idArg && n.type === type); if (old) ['svg', 'svgName', 'path'].forEach((k) => { if (old.params[k] !== undefined) node.params[k] = JSON.parse(JSON.stringify(old.params[k])); }); }
      return { t: 'node', id: node.id, out: def.out };
    }

    function runBody(stmts, sc, top) {
      let result = null;
      stmts.forEach((s, idx) => {
        if (s.k === 'let') sc.vars.set(s.name, value(s.expr, sc));
        else if (s.k === 'def') { if (!top) fail('“def” can only be used at the top level of the script.', s.pos); compileDef(s); }
        else {
          if (idx !== stmts.length - 1 && stmts.slice(idx + 1).some((q) => q.k === 'expr')) fail('This line makes a value, but nothing uses it. Give it a name with  let name = …  or connect it with |> to the next node.', s.pos);
          result = value(s.expr, sc);
        }
      });
      return result;
    }

    function compileDef(s) {
      if (userFns.has(s.name) || fnTable.has(s.name)) fail(`There is already a node called “${s.name}”. Pick another name.`, s.pos);
      const old = Object.values(existingProject.subs || {}).find((x) => slug(x.name) === s.name);
      const sc = newScope('def ' + s.name, old ? old.nodes : []); sc.params = new Map();
      s.params.forEach((p) => {
        let d; if (p.def) { if (p.def.k === 'num') d = p.def.v; else if (p.def.k === 'neg' && p.def.e.k === 'num') d = -p.def.e.v; else if (p.def.k === 'str') d = p.def.v; else if (p.def.k === 'id') d = p.def.name; else fail('A parameter default must be a plain number or word.', p.pos); }
        sc.params.set(p.name, { def: d });
      });
      const res = runBody(s.body, sc, false);
      if (!res || res.t !== 'node') fail(`“${s.name}” needs to end with a node, so there is something to return.`, s.pos);
      const order = [...sc.params.keys()];
      sc.inputs.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
      let id = 'u_' + s.name; while (used.has(id)) id += '_'; used.add(id);
      layout(sc.nodes, sc.edges);
      subs[id] = { name: humanize(s.name), nodes: sc.nodes, edges: sc.edges, inputs: sc.inputs, out: res.id };
      userFns.set(s.name, id);
    }

    const root = newScope('main', existingProject.nodes);
    const res = runBody(ast, root, true);
    const outs = () => root.nodes.filter((n) => n.type === 'output');
    if (res && res.t === 'node' && root.nodes.find((n) => n.id === res.id).type === 'output') { /* the script already ends with output(...) */ }
    else if (res) {
      if (res.t !== 'node' || res.out !== 'geo') fail('The last line should make shapes (for example a shape like star(), or something |> copy(…)), so there is something to draw.', ast.length ? ast[ast.length - 1].pos : null);
      const o = newNode(root, 'output'); root.edges.push({ from: res.id, to: o.id, input: 'geo' });
    } else newNode(root, 'output');
    if (outs().length > 1) fail('A sketch can only have one output(…).');
    layout(root.nodes, root.edges);
    return { nodes: root.nodes, edges: root.edges, subs };
  }

  // tidy left-to-right layout so a compiled graph is readable in the Nodes tab
  function layout(nodes, edges) {
    const depth = new Map(nodes.map((n) => [n.id, 0])), inEdges = new Map();
    edges.forEach((e) => { if (!inEdges.has(e.to)) inEdges.set(e.to, []); inEdges.get(e.to).push(e.from); });
    for (let pass = 0; pass < nodes.length; pass++) { let ch = false; edges.forEach((e) => { if (depth.get(e.from) + 1 > depth.get(e.to)) { depth.set(e.to, depth.get(e.from) + 1); ch = true; } }); if (!ch) break; }
    const layers = []; nodes.forEach((n) => { const d = depth.get(n.id); (layers[d] = layers[d] || []).push(n); });
    const yOf = new Map();
    layers.forEach((layer, d) => {
      if (!layer) return;
      const bary = (n) => { const s = inEdges.get(n.id) || []; return s.length ? s.reduce((a, id) => a + (yOf.get(id) ?? 0), 0) / s.length : 1e9; };
      layer.sort((a, b) => bary(a) - bary(b)); let y = 0;
      layer.forEach((n) => { n.x = d * 260; n.y = y; yOf.set(n.id, y); y += 56 + 26 * ((NODES[n.type] ? NODES[n.type].inputs.length : 4)) + 24; });
    });
  }

  // ---------------------------------------------------------------- decompiler (graph -> text)
  const NUMERIC_LEAD = new Set(['rect', 'ellipse', 'polygon', 'star', 'line', 'grid', 'ring', 'scatter', 'time', 'number', 'series', 'random']);
  const fmtNum = (v) => (Number.isInteger(v) ? String(v) : String(+Number(v).toFixed(6)));
  const sameLit = (a, b) => a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9);

  function decompile(project) {
    const subs = project.subs || {};
    const used = new Set(KEYWORDS); Object.entries(NODES).forEach(([t, d]) => { used.add(t); used.add(slug(d.label)); });
    const fnName = {};
    Object.entries(subs).forEach(([id, s]) => { const base = slug(s.name); let nm = base, k = 2; while (used.has(nm)) nm = base + k++; used.add(nm); fnName[id] = nm; });
    const order = [], seen = new Set();
    const visit = (id) => { if (seen.has(id) || !subs[id]) return; seen.add(id); subs[id].nodes.forEach((n) => { if (n.type.startsWith('sub:')) visit(n.type.slice(4)); }); order.push(id); };
    Object.keys(subs).forEach(visit);

    const fmtLit = (v, names) => {
      if (typeof v === 'number') return { text: fmtNum(v), prec: v < 0 ? 2.5 : 4 };
      if (typeof v === 'string') return { text: /^[A-Za-z_]\w*$/.test(v) && !names.has(v) && !KEYWORDS.has(v) ? v : JSON.stringify(v), prec: 4 };
      return { text: '0', prec: 4 };
    };

    function emitGraph(graph, rootId, pub, paramNames) {
      const byId = new Map(graph.nodes.map((n) => [n.id, n])), src = new Map(graph.edges.map((e) => [e.to + ':' + e.input, e.from])), uses = new Map();
      graph.edges.forEach((e) => uses.set(e.from, (uses.get(e.from) || 0) + 1));
      const lines = [], bound = new Map(), built = new Set(), visiting = new Set(), names = new Set(paramNames);
      const nameFor = (n) => { const base = n.type.startsWith('sub:') ? fnName[n.type.slice(4)] : n.type; let k = 1, s; do { s = base + k++; } while (names.has(s)); names.add(s); return s; };
      const wrap = (e, min) => (e.prec < min ? `(${e.text})` : e.text);

      function expr(id) {
        if (bound.has(id)) return { text: bound.get(id), prec: 4 };
        const b = build(id);
        if ((uses.get(id) || 0) > 1 && id !== rootId) { const nm = nameFor(byId.get(id)); lines.push(`let ${nm} = ${b.text}`); bound.set(id, nm); return { text: nm, prec: 4 }; }
        return b;
      }
      function build(id) {
        if (visiting.has(id)) throw new Error('This graph loops back on itself, so it cannot be written as text.');
        visiting.add(id); built.add(id);
        const n = byId.get(id), def = getDef(n.type, subs), fn = n.type.startsWith('sub:') ? fnName[n.type.slice(4)] : n.type;
        const conn = (inp) => { const s = src.get(id + ':' + inp); return s !== undefined && byId.has(s) ? s : null; };
        let out;
        if (n.type === 'math' && INFIX[n.params.op ?? 'add']) {
          const [sym, prec] = INFIX[n.params.op ?? 'add'];
          const operand = (inp) => { const s = conn(inp); if (s !== null) return expr(s); const p = pub.get(id + ':' + inp); if (p) return { text: p, prec: 4 }; const spec = def.inputs.find((x) => x.n === inp); return fmtLit(n.params[inp] ?? spec.d, names); };
          const A = operand('a'), B = operand('b');
          out = { text: `${wrap(A, sym === '^' ? 3.5 : prec)} ${sym} ${wrap(B, sym === '^' ? 2.5 : prec + 1)}`, prec };
        } else {
          const connected = [], explicit = new Map();
          for (const s of def.inputs) {
            if (s.t === 'svg' || s.t === 'draw') continue;
            if (conn(s.n) !== null) connected.push(s.n);
            else if (pub.has(id + ':' + s.n)) explicit.set(s.n, { text: pub.get(id + ':' + s.n) });
            else if (s.t === 'num' || s.t === 'enum' || s.t === 'any') { const v = n.params[s.n]; if (v !== undefined && !sameLit(v, s.d)) explicit.set(s.n, fmtLit(v, names)); }
          }
          // Which values are written by position (a leading run, up to 4) and which by name. The compiler fills positional
          // arguments into the free inputs in order, so only a run that starts at the first input can be positional.
          const provided = new Set([...explicit.keys(), ...connected]);
          const numericLead = NUMERIC_LEAD.has(n.type) || n.type.startsWith('sub:'); // nodes whose leading numbers read fine without names
          const specOf = (name) => def.inputs.find((s) => s.n === name);
          const layoutArgs = (pipeSpec) => {
            const order = def.inputs.filter((s) => s.t !== 'svg' && s.t !== 'draw' && s !== pipeSpec).map((s) => s.n), lim = Math.min(4, order.length); let k = 0;
            const posOk = (name, j) => provided.has(name) && ((connected.includes(name) && specOf(name).t !== 'num') || (j === 1 && specOf(name).t === 'enum' && connected.includes(order[0]) && specOf(order[0]).t !== 'num')); // shapes/points by position; numbers by name
            if (numericLead) { // one run from the first input; skipped inputs in the middle are filled with their defaults
              let last = -1; for (let j = 0; j < lim; j++) if (provided.has(order[j])) last = j;
              for (let j = 0; j <= last; j++) { if (provided.has(order[j]) || ['num', 'enum'].includes(specOf(order[j]).t)) k = j + 1; else break; }
            } else {
              while (k < lim && posOk(order[k], k)) k++;
            }
            return { positional: order.slice(0, k), named: order.slice(k).filter((x) => provided.has(x)) };
          };
          let pipe = null;
          for (const s of def.inputs) { // pipe a shape or point list from the input that the compiler would pick for it
            if (!connected.includes(s.n)) continue; const from = conn(s.n);
            if (uses.get(from) !== 1 || bound.has(from) || visiting.has(from)) continue;
            const leftOut = getDef(byId.get(from).type, subs).out; if (leftOut === 'num') continue; // numbers read better as named arguments
            if (connected.filter((c) => compat(leftOut, specOf(c).t)).length > 1) continue; // several inputs could take it (like merge): name them all
            const named = new Set(layoutArgs(s).named); named.delete(s.n);
            if (matchInput(def, leftOut, named) === s) { pipe = s; break; }
          }
          const lay = layoutArgs(pipe), textOf = (name) => (connected.includes(name) ? expr(conn(name)).text : explicit.has(name) ? explicit.get(name).text : fmtLit(n.params[name] ?? specOf(name).d, names).text);
          const args = lay.positional.map(textOf).concat(lay.named.map((name) => `${name}: ${textOf(name)}`));
          if (def.inputs.some((s) => s.t === 'svg' || s.t === 'draw')) args.push(`id: ${JSON.stringify(id)}`);
          const left = pipe ? expr(conn(pipe.n)) : null;
          out = { text: `${left ? left.text + ' |> ' : ''}${fn}(${args.join(', ')})`, prec: left ? 0 : 4 };
        }
        visiting.delete(id); return out;
      }

      const final = byId.has(rootId) ? (bound.has(rootId) ? bound.get(rootId) : build(rootId).text) : null;
      graph.nodes.forEach((n) => { if (!built.has(n.id) && !(uses.get(n.id) > 0)) { const b = build(n.id); lines.push(`let ${nameFor(n)} = ${b.text}`); } }); // nodes nothing uses are kept as unused lets
      return { lines, final };
    }

    // put each argument of a too-long call on its own line
    function breakArgs(s, indent) {
      if (s.length + indent.length <= 84) return s;
      const open = s.indexOf('('); if (open < 0 || s[s.length - 1] !== ')') return s;
      const args = []; let depth = 0, q = null, start = open + 1, close = -1;
      for (let i = open; i < s.length; i++) {
        const ch = s[i];
        if (q) { if (ch === q) q = null; continue; }
        if (ch === '"') q = ch; else if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') { depth--; if (depth === 0) { close = i; args.push(s.slice(start, i)); break; } }
        else if (ch === ',' && depth === 1) { args.push(s.slice(start, i)); start = i + 1; }
      }
      if (close !== s.length - 1 || args.length < 2) return s;
      return s.slice(0, open + 1) + '\n' + args.map((a) => `${indent}  ${a.trim()}`).join(',\n') + '\n' + indent + ')';
    }
    // break long chains at |> (only at the top level, outside brackets and quotes), then long argument lists
    function format(text, indent) {
      if (text.length + indent.length <= 84) return indent + text;
      const parts = []; let depth = 0, q = null, start = 0;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) { if (ch === q) q = null; continue; }
        if (ch === '"') q = ch; else if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--;
        else if (depth === 0 && text.startsWith(' |> ', i)) { parts.push(text.slice(start, i)); start = i + 4; i += 3; }
      }
      parts.push(text.slice(start));
      if (parts.length < 2) return indent + breakArgs(text, indent);
      return indent + breakArgs(parts[0], indent) + parts.slice(1).map((p) => `\n${indent}  |> ${breakArgs(p, indent + '  ')}`).join('');
    }

    const out = [];
    order.forEach((id) => {
      const s = subs[id]; const pub = new Map(), pnames = [], defaults = new Map();
      s.inputs.forEach((x) => { pub.set(x.node + ':' + x.input, x.name); if (!pnames.includes(x.name)) { pnames.push(x.name); defaults.set(x.name, x); } });
      const { lines, final } = emitGraph(s, s.out, pub, pnames);
      const params = pnames.map((p) => { const x = defaults.get(p); const d = x.d; return typeof d === 'number' ? `${p} = ${fmtNum(d)}` : typeof d === 'string' && x.t === 'enum' ? `${p} = ${JSON.stringify(d)}` : p; });
      out.push(`def ${fnName[id]}(${params.join(', ')}) {`);
      lines.forEach((l) => out.push(format(l, '  '))); if (final) out.push(format(final, '  ')); out.push('}', '');
    });
    const outNode = project.nodes.find((n) => n.type === 'output');
    const { lines, final } = emitGraph(project, outNode ? outNode.id : null, new Map(), []);
    lines.forEach((l) => out.push(format(l, ''))); if (lines.length && final) out.push('');
    if (final) out.push(format(final, ''));
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  }

  // one line per node: name(arg, arg = default, …)  —  what it does
  function reference(subs) {
    const sig = (name, def) => `${name}(${def.inputs.filter((s) => s.t !== 'svg' && s.t !== 'draw').map((s) => (s.t === 'num' ? `${s.n} = ${fmtNum(s.d)}` : s.t === 'enum' ? `${s.n} = ${s.d}` : s.n)).join(', ')})`;
    const rows = Object.entries(NODES).map(([type, d]) => ({ name: type, sig: sig(type, d), desc: d.desc || '', cat: d.cat }));
    Object.entries(subs || {}).forEach(([id, s]) => { const d = getDef('sub:' + id, subs); rows.push({ name: slug(s.name), sig: sig(slug(s.name), d), desc: 'Your custom node.', cat: 'Custom' }); });
    return rows;
  }

  g.Daub.script = { compile, decompile, reference, ScriptError, slug };
})(window);
