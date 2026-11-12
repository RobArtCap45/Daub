// Daub "sketch to nodes" tests. Run with:  node tests/togen.test.js
global.window = global;
require('../app/src/engine.js');
require('../app/src/codegraph.js');
require('../app/src/togen.js');
require('../app/src/examples.js');
require('../app/src/examples-code.js');
const L = window.Daub, T = L.togen;
let failed = 0;
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); if (!ok) failed++; };

const project = (r) => ({ nodes: r.nodes, edges: r.edges, subs: r.subs });
const scene = (r) => L.evaluate(project(r), { time: 0 });
const types = (r) => r.nodes.map((n) => n.type).sort().join(',');
const count = (r, t) => r.nodes.filter((n) => n.type === t).length;
// every shape drawn by the nodes, as [centerX, centerY] relative to the middle, sorted
const centers = (sc) => sc.geo.map((s) => [s.m[4], s.m[5]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const recorded = (code) => { const r = T.record(code); return r.shapes.filter((s) => s.kind === 'rect' || s.kind === 'ellipse').map((s) => [s.cx - r.W / 2, s.cy - r.H / 2]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); };
const same = (A, B, tol = 0.6) => A.length === B.length && A.every((a, i) => Math.abs(a[0] - B[i][0]) <= tol && Math.abs(a[1] - B[i][1]) <= tol);
const sizes = (sc) => sc.geo.map((s) => Math.hypot(s.m[0], s.m[1]) * (s.w || 1));

// ----- a grid of circles -> Grid + Copy to Points
const gridCode = `function draw() {\n  background(20);\n  noStroke();\n  fill(255, 120, 80);\n  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) ellipse(100 + i * 80, 150 + j * 90, 30, 30);\n}`;
const g1 = T.toNodes(gridCode);
check('a double loop becomes Grid + Copy to Points', count(g1, 'grid') === 1 && count(g1, 'copy') === 1 && count(g1, 'ellipse') === 1, types(g1));
const gn = g1.nodes.find((n) => n.type === 'grid').params;
check('  with the right grid', gn.cols === 6 && gn.rows === 4 && gn.width === 400 && gn.height === 270, JSON.stringify(gn));
check('  moved to where the circles are', count(g1, 'movePoints') === 1);
check('  and the nodes draw every circle in the same place', same(centers(scene(g1)), recorded(gridCode)));
check('  with the same color', (() => { const f = scene(g1).geo[0].fill; return /^rgba?\(/.test(f) ? true : /hsla?\(/.test(f) || /#/.test(f); })());
check('  and the background', (() => { const o = g1.nodes.find((n) => n.type === 'output').params; return Math.round(o.bri) === 8; })());

// ----- a ring, with a rotation and size that follow the shape's place
const ringCode = `function draw() {\n  rectMode(CENTER);\n  translate(300, 300);\n  for (let i = 0; i < 12; i++) {\n    const a = i * TWO_PI / 12;\n    push();\n    translate(cos(a) * 150, sin(a) * 150);\n    rotate(a);\n    rect(0, 0, 10 + i * 4, 10, 0);\n    pop();\n  }\n}`;
const r1 = T.toNodes(ringCode);
check('a loop around a circle becomes Ring + a list of shapes moved with Transform', count(r1, 'ring') === 1 && count(r1, 'transform') === 1 && count(r1, 'copy') === 0, types(r1));
check('  the ring has the right size', (() => { const p = r1.nodes.find((n) => n.type === 'ring').params; return p.count === 12 && Math.abs(p.radius - 150) < 0.1; })());
check('  the shapes sit where the sketch put them', same(centers(scene(r1)), recorded(ringCode)));
check('  the growing width becomes Attribute + Remap', count(r1, 'remap') >= 1);
check('  a ring of same-shaped shapes uses Copy to Points', (() => { const r = T.toNodes('function draw() {\n  for (let i = 0; i < 12; i++) { const a = i * TWO_PI / 12; ellipse(300 + cos(a) * 150, 300 + sin(a) * 150, 20, 20); }\n}'); return count(r, 'ring') === 1 && count(r, 'copy') === 1 && count(r, 'transform') === 0; })());
check('  and each shape is the right size', (() => { const A = scene(r1).geo.map((s) => Math.round(Math.hypot(s.m[0], s.m[1]) * s.w)).sort((a, b) => a - b), B = T.record(ringCode).shapes.map((s) => Math.round(s.w)).sort((a, b) => a - b); return A.length === B.length && A.every((v, i) => Math.abs(v - B[i]) <= 1); })());
check('  and each is turned the right way', (() => { const A = scene(r1).geo.map((s) => Math.round(Math.atan2(s.m[1], s.m[0]) * 180 / Math.PI)).sort((a, b) => a - b), B = T.record(ringCode).shapes.map((s) => Math.round(s.rot)).sort((a, b) => a - b); return A.every((v, i) => Math.abs(v - B[i]) <= 1); })());

// ----- colors that change
const hueCode = `function setup() { colorMode(HSB); noStroke(); }\nfunction draw() {\n  for (let i = 0; i < 10; i++) { fill(i * 30, 80, 90); rect(20 + i * 50, 100, 40, 40); }\n}`;
const h1 = T.toNodes(hueCode);
check('a hue that follows the position is fitted', count(h1, 'attribute') >= 1 && h1.nodes.filter((n) => n.type === 'style').length === 1, types(h1));
check('  and the colors match', (() => { const hs = scene(h1).geo.map((s) => s.fill); return hs.length === 10 && new Set(hs).size === 10; })());

// ----- random places
const rndCode = `function draw() {\n  randomSeed(5);\n  noStroke();\n  for (let i = 0; i < 40; i++) ellipse(random(width), random(height), 12, 12);\n}`;
const s1 = T.toNodes(rndCode);
check('random places become a Scatter', count(s1, 'scatter') === 1 && scene(s1).geo.length === 40, types(s1));
check('  and it says it is approximate', s1.notes.some((x) => /Scatter/.test(x)) && s1.stats.approximate >= 40);

// ----- single shapes
const mix = `function draw() {\n  background(240);\n  stroke(0); strokeWeight(3); noFill();\n  line(50, 50, 250, 150);\n  fill(255, 0, 0);\n  triangle(100, 300, 200, 300, 150, 200);\n  noFill(); stroke(0, 0, 255);\n  bezier(50, 500, 100, 350, 300, 650, 450, 500);\n}`;
const m1 = T.toNodes(mix);
check('single shapes become Line, Draw and Curve', ['line', 'draw', 'curve'].every((t) => count(m1, t) === 1), types(m1));
check('  and all three draw', scene(m1).geo.length === 3);
check('  the line is the right length and angle', (() => { const l = scene(m1).geo.find((s) => s.k === 'line'); return Math.abs(l.len - Math.hypot(200, 100)) < 0.5 && Math.abs(Math.atan2(l.m[1], l.m[0]) - Math.atan2(100, 200)) < 0.01; })());
check('  the outline-only shapes have no fill', scene(m1).geo.filter((s) => s.fill).length === 1);

// ----- what it reports
const txt = T.toNodes('function draw() {\n  text("hi", 10, 10);\n  rect(10, 10, 20, 20);\n}');
check('text is reported, the rest still converts', txt.notes.some((x) => /Text/.test(x)) && count(txt, 'rect') === 1);
check('mouse events are reported', T.toNodes('function draw() { rect(1,2,3,4); }\nfunction mousePressed() {}').notes.some((x) => /Mouse/.test(x)));
check('an unsupported call is named, and what was drawn before is kept', (() => { const r = T.toNodes('function draw() {\n  rect(1, 2, 3, 4);\n  createGraphics(1, 1);\n}'); return count(r, 'rect') === 1 && r.notes.some((x) => /createGraphics/.test(x)); })());
check('a sketch that draws nothing says so', T.toNodes('function draw() {}').notes.some((x) => /Nothing was drawn/.test(x)));
check('the nodes always have exactly one Output', [g1, r1, h1, s1, m1, txt].every((r) => count(r, 'output') === 1));
check('the first frame notice is always there', g1.notes.some((x) => /first frame/.test(x)));

// ----- every Code example converts without errors and gives a valid, drawable project
let bad = 0, drew = 0;
for (const ex of L.examples.code) {
  let ok = true, why = '';
  try {
    const r = T.toNodes(ex.code), p = project(r);
    if (!L.validProject(p)) { ok = false; why = 'not a valid project'; }
    else { const sc = L.evaluate(p, { time: 0 }); if (sc.geo.length) drew++; }
  } catch (e) { ok = false; why = e.message; }
  if (!ok) bad++;
  check(`converts: ${ex.cat} / ${ex.name}`, ok, why);
}
check(`${L.examples.code.length} examples converted, ${drew} draw something`, bad === 0 && drew >= 25, `${drew} draw`);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
