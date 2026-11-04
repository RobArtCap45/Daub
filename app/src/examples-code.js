/* Code sketches in the spirit of the classic "learn to program with Processing" topics.
 * Every program here is original and written for Loom's Processing-style API (see src/sketch.js).
 * Colors: after colorMode(HSB): hue 0-360, saturation 0-100, brightness 0-100, alpha 0-1. In RGB mode: 0-255.
 */
(function (g) {
  'use strict';
  const ex = g.Loom.examples;
  ex.code.forEach((e) => { e.cat = e.cat || 'Loom'; });
  const add = (cat, list) => list.forEach(([name, code]) => ex.code.push({ cat, name, code }));

  add('Color', [
    ['Hue', `// Hue runs across the canvas. Mouse X changes saturation, mouse Y changes brightness.
function setup() {
  colorMode(HSB);
  noStroke();
}

function draw() {
  const s = map(mouseX, 0, width, 10, 100);
  const b = map(mouseY, 0, height, 100, 30);
  for (let x = 0; x < width; x += 10) {
    fill(map(x, 0, width, 0, 360), s, b);
    rect(x, 0, 10, height);
  }
}
`],
    ['Linear Gradient', `// Blend two colors line by line with lerpColor()
function setup() {
  noLoop();
}

function draw() {
  const top = color(255, 120, 70);
  const bottom = color(40, 50, 190);
  for (let y = 0; y < height; y++) {
    stroke(lerpColor(top, bottom, y / height));
    line(0, y, width, y);
  }
}
`],
    ['Radial Gradient', `// Circles from big to small, each a little brighter. Move the mouse to move the glow.
function setup() {
  noStroke();
}

function draw() {
  background(15, 10, 40);
  const x = mouseX || width / 2;
  const y = mouseY || height / 2;
  const inner = color(255, 210, 90);
  const outer = color(120, 30, 90);
  for (let r = 260; r > 0; r -= 4) {
    fill(lerpColor(inner, outer, r / 260));
    circle(x, y, r * 2);
  }
}
`],
  ]);

  add('Control', [
    ['Iteration', `// A for loop draws many lines. The line weight and shade grow with each step.
function setup() {
  noLoop();
}

function draw() {
  background(245);
  for (let y = 20; y < height; y += 14) {
    strokeWeight(1 + (y / height) * 6);
    stroke(30, map(y, 0, height, 255, 70));
    line(40, y, width - 40, y);
  }
}
`],
    ['Embedded Iteration', `// A loop inside a loop makes a grid. Each dot shrinks the farther it is from the mouse.
function draw() {
  background(20);
  noStroke();
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 20; j++) {
      const x = 30 + i * 30;
      const y = 30 + j * 30;
      const d = dist(x, y, mouseX || width / 2, mouseY || height / 2);
      fill(255, 120, 90);
      circle(x, y, map(constrain(d, 0, 300), 0, 300, 26, 3));
    }
  }
}
`],
  ]);

  add('Forms', [
    ['Bezier', `// Thirty bezier curves, spread out by the mouse
function draw() {
  background(250);
  noFill();
  strokeWeight(1.2);
  const k = map(mouseX || width / 2, 0, width, 0.2, 1.8);
  for (let i = 0; i < 30; i++) {
    const t = i / 29;
    stroke(30, 40 + 200 * t);
    bezier(60, 520, 60 + 480 * t * k, 80, 540 - 480 * t * k, 80 + 400 * t, 540, 520 - 120 * t);
  }
}
`],
    ['Pie Chart', `// Data as slices. Hover a slice to pull it out.
const data = [18, 34, 12, 41, 22];

function setup() {
  colorMode(HSB);
}

function draw() {
  background(0, 0, 97);
  noStroke();
  const total = data.reduce((sum, v) => sum + v, 0);
  const rel = (atan2(mouseY - height / 2, mouseX - width / 2) + HALF_PI + TWO_PI) % TWO_PI;
  const inside = dist(mouseX, mouseY, width / 2, height / 2) < 210;
  let start = 0;
  data.forEach((v, i) => {
    const span = (v / total) * TWO_PI;
    const hot = inside && rel >= start && rel < start + span;
    fill(i * 70, 60, hot ? 100 : 85);
    const d = hot ? 430 : 400;
    arc(width / 2, height / 2, d, d, -HALF_PI + start, -HALF_PI + start + span);
    start += span;
  });
}
`],
    ['Regular Polygon', `// One function draws a polygon with any number of sides
function polygon(x, y, radius, sides) {
  beginShape();
  for (let i = 0; i < sides; i++) {
    const a = (TWO_PI * i) / sides - HALF_PI;
    vertex(x + cos(a) * radius, y + sin(a) * radius);
  }
  endShape(CLOSE);
}

function draw() {
  background(245);
  fill(80, 140, 255);
  stroke(20);
  strokeWeight(2);
  const sides = [3, 5, 8];
  sides.forEach((n, i) => {
    push();
    translate(120 + i * 180, 300);
    rotate(frameCount * 0.01 * (i % 2 ? -1 : 1));
    polygon(0, 0, 80, n);
    pop();
  });
}
`],
    ['Star', `// A star is a polygon that alternates between two radii
function star(x, y, outer, inner, points) {
  beginShape();
  for (let i = 0; i < points * 2; i++) {
    const a = (PI * i) / points - HALF_PI;
    const r = i % 2 === 0 ? outer : inner;
    vertex(x + cos(a) * r, y + sin(a) * r);
  }
  endShape(CLOSE);
}

function draw() {
  background(20);
  noStroke();
  fill(255, 200, 70);
  push();
  translate(180, 300);
  rotate(frameCount * 0.02);
  star(0, 0, 130, 55, 5);
  pop();
  fill(232, 72, 58);
  push();
  translate(430, 300);
  rotate(-frameCount * 0.015);
  star(0, 0, 100, 80, 9);
  pop();
}
`],
    ['Triangle Strip', `// beginShape(TRIANGLE_STRIP) connects points in pairs. Here: a wobbling ring.
function setup() {
  colorMode(HSB);
  strokeWeight(1);
}

function draw() {
  background(0, 0, 8);
  const hue = (frameCount * 0.5) % 360;
  fill(hue, 60, 100);
  stroke(hue, 60, 100); // a thin outline in the same color hides the seams between triangles
  const n = 60;
  beginShape(TRIANGLE_STRIP);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TWO_PI;
    const wobble = noise(cos(a) + 1, sin(a) + 1, frameCount * 0.01) * 80;
    vertex(width / 2 + cos(a) * (230 + wobble), height / 2 + sin(a) * (230 + wobble));
    vertex(width / 2 + cos(a) * 120, height / 2 + sin(a) * 120);
  }
  endShape();
}
`],
    ['Points Lines', `// Points on a grid, joined to the mouse by faint lines when it is near
function draw() {
  background(255);
  const mx = mouseX || width / 2;
  const my = mouseY || height / 2;
  for (let x = 40; x < width; x += 40) {
    for (let y = 40; y < height; y += 40) {
      const d = dist(x, y, mx, my);
      if (d < 160) {
        stroke(232, 72, 58, map(d, 0, 160, 255, 0));
        strokeWeight(1.5);
        line(x, y, mx, my);
      }
      stroke(30);
      strokeWeight(6);
      point(x, y);
    }
  }
}
`],
  ]);

  add('Input', [
    ['Clock', `// An analog clock using the time functions hour(), minute() and second()
function draw() {
  background(24);
  translate(width / 2, height / 2);
  const s = second();
  const m = minute() + s / 60;
  const h = (hour() % 12) + m / 60;
  noFill();
  stroke(70);
  strokeWeight(2);
  circle(0, 0, 440);
  stroke(200);
  for (let i = 0; i < 12; i++) {
    const a = (i * TWO_PI) / 12;
    strokeWeight(i % 3 === 0 ? 5 : 2);
    line(cos(a) * 190, sin(a) * 190, cos(a) * 210, sin(a) * 210);
  }
  const hand = (value, max, len, weight, shade) => {
    const a = (value / max) * TWO_PI - HALF_PI;
    stroke(shade);
    strokeWeight(weight);
    line(0, 0, cos(a) * len, sin(a) * len);
  };
  hand(h, 12, 110, 8, '#ffffff');
  hand(m, 60, 160, 5, '#cccccc');
  hand(s, 60, 180, 2, '#e8483a');
}
`],
    ['Easing', `// The circle moves a fraction of the way to the mouse each frame, so it glides
let x = 300;
let y = 300;

function draw() {
  background(245);
  if (mouseX > 0 || mouseY > 0) {
    x += (mouseX - x) * 0.08;
    y += (mouseY - y) * 0.08;
  }
  noStroke();
  fill(232, 72, 58);
  circle(x, y, 60);
  fill(30);
  circle(mouseX, mouseY, 8);
}
`],
    ['Mouse 2D', `// A square follows the mouse; crosshair lines show the position
function draw() {
  background(240);
  const x = constrain(mouseX, 30, width - 30);
  const y = constrain(mouseY, 30, height - 30);
  stroke(180);
  line(x, 0, x, height);
  line(0, y, width, y);
  rectMode(CENTER);
  noStroke();
  fill(232, 72, 58);
  rect(x, y, 60, 60);
}
`],
    ['Storing Input', `// Remember the last 60 mouse positions in an array and draw them as a fading trail
const trail = [];

function setup() {
  noStroke();
}

function draw() {
  background(20);
  trail.push([mouseX, mouseY]);
  if (trail.length > 60) trail.shift();
  trail.forEach(([x, y], i) => {
    fill(255, 120, 90, (255 * i) / trail.length);
    circle(x, y, 6 + i * 0.7);
  });
}
`],
    ['Mouse Functions', `// mousePressed() runs once per click. Click to drop circles.
const dots = [];

function setup() {
  colorMode(HSB);
  textSize(16);
}

function mousePressed() {
  dots.push({ x: mouseX, y: mouseY, r: random(12, 50), h: random(360) });
}

function draw() {
  background(0, 0, 96);
  noStroke();
  dots.forEach((d) => {
    fill(d.h, 60, 100, 0.8);
    circle(d.x, d.y, d.r * 2);
  });
  fill(0, 0, 40);
  text('Click anywhere (' + dots.length + ' circles)', 20, 30);
}
`],
    ['Keyboard', `// Click the canvas to give it the keyboard, then type. Each letter you press lights up.
const pressed = {};

function setup() {
  textAlign(CENTER, CENTER);
  textSize(20);
}

function keyPressed() {
  pressed[key.toLowerCase()] = true;
}

function draw() {
  background(24);
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < 26; i++) {
    const x = 70 + (i % 9) * 56;
    const y = 200 + floor(i / 9) * 90;
    noStroke();
    fill(pressed[letters[i]] ? color(232, 72, 58) : color(50));
    rect(x - 24, y - 30, 48, 60, 8);
    fill(255);
    text(letters[i], x, y);
  }
  fill(180);
  textSize(16);
  text('Click here, then press keys', width / 2, 60);
  textSize(20);
}
`],
  ]);

  add('Math', [
    ['Sine Wave', `// sin() turns a steadily growing number into a smooth wave
function draw() {
  background(245);
  noFill();
  stroke(30);
  strokeWeight(2);
  beginShape();
  for (let x = 0; x <= width; x += 4) {
    vertex(x, height / 2 + sin(x * 0.03 + frameCount * 0.05) * 120);
  }
  endShape();
}
`],
    ['Additive Wave', `// Two waves of different speed (top) add up to a more interesting one (bottom)
function draw() {
  background(250);
  noFill();
  strokeWeight(2);
  const wave = (yMid, f) => {
    beginShape();
    for (let x = 0; x <= width; x += 4) vertex(x, yMid + f(x));
    endShape();
  };
  const a = (x) => sin(x * 0.03 + frameCount * 0.04) * 50;
  const b = (x) => sin(x * 0.011 - frameCount * 0.03) * 70;
  stroke(232, 72, 58);
  wave(120, a);
  stroke(60, 120, 220);
  wave(250, b);
  stroke(30);
  wave(440, (x) => a(x) + b(x));
}
`],
    ['Noise Wave', `// noise() gives smooth randomness; sin() gives a perfect wave. Compare them.
function draw() {
  background(20);
  noFill();
  strokeWeight(2);
  stroke(255, 200, 70);
  beginShape();
  for (let x = 0; x <= width; x += 3) {
    vertex(x, 200 + noise(x * 0.01, frameCount * 0.01) * 180 - 90);
  }
  endShape();
  stroke(90, 170, 255);
  beginShape();
  for (let x = 0; x <= width; x += 3) {
    vertex(x, 430 + sin(x * 0.03 + frameCount * 0.04) * 80);
  }
  endShape();
}
`],
    ['Noise 2D', `// A drifting cloud: noise sampled on a grid, with time as the third dimension
function setup() {
  noStroke();
  colorMode(HSB);
}

function draw() {
  const t = frameCount * 0.01;
  for (let y = 0; y < height; y += 10) {
    for (let x = 0; x < width; x += 10) {
      const n = noise(x * 0.012, y * 0.012, t);
      fill(200 + n * 120, 60, 30 + n * 70);
      rect(x, y, 10, 10);
    }
  }
}
`],
    ['Polar To Cartesian', `// Angle and distance (polar) become x and y with cos() and sin()
function setup() {
  background(20);
  noStroke();
  colorMode(HSB);
}

function draw() {
  translate(width / 2, height / 2);
  const angle = frameCount * 0.07;
  const radius = (frameCount * 0.6) % 280;
  fill((frameCount * 2) % 360, 70, 100);
  circle(cos(angle) * radius, sin(angle) * radius, 8);
}
`],
    ['Sine Cosine', `// A point circles; cos() is its x position and sin() its y. The graph on the right traces sin().
const history = [];

function draw() {
  background(245);
  const a = frameCount * 0.03;
  push();
  translate(190, 300);
  noFill();
  stroke(150);
  circle(0, 0, 300);
  const x = cos(a) * 150;
  const y = sin(a) * 150;
  stroke(232, 72, 58);
  line(x, y, x, 0);
  stroke(60, 120, 220);
  line(x, y, 0, y);
  stroke(30);
  line(0, 0, x, y);
  noStroke();
  fill(232, 72, 58);
  circle(x, y, 18);
  pop();
  history.unshift(300 + sin(a) * 150);
  if (history.length > 240) history.pop();
  noFill();
  stroke(60, 120, 220);
  strokeWeight(2);
  beginShape();
  history.forEach((h, i) => vertex(380 + i, h));
  endShape();
}
`],
    ['Random Gaussian', `// randomGaussian() clusters values around an average. Dots pile up in a bell shape.
function setup() {
  background(250);
  noStroke();
}

function draw() {
  for (let i = 0; i < 8; i++) {
    fill(232, 72, 58, 60);
    circle(randomGaussian(width / 2, 70), randomGaussian(height / 2, 70), 8);
  }
}
`],
    ['Arctangent', `// atan2() gives the angle toward the mouse, so both eyes can look at it
function eye(x, y, size) {
  const a = atan2(mouseY - y, mouseX - x);
  push();
  translate(x, y);
  fill(255);
  stroke(30);
  strokeWeight(3);
  circle(0, 0, size);
  rotate(a);
  fill(30);
  noStroke();
  circle(size * 0.22, 0, size * 0.4);
  pop();
}

function draw() {
  background(240);
  eye(210, 300, 180);
  eye(390, 300, 180);
}
`],
    ['Graphing 2D Equation', `// Color every cell by the value of an equation of x and y
function setup() {
  noStroke();
  colorMode(HSB);
}

function draw() {
  const t = frameCount * 0.03;
  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
      const dx = x - width / 2;
      const dy = y - height / 2;
      const v = sin(sqrt(dx * dx + dy * dy) * 0.04 - t) + sin(dx * 0.02 + t * 0.5) * sin(dy * 0.02);
      fill(map(v, -2, 2, 200, 330), 70, 100);
      rect(x, y, 8, 8);
    }
  }
}
`],
  ]);

  add('Structure', [
    ['Recursion', `// A function that calls itself. Each circle grows four smaller ones. Mouse X sets how deep.
function ring(x, y, r, depth) {
  noFill();
  circle(x, y, r * 2);
  if (depth > 0) {
    ring(x - r / 2, y, r / 2, depth - 1);
    ring(x + r / 2, y, r / 2, depth - 1);
    ring(x, y - r / 2, r / 2, depth - 1);
    ring(x, y + r / 2, r / 2, depth - 1);
  }
}

function draw() {
  background(250);
  stroke(30);
  strokeWeight(1.2);
  ring(width / 2, height / 2, 250, floor(map(mouseX || 300, 0, width, 0, 5)));
}
`],
  ]);

  add('Transform', [
    ['Arm', `// Two segments joined at an elbow. The shoulder follows the mouse; the elbow swings.
function draw() {
  background(240);
  const px = width / 2;
  const py = height / 2 + 120;
  push();
  translate(px, py);
  rotate(atan2((mouseY || 100) - py, (mouseX || px) - px));
  stroke(30);
  strokeWeight(14);
  line(0, 0, 180, 0);
  translate(180, 0);
  rotate(sin(frameCount * 0.05) * 1.1);
  stroke(232, 72, 58);
  line(0, 0, 150, 0);
  noStroke();
  fill(30);
  circle(0, 0, 30);
  pop();
}
`],
    ['Rotate Push Pop', `// push() and pop() keep each shape's rotation from affecting the next
function draw() {
  background(240);
  rectMode(CENTER);
  noStroke();
  push();
  translate(200, 300);
  rotate(frameCount * 0.02);
  fill(232, 72, 58);
  rect(0, 0, 160, 160);
  pop();
  push();
  translate(400, 300);
  rotate(-frameCount * 0.03);
  fill(60, 120, 220);
  rect(0, 0, 160, 160);
  pop();
}
`],
    ['Scale', `// scale() grows everything drawn after it, including line weights
function draw() {
  background(245);
  translate(width / 2, height / 2);
  noFill();
  stroke(30);
  for (let i = 0; i < 12; i++) {
    push();
    scale(0.4 + i * 0.12 + sin(frameCount * 0.04 + i * 0.4) * 0.05);
    strokeWeight(2);
    rectMode(CENTER);
    rect(0, 0, 100, 100);
    pop();
  }
}
`],
    ['Translate', `// translate() moves the origin. Inside push()/pop() the move is undone afterwards.
function draw() {
  background(20);
  noStroke();
  for (let i = 0; i < 8; i++) {
    push();
    translate(60 + i * 70, 300 + sin(frameCount * 0.05 + i * 0.6) * 140);
    fill(255, 120 + i * 15, 90);
    rect(-25, -25, 50, 50, 10);
    pop();
  }
}
`],
  ]);

  add('Typography', [
    ['Words', `// Words are shapes too. Move the mouse to change the size and position.
function setup() {
  textAlign(CENTER, CENTER);
}

function draw() {
  background(250);
  fill(30);
  textSize(map(mouseY || 300, 0, height, 30, 160));
  text('motion', mouseX || width / 2, height / 2);
  fill(232, 72, 58);
  textSize(24);
  text('move the mouse', width / 2, height - 40);
}
`],
    ['Letters', `// A grid of letters; the ones near the mouse grow
function setup() {
  textAlign(CENTER, CENTER);
}

function draw() {
  background(24);
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 12; j++) {
      const x = 50 + i * 45;
      const y = 50 + j * 45;
      const d = dist(x, y, mouseX || 300, mouseY || 300);
      textSize(map(constrain(d, 0, 250), 0, 250, 40, 12));
      fill(255, map(d, 0, 300, 255, 80));
      text(String.fromCharCode(65 + ((i + j * 12) % 26)), x, y);
    }
  }
}
`],
    ['Text Rotation', `// Place each letter of a sentence around a circle by rotating the canvas
function setup() {
  textAlign(CENTER, CENTER);
  textSize(34);
}

function draw() {
  background(245);
  const phrase = 'LETTERS ON A CIRCLE  ';
  translate(width / 2, height / 2);
  rotate(frameCount * 0.005);
  fill(30);
  for (let i = 0; i < phrase.length; i++) {
    push();
    rotate((i / phrase.length) * TWO_PI);
    translate(0, -190);
    text(phrase[i], 0, 0);
    pop();
  }
}
`],
  ]);

  add('Cellular Automata', [
    ['Game Of Life', `// Conway's Game of Life on a wrapping grid. Click to start over with a new random pattern.
const N = 60;
const S = 10;
let grid = [];

function seed() {
  grid = [];
  for (let y = 0; y < N; y++) {
    grid[y] = [];
    for (let x = 0; x < N; x++) grid[y][x] = random() < 0.28 ? 1 : 0;
  }
}

function setup() {
  frameRate(10);
  noStroke();
  seed();
}

function mousePressed() {
  seed();
}

function draw() {
  background(18);
  fill(232, 72, 58);
  const next = grid.map((row) => row.slice());
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) n += grid[(y + dy + N) % N][(x + dx + N) % N];
      }
      n -= grid[y][x];
      next[y][x] = grid[y][x] ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
      if (grid[y][x]) rect(x * S, y * S, S - 1, S - 1);
    }
  }
  grid = next;
}
`],
    ['Wolfram', `// A one-dimensional cellular automaton: each row is made from the row above by a rule (0-255).
// Click for another rule (a few of the most interesting ones).
const rules = [30, 90, 110, 126, 150, 18, 22, 45, 73, 105, 182, 225];
let rule = 30;

function setup() {
  noLoop();
  textSize(18);
}

function mousePressed() {
  rule = random(rules.filter((r) => r !== rule));
  redraw();
}

function draw() {
  background(250);
  noStroke();
  fill(30);
  const cols = 150;
  const cell = 4;
  let row = new Array(cols).fill(0);
  row[cols / 2] = 1;
  for (let r = 0; r < 150; r++) {
    for (let i = 0; i < cols; i++) if (row[i]) rect(i * cell, r * cell, cell, cell);
    const next = new Array(cols).fill(0);
    for (let i = 0; i < cols; i++) {
      const pattern = (row[(i - 1 + cols) % cols] << 2) | (row[i] << 1) | row[(i + 1) % cols];
      next[i] = (rule >> pattern) & 1;
    }
    row = next;
  }
  fill(232, 72, 58);
  text('Rule ' + rule + ' (click for another)', 14, 590);
}
`],
  ]);

  add('Drawing', [
    ['Pattern', `// A brush whose size follows how fast you move the mouse
function setup() {
  background(245);
  noStroke();
  colorMode(HSB);
}

function draw() {
  const speed = dist(mouseX, mouseY, pmouseX, pmouseY);
  if (speed > 0) {
    fill((frameCount * 2) % 360, 60, 95, 0.7);
    circle(mouseX, mouseY, speed * 1.5 + 4);
  }
}
`],
    ['Pulses', `// Click to send out a ring. Rings grow and fade; a few appear on their own.
const pulses = [];

function mousePressed() {
  pulses.push({ x: mouseX, y: mouseY, r: 0 });
}

function draw() {
  background(20);
  if (frameCount % 50 === 0) pulses.push({ x: random(width), y: random(height), r: 0 });
  noFill();
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    p.r += 3;
    stroke(255, 160, 100, map(p.r, 0, 300, 255, 0));
    strokeWeight(3);
    circle(p.x, p.y, p.r * 2);
    if (p.r > 300) pulses.splice(i, 1);
  }
}
`],
    ['Continuous Lines', `// Hold the mouse button and draw. The canvas is never cleared, so lines stay.
function setup() {
  background(250);
  colorMode(HSB);
}

function draw() {
  if (mouseIsPressed) {
    stroke((frameCount * 3) % 360, 70, 90);
    strokeWeight(map(dist(mouseX, mouseY, pmouseX, pmouseY), 0, 40, 6, 1));
    line(pmouseX, pmouseY, mouseX, mouseY);
  }
}
`],
  ]);

  add('Fractals', [
    ['Koch', `// The Koch snowflake: every line is replaced by four smaller lines with a bump. Mouse X sets the depth.
function koch(x1, y1, x2, y2, level) {
  if (level === 0) {
    line(x1, y1, x2, y2);
    return;
  }
  const dx = (x2 - x1) / 3;
  const dy = (y2 - y1) / 3;
  const ax = x1 + dx;
  const ay = y1 + dy;
  const bx = x1 + 2 * dx;
  const by = y1 + 2 * dy;
  const px = ax + dx * 0.5 + dy * 0.866;
  const py = ay - dx * 0.866 + dy * 0.5;
  koch(x1, y1, ax, ay, level - 1);
  koch(ax, ay, px, py, level - 1);
  koch(px, py, bx, by, level - 1);
  koch(bx, by, x2, y2, level - 1);
}

function draw() {
  background(250);
  stroke(30);
  strokeWeight(1.5);
  const level = floor(map(mouseX || 300, 0, width, 0, 5));
  const r = 230;
  const p = [0, 1, 2].map((i) => [width / 2 + cos(-HALF_PI + i * TWO_PI / 3) * r, height / 2 + 40 + sin(-HALF_PI + i * TWO_PI / 3) * r]);
  koch(p[0][0], p[0][1], p[1][0], p[1][1], level);
  koch(p[1][0], p[1][1], p[2][0], p[2][1], level);
  koch(p[2][0], p[2][1], p[0][0], p[0][1], level);
}
`],
    ['Mandelbrot', `// For each pixel, test whether repeating z = z*z + c stays small. The count colors the picture.
// Click to zoom in at that spot.
let cx = -0.6;
let cy = 0;
let scaleW = 3.2;

function setup() {
  noLoop();
  noStroke();
  colorMode(HSB);
}

function mousePressed() {
  cx += map(mouseX, 0, width, -scaleW / 2, scaleW / 2);
  cy += map(mouseY, 0, height, -scaleW / 2, scaleW / 2);
  scaleW *= 0.4;
  redraw();
}

function draw() {
  const step = 3;
  for (let py = 0; py < height; py += step) {
    for (let px = 0; px < width; px += step) {
      const x0 = cx + map(px, 0, width, -scaleW / 2, scaleW / 2);
      const y0 = cy + map(py, 0, height, -scaleW / 2, scaleW / 2);
      let x = 0;
      let y = 0;
      let i = 0;
      while (x * x + y * y < 4 && i < 80) {
        const t = x * x - y * y + x0;
        y = 2 * x * y + y0;
        x = t;
        i++;
      }
      if (i === 80) fill(0, 0, 5); else fill((i * 9) % 360, 70, 95);
      rect(px, py, step, step);
    }
  }
}
`],
    ['Tree', `// A tree is a branch that grows two smaller branches. Mouse X changes the angle.
let angle = 0.5;

function branch(len) {
  strokeWeight(max(1, len * 0.07));
  line(0, 0, 0, -len);
  translate(0, -len);
  if (len > 9) {
    push();
    rotate(angle);
    branch(len * 0.72);
    pop();
    push();
    rotate(-angle);
    branch(len * 0.72);
    pop();
  }
}

function draw() {
  background(250);
  stroke(60, 40, 30);
  angle = map(mouseX || 300, 0, width, 0.1, 1.3) + sin(frameCount * 0.02) * 0.04;
  translate(width / 2, height - 20);
  branch(140);
}
`],
  ]);

  add('Interaction', [
    ['Follow', `// A chain of segments: each one follows the one before it, so the whole thing slithers after the mouse
const n = 16;
const len = 24;
const pts = [];

function setup() {
  for (let i = 0; i < n; i++) pts.push({ x: 300, y: 300 });
  strokeCap(ROUND);
}

function draw() {
  background(20);
  pts[0].x += ((mouseX || 300) - pts[0].x) * 0.2;
  pts[0].y += ((mouseY || 300) - pts[0].y) * 0.2;
  for (let i = 1; i < n; i++) {
    const a = atan2(pts[i - 1].y - pts[i].y, pts[i - 1].x - pts[i].x);
    pts[i].x = pts[i - 1].x - cos(a) * len;
    pts[i].y = pts[i - 1].y - sin(a) * len;
  }
  for (let i = 1; i < n; i++) {
    stroke(255, 160 + i * 5, 100);
    strokeWeight(map(i, 0, n, 22, 3));
    line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
  }
}
`],
    ['Reach', `// A chain that reaches for the mouse while staying pinned to the bottom (a simple inverse-kinematics method)
const L = 70;
const joints = [];

function setup() {
  for (let i = 0; i <= 6; i++) joints.push(createVector(width / 2, height - i * L));
  strokeCap(ROUND);
}

function draw() {
  background(245);
  const target = createVector(mouseX || width / 2, mouseY || 150);
  const base = createVector(width / 2, height - 20);
  const last = joints.length - 1;
  joints[last].set(target);
  for (let i = last - 1; i >= 0; i--) {
    const dir = PVector.sub(joints[i], joints[i + 1]).setMag(L);
    joints[i] = PVector.add(joints[i + 1], dir);
  }
  joints[0].set(base);
  for (let i = 1; i <= last; i++) {
    const dir = PVector.sub(joints[i], joints[i - 1]).setMag(L);
    joints[i] = PVector.add(joints[i - 1], dir);
  }
  for (let i = 1; i <= last; i++) {
    stroke(30);
    strokeWeight(map(i, 1, last, 20, 6));
    line(joints[i - 1].x, joints[i - 1].y, joints[i].x, joints[i].y);
  }
  noStroke();
  fill(232, 72, 58);
  circle(joints[last].x, joints[last].y, 24);
}
`],
    ['Tickle', `// The word shakes when the mouse is close to it
function setup() {
  textAlign(CENTER, CENTER);
  textSize(96);
}

function draw() {
  background(245);
  const near = dist(mouseX, mouseY, width / 2, height / 2) < 150;
  fill(near ? color(232, 72, 58) : color(30));
  const j = near ? 6 : 0;
  text('tickle', width / 2 + random(-j, j), height / 2 + random(-j, j));
}
`],
  ]);

  add('Motion', [
    ['Bounce', `// A ball that bounces off the walls, with gravity
let x = 120;
let y = 80;
let vx = 4.2;
let vy = 0;

function draw() {
  background(245);
  vy += 0.35;
  x += vx;
  y += vy;
  if (x < 30 || x > width - 30) { vx *= -1; x = constrain(x, 30, width - 30); }
  if (y > height - 30) { vy *= -0.92; y = height - 30; }
  noStroke();
  fill(232, 72, 58);
  circle(x, y, 60);
}
`],
    ['Bouncy Bubbles', `// A dozen bubbles that bounce off walls and push each other away
const bubbles = [];

function setup() {
  noStroke();
  for (let i = 0; i < 12; i++) bubbles.push({ x: random(60, 540), y: random(60, 540), vx: random(-2, 2), vy: random(-2, 2), r: random(25, 55) });
}

function draw() {
  background(24);
  for (const a of bubbles) {
    a.x += a.vx;
    a.y += a.vy;
    if (a.x < a.r || a.x > width - a.r) a.vx *= -1;
    if (a.y < a.r || a.y > height - a.r) a.vy *= -1;
    for (const b of bubbles) {
      if (a === b) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d < a.r + b.r && d > 0) {
        const push = (a.r + b.r - d) * 0.02;
        a.vx += ((a.x - b.x) / d) * push;
        a.vy += ((a.y - b.y) / d) * push;
      }
    }
    a.x = constrain(a.x, a.r, width - a.r);
    a.y = constrain(a.y, a.r, height - a.r);
  }
  for (const a of bubbles) {
    fill(255, 140, 100, 170);
    circle(a.x, a.y, a.r * 2);
  }
}
`],
    ['Brownian', `// Many walkers each take small random steps. Their paths pile up into soft clouds.
const walkers = [];

function setup() {
  background(250);
  for (let i = 0; i < 120; i++) walkers.push({ x: width / 2, y: height / 2, h: random(360) });
  colorMode(HSB);
  strokeWeight(1.2);
}

function draw() {
  for (const w of walkers) {
    const nx = constrain(w.x + random(-4, 4), 0, width);
    const ny = constrain(w.y + random(-4, 4), 0, height);
    stroke(w.h, 70, 90, 0.5);
    line(w.x, w.y, nx, ny);
    w.x = nx;
    w.y = ny;
  }
}
`],
    ['Linear', `// Constant speed in a straight line, wrapping around the edge
let x = 0;

function draw() {
  background(245);
  x = (x + 3) % (width + 120);
  noStroke();
  fill(232, 72, 58);
  rect(x - 120, 250, 120, 100, 12);
  fill(30);
  for (let i = 0; i < 6; i++) rect(0, 40 + i * 90, ((x * (i + 1)) % width) * 0.3, 8);
}
`],
    ['Morph', `// Blend a circle into a square by moving every point between two positions
function draw() {
  background(24);
  const t = sin(frameCount * 0.03) * 0.5 + 0.5;
  const n = 72;
  fill(255, 160, 90);
  noStroke();
  beginShape();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TWO_PI;
    const squareR = 1 / max(abs(cos(a)), abs(sin(a)));
    const r = lerp(1, squareR, t) * 190;
    vertex(width / 2 + cos(a) * r, height / 2 + sin(a) * r);
  }
  endShape(CLOSE);
}
`],
    ['Moving On Curves', `// Dots travel along a bezier curve; bezierPoint() finds where each one is
function draw() {
  background(250);
  const p = [60, 480, 140, 40, 460, 560, 540, 120];
  noFill();
  stroke(200);
  bezier(...p);
  noStroke();
  for (let i = 0; i < 12; i++) {
    const t = (frameCount * 0.004 + i / 12) % 1;
    fill(232, 72, 58, 255 * (1 - abs(t - 0.5)));
    circle(bezierPoint(p[0], p[2], p[4], p[6], t), bezierPoint(p[1], p[3], p[5], p[7], t), 22);
  }
}
`],
  ]);

  add('Simulate', [
    ['Flocking', `// Boids: each bird steers by three rules - stay apart, match neighbors' heading, stay together
const birds = [];

class Bird {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = PVector.random2D().mult(2);
  }
  update(flock) {
    const sep = createVector();
    const ali = createVector();
    const coh = createVector();
    let count = 0;
    for (const o of flock) {
      const d = this.pos.dist(o.pos);
      if (o !== this && d < 70) {
        if (d < 28) sep.add(PVector.sub(this.pos, o.pos).div(max(d, 1)));
        ali.add(o.vel);
        coh.add(o.pos);
        count++;
      }
    }
    if (count > 0) {
      ali.div(count).setMag(2).sub(this.vel).limit(0.05);
      coh.div(count).sub(this.pos).setMag(2).sub(this.vel).limit(0.04);
      this.vel.add(ali).add(coh);
    }
    this.vel.add(sep.mult(0.12));
    if (mouseX > 0) {
      const away = PVector.sub(this.pos, createVector(mouseX, mouseY));
      if (away.mag() < 110) this.vel.add(away.setMag(0.25));
    }
    this.vel.limit(3);
    this.pos.add(this.vel);
    this.pos.x = (this.pos.x + width) % width;
    this.pos.y = (this.pos.y + height) % height;
  }
  show() {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());
    triangle(10, 0, -7, 5, -7, -5);
    pop();
  }
}

function setup() {
  for (let i = 0; i < 90; i++) birds.push(new Bird());
  noStroke();
}

function draw() {
  background(18, 22, 40);
  fill(255, 220, 140);
  for (const b of birds) {
    b.update(birds);
    b.show();
  }
}
`],
    ['Forces With Vectors', `// Gravity and wind push on balls of different mass. Click to add one.
const movers = [];

class Mover {
  constructor(x, y, m) {
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
    this.acc = createVector(0, 0);
    this.mass = m;
  }
  force(f) {
    this.acc.add(PVector.div(f, this.mass));
  }
  update() {
    this.vel.add(this.acc);
    this.pos.add(this.vel);
    this.acc.mult(0);
    if (this.pos.y > height - this.mass * 5) { this.pos.y = height - this.mass * 5; this.vel.y *= -0.8; }
    if (this.pos.x > width || this.pos.x < 0) { this.vel.x *= -1; this.pos.x = constrain(this.pos.x, 0, width); }
  }
  show() {
    circle(this.pos.x, this.pos.y, this.mass * 10);
  }
}

function mousePressed() {
  movers.push(new Mover(mouseX, mouseY, random(1, 6)));
}

function setup() {
  for (let i = 0; i < 6; i++) movers.push(new Mover(random(width), 50, random(1, 6)));
  noStroke();
}

function draw() {
  background(245);
  const wind = createVector(map(mouseX || 300, 0, width, -0.1, 0.1), 0);
  fill(232, 72, 58, 200);
  for (const m of movers) {
    m.force(PVector.mult(createVector(0, 0.3), m.mass));
    m.force(wind);
    m.update();
    m.show();
  }
  fill(30);
  text('Mouse X is the wind. Click to add a ball.', 16, 24);
}
`],
    ['Simple Particle System', `// An emitter at the mouse throws particles that fall and fade
const particles = [];

function draw() {
  background(20);
  const ex = mouseX || width / 2;
  const ey = mouseY || 120;
  for (let i = 0; i < 4; i++) particles.push({ p: createVector(ex, ey), v: createVector(random(-1.5, 1.5), random(-3, -0.5)), life: 255 });
  noStroke();
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    q.v.y += 0.06;
    q.p.add(q.v);
    q.life -= 3;
    fill(255, 150 + (q.life >> 2), 60, q.life);
    circle(q.p.x, q.p.y, 14);
    if (q.life <= 0) particles.splice(i, 1);
  }
}
`],
    ['Smoke Particle System', `// Many large, nearly transparent puffs added together look like smoke rising in a breeze
const puffs = [];

function draw() {
  background(10, 12, 20);
  blendMode(ADD);
  noStroke();
  const wind = (noise(frameCount * 0.01) - 0.5) * 0.8;
  for (let i = 0; i < 2; i++) puffs.push({ x: width / 2 + random(-10, 10), y: height - 30, vx: random(-0.3, 0.3), vy: random(-2, -1), age: 0 });
  for (let i = puffs.length - 1; i >= 0; i--) {
    const q = puffs[i];
    q.x += q.vx + wind;
    q.y += q.vy;
    q.age++;
    fill(70, 75, 90, max(0, 14 - q.age * 0.07));
    circle(q.x, q.y, 30 + q.age * 0.9);
    if (q.age > 240) puffs.splice(i, 1);
  }
  blendMode(BLEND);
}
`],
  ]);

  add('Vectors', [
    ['Bouncing Ball', `// The same bouncing ball, written with position and velocity vectors
const pos = createVector(100, 100);
const vel = createVector(3.2, 2.4);

function draw() {
  background(245);
  pos.add(vel);
  if (pos.x < 30 || pos.x > width - 30) vel.x *= -1;
  if (pos.y < 30 || pos.y > height - 30) vel.y *= -1;
  noStroke();
  fill(60, 120, 220);
  circle(pos.x, pos.y, 60);
  stroke(30);
  strokeWeight(2);
  line(pos.x, pos.y, pos.x + vel.x * 14, pos.y + vel.y * 14);
}
`],
    ['Acceleration With Vectors', `// The ball accelerates toward the mouse. Acceleration changes velocity; velocity changes position.
const pos = createVector(300, 300);
const vel = createVector(0, 0);

function draw() {
  background(245);
  const target = createVector(mouseX || 300, mouseY || 300);
  const acc = PVector.sub(target, pos).setMag(0.25);
  vel.add(acc).limit(7);
  pos.add(vel);
  noStroke();
  fill(232, 72, 58);
  circle(pos.x, pos.y, 50);
  stroke(60, 120, 220);
  strokeWeight(3);
  line(pos.x, pos.y, pos.x + acc.x * 160, pos.y + acc.y * 160);
}
`],
    ['Vector Math', `// A vector from the center to the mouse, then its direction (unit length) and half its length
function arrow(from, v, shade) {
  stroke(shade);
  strokeWeight(3);
  line(from.x, from.y, from.x + v.x, from.y + v.y);
  const a = v.heading();
  const tip = createVector(from.x + v.x, from.y + v.y);
  line(tip.x, tip.y, tip.x - cos(a - 0.4) * 14, tip.y - sin(a - 0.4) * 14);
  line(tip.x, tip.y, tip.x - cos(a + 0.4) * 14, tip.y - sin(a + 0.4) * 14);
}

function draw() {
  background(250);
  const center = createVector(width / 2, height / 2);
  const v = PVector.sub(createVector(mouseX || 450, mouseY || 200), center);
  arrow(center, v, color(30));
  arrow(center, PVector.mult(v, 0.5), color(232, 72, 58));
  arrow(center, PVector.mult(v.copy().normalize(), 80), color(60, 120, 220));
  noStroke();
  fill(30);
  text('length ' + nf(v.mag(), 0, 1), 16, 24);
}
`],
  ]);
})(window);
