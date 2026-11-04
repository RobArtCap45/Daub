/* Built-in examples: node graphs and code sketches. */
(function (g) {
  'use strict';
  // N(id, type, x, y, params) and E(from, to, input) keep the graphs compact.
  const N = (id, type, x, y, params = {}) => ({ id, type, x, y, params });
  const E = (from, to, input) => ({ from, to, input });
  const OUT = (x, y, params) => N('out', 'output', x, y, params);

  const nodes = [
    {
      name: 'Star field', graph: {
        nodes: [
          N('a', 'grid', 0, 0, { cols: 14, rows: 14, width: 460, height: 460 }), N('t', 'time', 0, 250, { speed: 0.3 }),
          N('b', 'noiseField', 250, 0, { scale: 0.004 }), N('s', 'star', 250, 210, { points: 5, outer: 22, inner: 10 }),
          N('m1', 'math', 250, 360, { b: 2.2, op: 'mul' }), N('m2', 'math', 250, 480, { b: 720, op: 'mul' }), N('m3', 'math', 500, 200, { b: 300, op: 'mul' }),
          N('c', 'copy', 500, 0), N('st', 'style', 740, 0, { sat: 70, bri: 100, alpha: 0.95 }), OUT(980, 0, { bri: 6 })],
        edges: [E('a', 'b', 'pts'), E('t', 'b', 'time'), E('b', 'm1', 'a'), E('b', 'm2', 'a'), E('b', 'm3', 'a'), E('s', 'c', 'geo'), E('a', 'c', 'pts'),
          E('m1', 'c', 'scale'), E('m2', 'c', 'rotate'), E('c', 'st', 'geo'), E('m3', 'st', 'hue'), E('st', 'out', 'geo')],
      },
    },
    {
      name: 'Breathing ring', graph: {
        nodes: [
          N('r', 'ring', 0, 0, { count: 36, radius: 190 }), N('i', 'attribute', 0, 130, { attr: 'index' }), N('t', 'time', 0, 230, { speed: 6 }),
          N('add', 'math', 220, 130, { op: 'add' }), N('w', 'wave', 220, 260, { period: 36, amplitude: 0.8, offset: 1.1 }),
          N('e', 'ellipse', 220, 440, { w: 50, h: 50 }), N('h', 'math', 460, 130, { b: 10, op: 'mul' }),
          N('c', 'copy', 460, 0), N('st', 'style', 700, 0, { sat: 60, bri: 100, alpha: 0.8 }), OUT(940, 0, { bri: 8 })],
        edges: [E('r', 'i', 'pts'), E('i', 'add', 'a'), E('t', 'add', 'b'), E('add', 'w', 'value'), E('e', 'c', 'geo'), E('r', 'c', 'pts'), E('w', 'c', 'scale'),
          E('i', 'h', 'a'), E('c', 'st', 'geo'), E('h', 'st', 'hue'), E('st', 'out', 'geo')],
      },
    },
    {
      name: 'Flow lines', graph: {
        nodes: [
          N('a', 'grid', 0, 0, { cols: 22, rows: 22, width: 500, height: 500 }), N('t', 'time', 0, 250, { speed: 0.2 }),
          N('b', 'noiseField', 240, 0, { scale: 0.006 }), N('l', 'line', 240, 220, { length: 22 }),
          N('m1', 'math', 240, 330, { b: 900, op: 'mul' }), N('m2', 'math', 480, 200, { b: 200, op: 'mul' }),
          N('c', 'copy', 480, 0), N('st', 'style', 720, 0, { hue: 200, sat: 70, bri: 100, alpha: 0, strokeW: 3, strokeBri: 100 }), OUT(960, 0, { bri: 8 })],
        edges: [E('a', 'b', 'pts'), E('t', 'b', 'time'), E('b', 'm1', 'a'), E('b', 'm2', 'a'), E('l', 'c', 'geo'), E('a', 'c', 'pts'), E('m1', 'c', 'rotate'),
          E('c', 'st', 'geo'), E('m2', 'st', 'hue'), E('st', 'out', 'geo')],
      },
    },
    {
      name: 'Petal mandala', graph: {
        nodes: [
          N('r', 'ring', 0, 0, { count: 18, radius: 40 }), N('an', 'attribute', 0, 130, { attr: 'angle' }), N('deg', 'math', 220, 130, { b: 57.2958, op: 'mul' }),
          N('e', 'ellipse', 220, 260, { w: 220, h: 60 }), N('c', 'copy', 440, 0), N('t', 'time', 440, 200, { speed: 12 }),
          N('st', 'style', 680, 0, { hue: 330, sat: 55, bri: 100, alpha: 0.22, strokeW: 1.5, strokeBri: 100 }),
          N('tr', 'transform', 920, 0), OUT(1160, 0, { hue: 260, sat: 40, bri: 10 })],
        edges: [E('r', 'an', 'pts'), E('an', 'deg', 'a'), E('e', 'c', 'geo'), E('r', 'c', 'pts'), E('deg', 'c', 'rotate'), E('c', 'st', 'geo'),
          E('st', 'tr', 'geo'), E('t', 'tr', 'rotate'), E('tr', 'out', 'geo')],
      },
    },
    {
      name: 'Confetti', graph: {
        nodes: [
          N('p', 'scatter', 0, 0, { count: 260, width: 520, height: 520, seed: 4 }), N('rs', 'random', 0, 140, { count: 260, min: 0.3, max: 1.6, seed: 2 }),
          N('rr', 'random', 0, 280, { count: 260, min: 0, max: 360, seed: 3 }), N('rh', 'random', 0, 420, { count: 260, min: 0, max: 360, seed: 9 }),
          N('sh', 'rect', 240, 0, { w: 30, h: 12, round: 4 }), N('c', 'copy', 480, 0), N('st', 'style', 720, 0, { sat: 65, bri: 100, alpha: 0.9 }), OUT(960, 0, { bri: 9 })],
        edges: [E('sh', 'c', 'geo'), E('p', 'c', 'pts'), E('rs', 'c', 'scale'), E('rr', 'c', 'rotate'), E('c', 'st', 'geo'), E('rh', 'st', 'hue'), E('st', 'out', 'geo')],
      },
    },
    {
      name: 'Blob (bezier)', graph: {
        nodes: [
          N('r', 'ring', 0, 0, { count: 9, radius: 140 }), N('t', 'time', 0, 150, { speed: 0.4 }), N('t2', 'math', 0, 250, { a: 0, b: 40, op: 'add' }),
          N('nx', 'noiseField', 210, 0, { scale: 0.012 }), N('ny', 'noiseField', 210, 190, { scale: 0.012 }),
          N('rx', 'remap', 410, 0, { inMin: 0, inMax: 1, outMin: -60, outMax: 60 }), N('ry', 'remap', 410, 190, { inMin: 0, inMax: 1, outMin: -60, outMax: 60 }),
          N('mv', 'movePoints', 610, 0), N('cn', 'connect', 790, 0, { close: 1, smooth: 1 }),
          N('st', 'style', 970, 0, { hue: 340, sat: 55, bri: 100, alpha: 0.9, strokeW: 3, strokeBri: 100 }), OUT(1190, 0, { hue: 260, sat: 40, bri: 12 })],
        edges: [E('r', 'nx', 'pts'), E('r', 'ny', 'pts'), E('t', 'nx', 'time'), E('t', 't2', 'a'), E('t2', 'ny', 'time'), E('nx', 'rx', 'value'), E('ny', 'ry', 'value'),
          E('r', 'mv', 'pts'), E('rx', 'mv', 'dx'), E('ry', 'mv', 'dy'), E('mv', 'cn', 'pts'), E('cn', 'st', 'geo'), E('st', 'out', 'geo')],
      },
    },
    {
      name: 'Dots on a curve', graph: {
        nodes: [
          N('cu', 'curve', 0, 0, { x1: -230, y1: 120, cx1: -120, cy1: -280, cx2: 120, cy2: 320, x2: 230, y2: -120 }),
          N('pp', 'pathPoints', 280, 0, { count: 38 }), N('u', 'attribute', 280, 150, { attr: 'u' }), N('wv', 'wave', 500, 150, { period: 1, amplitude: 0.8, offset: 1 }),
          N('e', 'ellipse', 280, 300, { w: 26, h: 26 }),
          N('cp', 'copy', 740, 0), N('hu', 'math', 500, 330, { b: 300, op: 'mul' }),
          N('st', 'style', 980, 0, { sat: 60, bri: 100, alpha: 0.9 }), OUT(1220, 0, { bri: 8 })],
        edges: [E('cu', 'pp', 'geo'), E('pp', 'u', 'pts'), E('u', 'wv', 'value'), E('u', 'hu', 'a'), E('e', 'cp', 'geo'), E('pp', 'cp', 'pts'), E('wv', 'cp', 'scale'),
          E('cp', 'st', 'geo'), E('hu', 'st', 'hue'), E('st', 'out', 'geo')],
      },
    },
    {
      name: 'Custom nodes', graph: {
        nodes: [
          N('p1', 'sub:petal', 0, 0, { count: 12, radius: 50, hue: 0 }), N('p2', 'sub:petal', 0, 170, { count: 18, radius: 110, hue: 200 }),
          N('p3', 'sub:petal', 0, 340, { count: 28, radius: 170, hue: 300 }), N('m', 'merge', 280, 120), OUT(520, 120, { bri: 8 })],
        edges: [E('p1', 'm', 'a'), E('p2', 'm', 'b'), E('p3', 'm', 'c'), E('m', 'out', 'geo')],
        subs: {
          petal: {
            name: 'Petal ring',
            nodes: [N('r', 'ring', 0, 0, { count: 12, radius: 60 }), N('an', 'attribute', 0, 130, { attr: 'degrees' }), N('e', 'ellipse', 220, 150, { w: 70, h: 22 }),
              N('c', 'copy', 440, 0), N('st', 'style', 680, 0, { hue: 0, sat: 55, bri: 100, alpha: 0.3, strokeW: 1.2, strokeBri: 100 })],
            edges: [E('r', 'an', 'pts'), E('e', 'c', 'geo'), E('r', 'c', 'pts'), E('an', 'c', 'rotate'), E('c', 'st', 'geo')],
            inputs: [{ name: 'count', node: 'r', input: 'count', t: 'num', d: 12 }, { name: 'radius', node: 'r', input: 'radius', t: 'num', d: 60 }, { name: 'hue', node: 'st', input: 'hue', t: 'num', d: 0 }],
            out: 'st',
          },
        },
      },
    },
    {
      name: 'Your artwork (SVG)', graph: {
        nodes: [
          N('art', 'svg', 0, 0, { size: 70, keepColors: 1, svgName: 'sample.svg', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 5 C60 30 90 35 95 50 C90 65 60 70 50 95 C40 70 10 65 5 50 C10 35 40 30 50 5 Z" fill="#e8483a"/><circle cx="50" cy="50" r="12" fill="#ffffff"/></svg>' }),
          N('g', 'grid', 0, 150, { cols: 6, rows: 6, width: 420, height: 420 }), N('nf', 'noiseField', 240, 150, { scale: 0.006, amount: 1 }),
          N('rot', 'math', 460, 150, { b: 360, op: 'mul' }), N('c', 'copy', 460, 0), OUT(700, 0, { hue: 40, sat: 8, bri: 94 })],
        edges: [E('g', 'nf', 'pts'), E('nf', 'rot', 'a'), E('art', 'c', 'geo'), E('g', 'c', 'pts'), E('rot', 'c', 'rotate'), E('c', 'out', 'geo')],
      },
    },
    {
      name: 'Drawn petals', graph: {
        nodes: [
          N('d', 'draw', 0, 0, { path: { closed: true, pts: [{ x: 0, y: -100, ix: 0, iy: 0, ox: 0, oy: 0 }, { x: 0, y: 100, ix: 90, iy: -10, ox: -90, oy: -10 }] } }),
          N('r', 'ring', 0, 150, { count: 14, radius: 120 }), N('an', 'attribute', 240, 150, { attr: 'degrees' }), N('t', 'time', 240, 280, { speed: 8 }),
          N('c', 'copy', 480, 0, { scale: 0.5 }), N('st', 'style', 720, 0, { hue: 330, sat: 55, bri: 100, alpha: 0.35, strokeW: 1.5, strokeBri: 100 }),
          N('tr', 'transform', 960, 0), OUT(1200, 0, { hue: 260, sat: 40, bri: 10 })],
        edges: [E('d', 'c', 'geo'), E('r', 'an', 'pts'), E('r', 'c', 'pts'), E('an', 'c', 'rotate'), E('c', 'st', 'geo'), E('st', 'tr', 'geo'), E('t', 'tr', 'rotate'), E('tr', 'out', 'geo')],
      },
    },
    {
      name: 'Cut-outs (Compound)', graph: {
        nodes: [
          N('sq', 'rect', 0, 0, { w: 380, h: 380, round: 50 }), N('r', 'ring', 0, 150, { count: 8, radius: 105 }), N('e', 'ellipse', 0, 300, { w: 100, h: 100 }),
          N('c', 'copy', 250, 150), N('t', 'time', 250, 330, { speed: 20 }), N('tr', 'transform', 480, 150), N('cp', 'compound', 710, 0, { op: 'subtract' }),
          N('st', 'style', 940, 0, { hue: 12, sat: 70, bri: 100 }), OUT(1170, 0, { hue: 30, sat: 10, bri: 94 })],
        edges: [E('e', 'c', 'geo'), E('r', 'c', 'pts'), E('c', 'tr', 'geo'), E('t', 'tr', 'rotate'), E('sq', 'cp', 'geo'), E('tr', 'cp', 'with'), E('cp', 'st', 'geo'), E('st', 'out', 'geo')],
      },
    },
    {
      name: 'Tidy row (Align + Distribute)', graph: {
        nodes: [
          N('a', 'rect', 0, 0, { w: 70, h: 110, round: 10 }), N('b', 'ellipse', 0, 150, { w: 120, h: 80 }), N('c', 'star', 0, 290, { points: 5, outer: 70, inner: 30 }),
          N('m', 'merge', 250, 120), N('di', 'distribute', 470, 0, { axis: 'horizontal', gap: 24 }),
          N('al', 'align', 700, 0, { halign: 'none', valign: 'middle', mode: 'each', y: 0 }), N('st', 'style', 930, 0, { hue: 200, sat: 55, bri: 100, alpha: 0.95 }), OUT(1160, 0, { bri: 8 })],
        edges: [E('a', 'm', 'a'), E('b', 'm', 'b'), E('c', 'm', 'c'), E('m', 'di', 'geo'), E('di', 'al', 'geo'), E('al', 'st', 'geo'), E('st', 'out', 'geo')],
      },
    },
    { name: 'Blank', graph: { nodes: [OUT(0, 0)], edges: [] } },
  ];

  const code = [
    {
      name: 'Flow field', code: `// Colors: HSB mode -> hue 0-360, saturation 0-100, brightness 0-100, alpha 0-1
function setup() {
  colorMode(HSB);
}

function draw() {
  background(0, 0, 8);
  noStroke();
  const n = 24;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = (i + 0.5) * width / n;
      const y = (j + 0.5) * height / n;
      const a = noise(i * 0.15, j * 0.15, frameCount * 0.01) * TWO_PI * 2;
      push();
      translate(x, y);
      rotate(a);
      fill((a * 30) % 360, 70, 100, 0.9);
      rect(-10, -2, 20, 4);
      pop();
    }
  }
}
`,
    },
    {
      name: 'Spiral', code: `function setup() {
  colorMode(HSB);
  noStroke();
}

function draw() {
  background(250, 30, 10);
  translate(width / 2, height / 2);
  for (let i = 0; i < 400; i++) {
    const a = i * 0.25 + frameCount * 0.02;
    const r = i * 0.7;
    fill((i * 0.9 + frameCount) % 360, 60, 100);
    circle(cos(a) * r, sin(a) * r, 4 + i * 0.02);
  }
}
`,
    },
    {
      name: 'Mouse trails', code: `// Move the mouse over the canvas
function setup() {
  colorMode(HSB);
  background(0, 0, 8);
  noStroke();
}

function draw() {
  fill(0, 0, 8, 0.08);
  rect(0, 0, width, height);
  fill(frameCount % 360, 70, 100);
  circle(mouseX, mouseY, 30 + 10 * sin(frameCount * 0.1));
}
`,
    },
  ];

  // ---- Design tab examples: shapes + keyframes, also wired to a Design node so they show up in Nodes too
  const DS = (id, name, kind, p = {}, keys = {}) => ({ id, name, kind, x: 0, y: 0, w: 100, h: 100, rot: 0, opacity: 1, radius: 0, sides: 5, inner: 0.45, fill: '#e8483a', fillOn: true, stroke: '#1d1d1b', sw: 0, visible: true, locked: false, ...p, keys });
  const K = (...a) => a.map(([t, v, e]) => ({ t, v, e: e || 'ease' }));
  const designGraph = (shapes, extra, out) => ({
    nodes: [N('dn', 'design', 0, 0), OUT(260, 0, out || { hue: 40, sat: 8, bri: 96 })], edges: [E('dn', 'out', 'geo')],
    design: { shapes, duration: 2, loop: true, bg: '#fdf6ec', next: shapes.length + 1, ...extra },
  });
  const designs = [
    {
      name: 'Bouncing ball', graph: designGraph([
        DS('g', 'Ground', 'rect', { y: 200, w: 420, h: 6, fill: '#1d1d1b', radius: 3 }),
        DS('sh', 'Shadow', 'ellipse', { y: 208, w: 70, h: 12, fill: '#1d1d1b', opacity: 0.12 }, { w: K([0, 70, 'in'], [0.9, 120, 'out'], [1.8, 70]), opacity: K([0, 0.1, 'in'], [0.9, 0.35, 'out'], [1.8, 0.1]) }),
        DS('b', 'Ball', 'ellipse', { y: -150, w: 90, h: 90 }, {
          y: K([0, -150, 'in'], [0.9, 170, 'out'], [1.8, -150]),
          w: K([0, 90], [0.84, 90], [0.9, 128, 'out'], [1.0, 90], [1.8, 90]), h: K([0, 90], [0.84, 90], [0.9, 56, 'out'], [1.0, 90], [1.8, 90]),
        }),
      ], { duration: 1.8 }),
    },
    {
      name: 'Pulse & spin', graph: designGraph([
        DS('r', 'Ring', 'ellipse', { w: 60, h: 60, fillOn: false, stroke: '#e8483a', sw: 4 }, { w: K([0, 60, 'out'], [2, 420]), h: K([0, 60, 'out'], [2, 420]), opacity: K([0, 1, 'linear'], [2, 0]) }),
        DS('s', 'Star', 'star', { w: 220, h: 220, sides: 5, inner: 0.42, fill: '#1d1d1b' }, { rot: K([0, 0, 'linear'], [2, 72, 'linear']) }),
        DS('c', 'Core', 'ellipse', { w: 70, h: 70, fill: '#e8483a' }, { w: K([0, 70], [1, 96], [2, 70]), h: K([0, 70], [1, 96], [2, 70]) }),
      ], {}),
    },
  ];
  // a Design drawing used as a stamp inside the generative graph
  nodes.splice(nodes.length - 1, 0, {
    name: 'Design + nodes', graph: {
      nodes: [N('dn', 'design', 0, 0), N('g', 'grid', 0, 130, { cols: 5, rows: 5, width: 420, height: 420 }), N('t', 'time', 0, 330, { speed: 0.35 }),
        N('nf', 'noiseField', 250, 130, { scale: 0.004 }), N('rm', 'remap', 480, 130, { outMin: 0.2, outMax: 0.6 }), N('c', 'copy', 700, 0), OUT(920, 0, { hue: 40, sat: 8, bri: 96 })],
      edges: [E('g', 'nf', 'pts'), E('t', 'nf', 'time'), E('nf', 'rm', 'value'), E('dn', 'c', 'geo'), E('g', 'c', 'pts'), E('rm', 'c', 'scale'), E('c', 'out', 'geo')],
      design: { duration: 2, loop: true, bg: '#fdf6ec', next: 3, shapes: [DS('s', 'Star', 'star', { w: 200, h: 200, sides: 5, inner: 0.42, fill: '#1d1d1b' }, { rot: K([0, 0, 'linear'], [2, 72, 'linear']) }), DS('c', 'Core', 'ellipse', { w: 70, h: 70, fill: '#e8483a' }, { w: K([0, 70], [1, 96], [2, 70]), h: K([0, 70], [1, 96], [2, 70]) })] },
    },
  });

  // ---- Script tab examples (the text language)
  const scripts = [
    {
      name: 'Star field', text: `// Pipe a value into the next node with |>
// Name something with "let" so you can use it more than once
let pts = grid(14, 14, 460, 460)
let n = noiseField(pts, 0.004, time(0.3))

star(5, 22, 10)
  |> copy(pts: pts, scale: n * 2.2, rotate: n * 720)
  |> style(hue: n * 300, sat: 70, bri: 100, alpha: 0.95)
  |> output(bri: 6)
`,
    },
    {
      name: 'Your own node (def)', text: `// "def" makes a custom node. Its parameters become its controls.
def petals(count = 12, radius = 60, hue = 0) {
  let spots = ring(count, radius)
  ellipse(70, 22)
    |> copy(pts: spots, rotate: attribute(spots, degrees))
    |> style(hue: hue, sat: 55, alpha: 0.3, strokeW: 1.2)
}

merge(petals(12, 50, 0), petals(18, 110, 200), petals(28, 170, 300))
  |> output(bri: 8)
`,
    },
    {
      name: 'Cut-outs (compound)', text: `// Subtract eight spinning circles from a rounded square
let holes = ring(8, 105)
  |> copy(ellipse(100, 100))
  |> transform(rotate: time(20))

rect(380, 380, 50)
  |> compound(with: holes, op: subtract)
  |> style(hue: 12, sat: 70)
  |> output(hue: 30, sat: 10, bri: 94)
`,
    },
    {
      name: 'Tidy row (align + distribute)', text: `// Space shapes evenly in a row, then line them up on their middles
merge(rect(70, 110, 10), ellipse(120, 80), star(5, 70, 30))
  |> distribute(gap: 24)
  |> align(halign: none, valign: middle, mode: each)
  |> style(hue: 200, sat: 55)
  |> output(bri: 8)
`,
    },
    {
      name: 'Dot grid ripple', text: `// A grid of dots whose size ripples outward from the center
let pts = grid(20, 20, 520, 520)
let d = attribute(pts, distance)

ellipse(24, 24)
  |> copy(pts, scale: wave(d - time(120), period: 150, amplitude: 0.45, offset: 0.55))
  |> style(hue: 12, sat: 70, bri: 100)
  |> output(hue: 30, sat: 8, bri: 96)
`,
    },
    {
      name: 'Radial burst', text: `// 48 spokes all starting at the center, each pointing a different way
let spokes = ring(48, 0)
let i = attribute(spokes, index)

line(220)
  |> transform(x: 110)
  |> copy(spokes, rotate: attribute(spokes, degrees), scale: wave(i + time(8), period: 12, amplitude: 0.5, offset: 0.7))
  |> style(hue: 200, sat: 60, alpha: 0, strokeW: 3)
  |> output(bri: 8)
`,
    },
    {
      name: 'Concentric polygons', text: `// The same hexagon, copied 14 times, each bigger and more turned than the last
let spots = ring(14, 0)
let i = attribute(spots, index)

polygon(6, 40)
  |> copy(spots, scale: i * 0.55 + 0.6, rotate: i * 6 + time(5))
  |> style(sat: 0, alpha: 0, strokeW: 0.7)
  |> output(bri: 8)
`,
    },
    {
      name: 'Wave ribbon', text: `// A smooth curve through 14 points, moved up and down by a travelling wave
let pts = grid(14, 1, 520, 0)
let dy = wave(attribute(pts, x) + time(60), period: 260, amplitude: 90)

movePoints(pts, dy: dy)
  |> connect(smooth: 1)
  |> style(hue: 340, sat: 55, alpha: 0, strokeW: 4)
  |> output(bri: 8)
`,
    },
  ];

  g.Loom.examples = { nodes, code, designs, scripts };
})(window);
