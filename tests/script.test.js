// Loom script tests. Run with:  node tests/script.test.js
global.window = global;
require('../src/engine.js');
require('../src/script.js');
require('../src/examples.js');
const L = window.Loom, S = L.script;
let failed = 0;
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); if (!ok) failed++; };
const clone = (o) => JSON.parse(JSON.stringify(o));
const project = (text, base) => { const r = S.compile(text, base); return { nodes: r.nodes, edges: r.edges, subs: r.subs, design: base && base.design }; };
const scene = (p, t = 0.37) => L.evaluate(p, { time: t });
const errorOf = (text) => { try { S.compile(text); return null; } catch (e) { return e; } };

// ----- the example scripts compile and draw what they should
const ex = Object.fromEntries(L.examples.scripts.map((s) => [s.name, s.text]));
const star = project(ex['Star field']);
check('Star field script draws 196 stars', scene(star).geo.length === 196, `${scene(star).geo.length}`);
check('  and uses the same node kinds as the graph example', ['grid', 'noiseField', 'time', 'star', 'copy', 'style', 'output'].every((t) => star.nodes.some((n) => n.type === t)));
const def = project(ex['Your own node (def)']);
check('def makes a custom node (subs has one entry)', Object.keys(def.subs).length === 1);
const sub = Object.values(def.subs)[0];
check('  with count/radius/hue as controls, in order', sub.inputs.map((i) => i.name).join() === 'count,radius,hue');
check('  and defaults from the def line', sub.inputs.find((i) => i.name === 'radius').d === 60);
check('  and three instances draw 12+18+28 = 58 shapes', scene(def).geo.length === 58, `${scene(def).geo.length}`);
check('Cut-outs script gives one compound shape', scene(project(ex['Cut-outs (compound)'])).geo.length === 1);
check('Tidy row script gives three shapes', scene(project(ex['Tidy row (align + distribute)'])).geo.length === 3);

// every script example compiles and draws something at more than one moment
for (const s of L.examples.scripts) {
  let ok = true, why = '';
  try { const p = project(s.text); for (const t of [0, 1.7]) { const n = scene(p, t).geo.length; if (n < 1) { ok = false; why = `nothing drawn at t=${t}`; } } } catch (e) { ok = false; why = e.message + (e.line ? ` (line ${e.line})` : ''); }
  check(`script example draws: ${s.name}`, ok, why);
}

// ----- language features
const gm = (text) => scene(project(text)).geo.length;
check('math operators build math nodes with precedence', (() => { const p = project('let a = 2 + 3 * 4\nrect(a, 10) |> output()'); return scene(p).geo[0].w === 14; })());
check('parentheses and unary minus', (() => { const p = project('rect((2 + 3) * -4 + 30, 10) |> output()'); return scene(p).geo[0].w === 10; })());
check('constant arithmetic is folded (no math node)', !project('rect(2 * 50, 10) |> output()').nodes.some((n) => n.type === 'math'));
check('power is right-associative', scene(project('rect(2 ^ 3 ^ 2 - 500, 10) |> output()')).geo[0].w === 12);
check('named and positional arguments mix', gm('grid(3, rows: 2) |> copy(rect(5, 5)) |> output()') === 6);
check('pipe continues across lines; comments and semicolons work', gm('rect(5,5) // a comment\n  |> output(); ') === 1);
check('a def can use math on its parameter', gm('def twice(n = 3) = ring(n * 2, 50) |> copy(rect(4, 4))\ntwice(5) |> output()') === 10);
check('a parameter used in two places', gm('def f(n = 2) { let p = grid(n, n)\n p |> copy(rect(3, 3)) }\nf(4) |> output()') === 16);
check('values can be reused (shared node)', (() => { const p = project('let p = grid(2, 2)\nmerge(p |> copy(rect(1, 1)), p |> copy(ellipse(2, 2))) |> output()'); return p.nodes.filter((n) => n.type === 'grid').length === 1 && gm('let p = grid(2, 2)\nmerge(p |> copy(rect(1, 1)), p |> copy(ellipse(2, 2))) |> output()') === 8; })());
check('script with only an output() works', gm('output()') === 0);
check('empty script gives an empty sketch', gm('') === 0);

// ----- friendly errors with line numbers
const e1 = errorOf('grid(3,3)\n  |> cpoy(rect(1,1))\n  |> output()');
check('unknown node: message, suggestion, line', e1 && /cpoy/.test(e1.message) && /Did you mean “copy”/.test(e1.message) && e1.line === 2, e1 && `L${e1.line}: ${e1.message}`);
const e2 = errorOf('grid(colz: 3) |> output()');
check('unknown input suggests the right name', e2 && /“colz”/.test(e2.message) && /cols/.test(e2.message), e2 && e2.message);
const e3 = errorOf('rect(10, 10) |> copy(rect(1,1)) |> output()');
check('wrong kind of value is explained', e3 && /points|shapes/.test(e3.message), e3 && e3.message);
const e4 = errorOf('grid(2, 2) |> rect() |> output()');
check('a value with nowhere to go is explained', e4 && /nowhere/.test(e4.message), e4 && e4.message);
check('numbers can be piped into number inputs (goes to the first free one)', (() => { const p = project('time(2) |> grid() |> copy(rect(1,1)) |> output()'); return p.edges.some((e) => e.input === 'cols' && p.nodes.find((n) => n.id === e.from).type === 'time'); })());
const e5 = errorOf('rect(10, 10\n|> output()');
check('unclosed bracket is reported', e5 && /closed|Expected/.test(e5.message), e5 && e5.message);
const e6 = errorOf('align(halign: lefft)');
check('bad choice lists the options', e6 && /center, left, right, none/.test(e6.message) && /left/.test(e6.message), e6 && e6.message);
check('last line must make shapes', /should make shapes/.test((errorOf('grid(2,2)') || {}).message || ''));
check('typo in a variable name is caught', /don't know the name/.test((errorOf('let a = 5\nrect(b, 2) |> output()') || {}).message || ''));
check('two outputs rejected', /one output/.test((errorOf('let a = rect(1,1) |> output()\nrect(2,2) |> output()') || {}).message || ''));
check('stray value on its own line is explained', /nothing uses it/.test((errorOf('rect(1,1)\nrect(2,2) |> output()') || {}).message || ''));

// ----- decompile -> compile round trip for every built-in example graph
const same = (a, b) => JSON.stringify(a.geo) === JSON.stringify(b.geo) && a.bg === b.bg;
for (const ex1 of L.examples.nodes.concat(L.examples.designs)) {
  const orig = clone(ex1.graph); const hasSvg = orig.nodes.some((n) => n.type === 'svg'); // svg parsing needs a browser (DOMParser)
  let text, back, ok = true, why = '';
  try {
    text = S.decompile(orig); back = project(text, orig);
    const text2 = S.decompile(back);
    if (text2 !== text) { ok = false; why = 'text is not stable after a second pass'; }
    if (!hasSvg) { for (const t of [0, 0.37, 1.3]) { if (!same(scene(orig, t), scene(back, t))) { ok = false; why = `drawing differs at t=${t}`; break; } } }
  } catch (e) { ok = false; why = e.message + (e.line ? ` (line ${e.line})` : ''); }
  check(`round trip: ${ex1.name}`, ok, why);
}

// text -> graph -> text is stable too, for every script example
for (const s of L.examples.scripts) {
  const t1 = S.decompile(project(s.text)), t2 = S.decompile(project(t1));
  check(`text is stable: ${s.name}`, t1 === t2, t1 === t2 ? '' : '\n' + t1 + '\n---\n' + t2);
}

// ----- special data (drawn paths) is kept through id:
{
  const orig = { nodes: [{ id: 'd1', type: 'draw', x: 0, y: 0, params: { path: { closed: true, pts: [{ x: 0, y: -50 }, { x: 40, y: 40 }, { x: -40, y: 40 }] } } }, { id: 'o', type: 'output', x: 0, y: 0, params: {} }], edges: [{ from: 'd1', to: 'o', input: 'geo' }] };
  const text = S.decompile(orig), back = project(text, orig);
  check('drawn shapes survive a text round trip via id:', /draw\(id: "d1"\)/.test(text) && back.nodes.find((n) => n.type === 'draw').params.path.pts.length === 3, text.trim());
}

// ----- the reference lists every node
const refs = S.reference({});
check('reference covers every node', Object.keys(L.NODES).every((k) => refs.some((r) => r.name === k)));

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
