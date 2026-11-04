// Engine tests. Run with:  node tests/engine.test.js
global.window = global;
require('../src/engine.js');
const L = window.Loom;
let failed = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); if (!ok) failed++; };

// ----- helpers
const run = (type, params = {}, extra = {}) => { const d = L.NODES[type]; const inp = {}; d.inputs.forEach((s) => { inp[s.n] = params[s.n] ?? s.d; }); Object.assign(inp, extra); return d.run(inp, { time: 0 }); };
const place = (shapes, x, y) => shapes.map((s) => ({ ...s, m: [1, 0, 0, 1, x, y] }));
const rect = (x, y, w, h) => place(run('rect', { w, h }), x + w / 2, y + h / 2)[0];
const circle = (cx, cy, r) => place(run('ellipse', { w: r * 2, h: r * 2 }), cx, cy)[0];
const ringsOf = (shapes) => shapes.flatMap((s) => L.flatten(L.bakeCmds(s), 32).filter((c) => c.closed).map((c) => c.pts.slice(0, -1)));
const shoelace = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const area = (shapes) => Math.abs(ringsOf(shapes).reduce((a, r) => a + shoelace(r), 0));
const compound = (A, B, op) => run('compound', { op }, { geo: A, with: B });

// ----- Compound: exact areas
const A = rect(0, 0, 2, 2), B = rect(1, 1, 2, 2);
check('union of overlapping squares = 7', near(area(compound([A], [B], 'union')), 7, 1e-6));
check('subtract = 3', near(area(compound([A], [B], 'subtract')), 3, 1e-6));
check('intersect = 1', near(area(compound([A], [B], 'intersect')), 1, 1e-6));
check('xor = 6', near(area(compound([A], [B], 'xor')), 6, 1e-6));

const big = rect(-100, -100, 200, 200), hole = circle(0, 0, 50);
const donut = compound([big], [hole], 'subtract');
const circArea = area([hole]);
check('square minus circle has a hole (2 rings)', ringsOf(donut).length === 2);
check('square minus circle area', near(area(donut), 40000 - circArea, 1), `got ${area(donut).toFixed(1)} want ${(40000 - circArea).toFixed(1)}`);
check('circle area close to pi r^2', near(circArea, Math.PI * 2500, Math.PI * 2500 * 0.003));

check('identical squares union = one square', near(area(compound([A], [rect(0, 0, 2, 2)], 'union')), 4, 1e-6));
const touch = compound([rect(0, 0, 2, 2)], [rect(2, 0, 2, 2)], 'union');
check('touching squares merge into one ring', ringsOf(touch).length === 1 && near(area(touch), 8, 1e-6), `${ringsOf(touch).length} ring(s), ${ringsOf(touch)[0] && ringsOf(touch)[0].length} points`);
check('disjoint union keeps two rings', ringsOf(compound([A], [rect(10, 10, 2, 2)], 'union')).length === 2);
check('subtract identical = empty', compound([A], [rect(0, 0, 2, 2)], 'subtract').length === 0);
check('intersect of disjoint = empty', compound([A], [rect(10, 10, 2, 2)], 'intersect').length === 0);

// no "with" input: fold across the list
check('merge overlapping list (union fold)', near(area(compound([A, B, rect(2, 2, 2, 2)], [], 'union')), 4 + 4 + 4 - 1 - 1, 1e-6), `got ${area(compound([A, B, rect(2, 2, 2, 2)], [], 'union')).toFixed(2)}`);
check('first minus the rest (subtract fold)', near(area(compound([rect(0, 0, 4, 4), rect(0, 0, 2, 2), rect(2, 2, 2, 2)], [], 'subtract')), 8, 1e-6));
check('group minus shape', near(area(compound([A, rect(4, 0, 2, 2)], [rect(0, 0, 6, 1)], 'subtract')), 4, 1e-6));

// rotated + curved inputs
const star = place(run('star', { points: 5, outer: 100, inner: 40 }), 0, 0);
const inter = compound(star, [circle(0, 0, 60)], 'intersect');
check('star ∩ circle is non-empty and smaller than both', area(inter) > 0 && area(inter) < circArea * 1.5 && area(inter) < area(star) + 1);
const t0 = Date.now(); compound([circle(0, 0, 100)], [circle(60, 0, 100)], 'union'); const dt = Date.now() - t0;
check('two 128-gon circles combine quickly', dt < 400, `${dt} ms`);

// randomized property test (seeded): the boolean ops must agree with each other on area
{
  const rand = L.mulberry32(7), rnd = (a, b) => a + rand() * (b - a); let worst = 0, bad = 0;
  const mk = () => {
    const kind = ['star', 'polygon', 'rect', 'ellipse'][Math.floor(rand() * 4)];
    const s = run(kind, { points: Math.floor(rnd(3, 9)), outer: rnd(40, 120), inner: rnd(15, 60), sides: Math.floor(rnd(3, 9)), radius: rnd(40, 120), w: rnd(50, 200), h: rnd(50, 200) })[0];
    const a = rnd(0, 6.28), c = Math.cos(a), sn = Math.sin(a); return [{ ...s, m: [c, sn, -sn, c, rnd(-60, 60), rnd(-60, 60)] }];
  };
  for (let k = 0; k < 300; k++) {
    const P = mk(), Q = mk(), f = (op) => area(compound(P, Q, op));
    const aP = area(P), aQ = area(Q), u = f('union'), i = f('intersect'), d = f('subtract'), x = f('xor');
    const err = Math.max(Math.abs(u + i - aP - aQ), Math.abs(d - (aP - i)), Math.abs(x - (u - i))) / Math.max(aP, aQ); worst = Math.max(worst, err); if (err > 0.002) bad++;
  }
  check('300 random shape pairs: |A∪B|+|A∩B|=|A|+|B|, |A−B|=|A|−|A∩B|, xor=|A∪B|−|A∩B|', bad === 0, `worst relative error ${(worst * 100).toFixed(5)}%`);
}

// ----- Align / Distribute
const r1 = rect(-50, 10, 20, 10), r2 = rect(30, -40, 40, 30);
const aligned = run('align', { halign: 'left', valign: 'top', x: 0, y: 0, mode: 'group' }, { geo: [r1, r2] });
const ab = L.shapeBounds; const gb = aligned.map(ab);
check('align group left/top puts the union at the origin', near(Math.min(...gb.map((b) => b.x0)), 0, 1e-6) && near(Math.min(...gb.map((b) => b.y0)), 0, 1e-6));
const alignedEach = run('align', { halign: 'center', valign: 'middle', x: 5, y: 7, mode: 'each' }, { geo: [r1, r2] });
check('align each centers every shape', alignedEach.every((s) => { const b = ab(s); return near((b.x0 + b.x1) / 2, 5, 1e-6) && near((b.y0 + b.y1) / 2, 7, 1e-6); }));
const none = run('align', { halign: 'none', valign: 'top', x: 0, y: 0, mode: 'each' }, { geo: [r1] });
check('align "none" leaves that axis alone', near(ab(none[0]).x0, ab(r1).x0, 1e-9));

const sq = [rect(0, 0, 10, 10), rect(100, 50, 10, 10), rect(7, -30, 10, 10)];
const dist = run('distribute', { axis: 'horizontal', gap: 5, center: 0 }, { geo: sq }), db = dist.map(ab);
check('distribute horizontal: gaps are 5', near(db[1].x0 - db[0].x1, 5, 1e-6) && near(db[2].x0 - db[1].x1, 5, 1e-6));
check('distribute centers the row on the center value', near((db[0].x0 + db[2].x1) / 2, 0, 1e-6));
check('distribute keeps the other axis', near(db[1].y0, 50, 1e-6) && near(db[2].y0, -30, 1e-6));
const spread = run('distribute', { axis: 'vertical', span: 200, center: 0 }, { geo: sq }), sb = spread.map(ab);
check('distribute across a span: ends at ±100', near(sb[0].y0, -100, 1e-6) && near(sb[2].y1, 100, 1e-6), `${sb[0].y0.toFixed(1)}..${sb[2].y1.toFixed(1)}`);

// ----- through the graph, with custom nodes still working
const N = (id, type, params = {}) => ({ id, type, x: 0, y: 0, params });
const g = { nodes: [N('r', 'rect', { w: 100, h: 100 }), N('e', 'ellipse', { w: 60, h: 60 }), N('c', 'compound', { op: 'subtract' }), N('o', 'output')], edges: [{ from: 'r', to: 'c', input: 'geo' }, { from: 'e', to: 'c', input: 'with' }, { from: 'c', to: 'o', input: 'geo' }] };
const scene = L.evaluate(g, { time: 0 });
check('compound works inside a graph', scene.geo.length === 1 && scene.geo[0].k === 'path');
check('SVG export of a compound path', /<path d="M [^"]+ Z"/.test(L.toSVG(scene, 600, 600)));

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
