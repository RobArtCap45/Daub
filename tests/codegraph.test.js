// Daub code graph tests. Run with:  node tests/codegraph.test.js
global.window = global;
require('../app/src/engine.js');
require('../app/src/codegraph.js');
require('../app/src/examples.js');
require('../app/src/examples-code.js');
const L = window.Daub, C = L.codegraph;
let failed = 0;
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); if (!ok) failed++; };

// what the program says, ignoring layout: every token except ; { } and comments
const sig = (src) => C._tokens(src).filter((t) => !/^(?:;|\{|\}|\/\/.*|\/\*[\s\S]*\*\/)$/.test(t)).join(' ');
const trip = (src) => C.generate(C.compile(src));
const stable = (src) => { const a = trip(src); return trip(a) === a; };
const types = (src) => C.compile(src).nodes.map((n) => n.type);

// ----- every Code example survives code -> nodes -> code
let bad = 0, raws = 0, total = 0;
for (const ex of L.examples.code) {
  let ok = true, why = '';
  try {
    const g = C.compile(ex.code), out = C.generate(g), st = C.stats(g);
    raws += st.raw; total += st.nodes;
    if (sig(out) !== sig(ex.code)) { ok = false; why = 'the code changed'; }
    else if (trip(out) !== out) { ok = false; why = 'not stable on a second trip'; }
    else new Function('with(this){' + out + '}'); // still valid JavaScript
  } catch (e) { ok = false; why = e.message + (e.line ? ` (line ${e.line})` : ''); }
  if (!ok) bad++;
  check(`round trip: ${ex.cat} / ${ex.name}`, ok, why);
}
check(`${L.examples.code.length} code examples, ${total} nodes, ${raws} raw`, bad === 0 && raws / total < 0.2, `${raws} raw of ${total}`);

// ----- what nodes the parser makes
const T = (s) => types(s).join(' ');
check('a call becomes a call node with its arity', T('rect(1, 2, 3, 4);') === 'start call:rect/4');
check('a method call keeps its object', T('img.resize(90, 0);') === 'start call:img.resize/2');
check('no arguments', T('noLoop();') === 'start call:noLoop/0');
check('a variable', T('let x = 5;') === 'start let');
check('an assignment', T('x += 2;') === 'start set');
check('a property assignment', T('p.x = 3;') === 'start set');
check('i++ is a plain statement', T('i++;') === 'start run');
check('a for loop is a container', T('for (let i = 0; i < 3; i++) { rect(i, 0, 1, 1); }') === 'start for');
check('  with its body in subs', (() => { const g = C.compile('for (let i = 0; i < 3; i++) { rect(i, 0, 1, 1); fill(0); }'); const id = g.nodes[1].id; return g.subs[id].nodes.length === 3; })());
check('for…of is a for-each', T('for (const v of list) { f(v); }') === 'start foreach');
check('if / else if / else are three nodes in a row', T('if (a) { f(); } else if (b) { g(); } else { h(); }') === 'start if elseif else');
check('functions are containers', T('function draw() { background(0); }') === 'start func');
check('classes stay raw', T('class A { m() { return 1; } }\nrect(1,2,3,4);') === 'start raw call:rect/4');
check('destructuring stays raw', T('const [a, b] = list;') === 'start raw');
check('two declarations in one stay raw', T('let a = 1, b = 2;') === 'start raw');
check('arrow function value stays one node', T('const f = (a, b) => { return a + b; };') === 'start let');
check('braceless bodies get a body', (() => { const g = C.compile('if (a) f();\nelse g();'); return g.nodes.map((n) => n.type).join() === 'start,if,else' && Object.keys(g.subs).length === 2; })());
check('statements without semicolons split on line breaks', T('let a = 1\nlet b = 2\nrect(a, b, 3, 4)') === 'start let let call:rect/4');
check('an expression can continue on the next line', T('let a = 1 +\n  2\nrect(a, 0, 1, 1)') === 'start let call:rect/4');
check('a line starting with . continues the statement', T('const s = list\n  .map(f)\n  .join(",")\nrect(1,2,3,4)') === 'start let call:rect/4');
check('strings with // and braces do not confuse it', T("text('// {not a comment}', 1, 2);") === 'start call:text/3');
check('template strings with ${} work', T('text(`a ${x + {a:1}.a} b`, 1, 2);\nrect(1,2,3,4);') === 'start call:text/3 call:rect/4');
check('regex literals do not look like division', T('const r = /a\\/b[/]/g;\nrect(1,2,3,4);') === 'start let call:rect/4');
check('division is still division', T('let h = a / b / c;') === 'start let');

// ----- params
const p1 = C.compile('fill(map(mouseX, 0, width, 0, 255), 100, 90);').nodes[1];
check('arguments split at top-level commas only', p1.params.a0 === 'map(mouseX, 0, width, 0, 255)' && p1.params.a1 === '100' && p1.params.a2 === '90');
const p2 = C.compile('let n = 3;').nodes[1];
check('variable params', p2.params.kw === 'let' && p2.params.name === 'n' && p2.params.value === '3');
const p3 = C.compile('for (let i = 0; i < 20; i += 2) {}').nodes[1];
check('for params', p3.params.init === 'let i = 0' && p3.params.test === 'i < 20' && p3.params.step === 'i += 2');

// ----- comments and spacing
const cm = '// Title line\nfunction setup() {\n  noLoop(); // once\n\n  // draw a box\n  rect(1, 2, 3, 4);\n}\n';
check('comments and blank lines survive', trip(cm) === cm, '\n' + trip(cm));
check('a leading comment is a node note', C.compile(cm).nodes[1].params.note === 'Title line');
check('a comment at the end of a block is kept', trip('function f() {\n  a();\n  // later\n}\n').includes('// later'));
check('a file of only comments', trip('// nothing here\n') === '// nothing here\n');
check('block comments stay as typed', trip('/* a\n * b */\nrect(1,2,3,4);').includes('/* a'));
check('empty code', trip('') === '');

// ----- generating from edited graphs
const base = () => C.compile('let x = 1;\nrect(x, 2, 3, 4);\nfill(1);');
check('moving a number is a param change', (() => { const g = base(); g.nodes.find((n) => n.type === 'let').params.value = '99'; return C.generate(g).includes('let x = 99;'); })());
check('rewiring changes the order', (() => {
  const g = base(), [l, r, f] = g.nodes.slice(1);
  g.edges = [{ from: 'start', to: f.id, input: 'flow' }, { from: f.id, to: l.id, input: 'flow' }, { from: l.id, to: r.id, input: 'flow' }];
  return C.generate(g) === 'fill(1);\nlet x = 1;\nrect(x, 2, 3, 4);\n';
})());
check('a node that is not wired in is left out', (() => { const g = base(); g.edges = g.edges.slice(0, 1); return C.generate(g) === 'let x = 1;\n'; })());
check('a circle of wires is an error, not a hang', (() => { const g = base(), [l, r] = g.nodes.slice(1); g.edges.push({ from: r.id, to: l.id, input: 'flow' }); g.edges = g.edges.filter((e) => !(e.from === g.nodes[3].id)); g.edges.push({ from: g.nodes[3].id, to: l.id, input: 'flow' }); try { C.generate(g); return false; } catch (e) { return /circle/.test(e.message) && !!e.nodeId; } })());
check('else without an if is an error', (() => { const g = C.compile('f();\nif (a) { g(); } else { h(); }'); const [f, i, e] = g.nodes.slice(1); g.edges = [{ from: 'start', to: f.id, input: 'flow' }, { from: f.id, to: e.id, input: 'flow' }]; try { C.generate(g); return false; } catch (err) { return /right after/.test(err.message); } })());
check('an edited container body shows up in the code', (() => { const g = C.compile('function draw() {\n  background(0);\n}'); const sub = g.subs[g.nodes[1].id]; sub.nodes[1].params.a0 = '255'; return C.generate(g).includes('background(255);'); })());
check('new nodes get working defaults', (() => { const g = C.compile(''); g.nodes.push({ id: 'z', type: 'call:rect/4', x: 0, y: 0, params: C.defaults('call:rect/4') }); g.edges.push({ from: 'start', to: 'z', input: 'flow' }); return /^rect\(40, 40, 120, 80\);/.test(C.generate(g)); })());
check('every menu entry makes valid code', C.entries().every((e) => { if (e.type === 'elseif' || e.type === 'else') return true; const g = C.compile(''); g.nodes.push({ id: 'z', type: e.type, x: 0, y: 0, params: C.defaults(e.type) }); g.edges.push({ from: 'start', to: 'z', input: 'flow' }); const code = C.generate(g); try { new Function('for(;;){' + code + '}'); return true; } catch (err) { console.log('   ', e.type, JSON.stringify(code)); return false; } }));


// ----- duplicating
check('duplicate copies a container with fresh ids for everything inside', (() => {
  const g = C.compile('function draw() {\n  background(0);\n  circle(1, 2, 3);\n}');
  let k = 100; const c = C.duplicate(g, g, g.nodes[1].id, () => 'n' + ++k);
  const orig = g.subs[g.nodes[1].id], copy = g.subs[c.id];
  const ids = new Set([...orig.nodes, ...copy.nodes].filter((n) => n.id !== 'start').map((n) => n.id));
  return copy.nodes.length === orig.nodes.length && ids.size === (orig.nodes.length - 1) * 2 && copy.edges.length === orig.edges.length;
})());
check('duplicate does nothing for Start', C.duplicate(C.compile('f();'), C.compile('f();'), 'start', () => 'x') === null);

// ----- errors
const err = (s) => { try { C.compile(s); return null; } catch (e) { return e; } };
check('a missing } is reported with a line', (() => { const e = err('function f() {\n  a();\n'); return e && /never closed/.test(e.message); })());
check('an extra } is reported', (() => { const e = err('a();\n}\n'); return e && e.line === 2; })());
check('an unclosed string is reported', !!err("text('abc, 1, 2);"));

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
