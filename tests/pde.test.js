// Daub Processing importer tests. Run with:  node tests/pde.test.js
global.window = global;
require('../app/src/engine.js');
require('../app/src/codegraph.js');
require('../app/src/pde.js');
const P = window.Daub.pde;
let failed = 0;
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); if (!ok) failed++; };
const conv = (s) => P.convert(s).code;
const syntaxOk = (code) => { try { new Function('with(this){' + code + '}'); return null; } catch (e) { return e.message; } };
const has = (name, src, re) => { const out = conv(src); check(name, re.test(out), re.test(out) ? '' : '\n' + out); };

// ----- the sketch this was built for
const ascii = `PImage img;
int COLS = 90;                                   // grid size. try 30, 60, 120
float CELL;
color[] TONE = { #8a8f94, #e8554e, #4caf3a };    // block colors, dark -> light
String[] POOL = { "8X@#", "*+?%", ":;,." };      // glyphs for each tone
int[][] BAYER = {{0,8,2,10},{12,4,14,6},{3,11,1,9},{15,7,13,5}};

void setup() {
  size(1200, 1500);
  img = loadImage("/Users/someone/Desktop/photo.jpeg");
  img.resize(COLS, 0);
  img.loadPixels();
  CELL = width / (float) COLS;
  textFont(createFont("Courier", CELL, true));
  textAlign(CENTER, CENTER);
  noLoop();
}

void draw() {
  background(0);
  noStroke();
  for (int y = 0; y < img.height; y++) {
    for (int x = 0; x < img.width; x++) {
      color c = img.pixels[y * img.width + x];
      if (alpha(c) < 128 || brightness(c) < 20) continue;
      int t = pickTone(brightness(c) / 255.0, x, y);
      char g = pickGlyph(t, x, y);
      fill(TONE[t]);
      rect(x * CELL, y * CELL, CELL, CELL);
      fill(0);
      text(g, (x + 0.5) * CELL, (y + 0.5) * CELL);
    }
  }
}

int pickTone(float b, int x, int y) {
  float v = (1 - b) * (TONE.length - 1);
  float thr = (BAYER[y % 4][x % 4] + 0.5) / 16;
  int base = floor(v);
  return constrain(base + ((v - base) > thr ? 1 : 0), 0, TONE.length - 1);
}

char pickGlyph(int t, int x, int y) {
  String pool = POOL[t];
  int h = abs((x * 73856093) ^ (y * 19349663));
  return pool.charAt(h % pool.length());
}
`;
check('the ASCII sketch is recognized as Java', P.looksLikeJava(ascii));
const a = P.convert(ascii);
check('  and converts to valid JavaScript', syntaxOk(a.code) === null, String(syntaxOk(a.code)));
check('  hex colors become strings', /\[ ?'#8a8f94', '#e8554e', '#4caf3a' ?\]/.test(a.code));
check('  array initializers become arrays', /BAYER = \[\[0,8,2,10\],\[12,4,14,6\]/.test(a.code) && /POOL = \[ "8X@#"/.test(a.code));
check('  functions lose their types', /function setup\(\)/.test(a.code) && /function pickTone\(b, x, y\)/.test(a.code) && /function pickGlyph\(t, x, y\)/.test(a.code));
check('  the cast and char work', /width \/ float\(COLS\)/.test(a.code) && /pool\.length\)/.test(a.code));
check('  an int declared from a division is cut to a whole number', conv('int a = width / 4;').includes('int(width / 4)'));
check('  the canvas size is noted', a.notes.some((x) => /1200, 1500/.test(x)));
check('  comments and layout stay', /\/\/ grid size\. try 30, 60, 120/.test(a.code) && a.code.split('\n').length === ascii.split('\n').length);

// ----- recognizing Java (and not JavaScript)
check('a JavaScript sketch is not Java', !P.looksLikeJava('function setup() {\n  noLoop();\n}\nlet x = 5;\n'));
check('a plain statement list is not Java', !P.looksLikeJava('rect(1, 2, 3, 4);\nfill(0);\n'));
check('void draw() is Java', P.looksLikeJava('void draw() {\n  background(0);\n}'));
check('a typed variable is Java', P.looksLikeJava('float x = 3;\n'));
check('an empty text is not Java', !P.looksLikeJava('   '));

// ----- declarations
has('int x;  gets a zero', 'int count;', /let count = 0;/);
has('boolean flag; is false', 'boolean flag;', /let flag = false;/);
has('float x = 1.5f; drops the f', 'float x = 1.5f;', /let x = 1\.5;/);
has('several names in one line', 'int a = 1, b, c = 3;', /let a = 1, b = 0, c = 3;/);
has('final becomes const', 'final int N = 5;', /const N = 5;/);
has('an array with new', 'float[] v = new float[10];', /let v = new Array\(10\)\.fill\(0\);/);
has('a 2-D array', 'int[][] g = new int[w][h];', /Array\.from\(\{ length: w \}, \(\) => new Array\(h\)\.fill\(0\)\)/);
has('new int[]{...}', 'int[] a = new int[]{1, 2, 3};', /let a = \[1, 2, 3\];/);
has('objects start empty', 'PImage img;', /let img;/);
has('PVector arrays', 'PVector[] pts = new PVector[5];', /new Array\(5\)\.fill\(null\)/);
has('for with a typed counter', 'for (int i = 0; i < 10; i++) { }', /for \(let i = 0; i < 10; i\+\+\)/);
has('for-each', 'for (String s : names) { println(s); }', /for \(let s of names\)/);
has('catch drops the type', 'try { f(); } catch (Exception e) { println(e); }', /catch \(e\)/);
has('import lines go', 'import java.util.*;\nvoid setup() {}', /^\s*\nfunction setup/);

// ----- functions
has('a function with typed params', 'float avg(float a, int b) { return (a + b) / 2.0; }', /function avg\(a, b\)/);
has('array and final params', 'void f(final int[] a, String s) {}', /function f\(a, s\)/);
has('return of an int division is whole', 'int half(int n) { return n / 2; }', /return int\(n \/ 2\);/);
has('assigning a division to an int variable', 'int k = 0;\nvoid f() { k = 7 / 2; }', /k = int\(7 \/ 2\);/);

// ----- casts and literals
has('(int) cast', 'int a = (int) random(10);', /let a = int\(random\(10\)\);/);
has('(float) cast keeps precedence', 'float r = (float) a / b;', /float\(a\) \/ b/);
has('(int)(expr)', 'int a = (int)(x + 1);', /int\(\(x \+ 1\)\)/);
has('(char) cast', "char c = (char) (65 + 1);", /char\(\(65 \+ 1\)\)/);
has('10L and 2d', 'long a = 10L; double b = 2d;', /let a = 10; let b = 2;/);
has('a hex color in a call', 'fill(#ff8800);', /fill\('#ff8800'\);/);
has('a hex color inside a string is left alone', 'String s = "#ff8800";', /"#ff8800"/);
has('.length() on a string', 'int n = s.length();', /s\.length;/);

// ----- collections
has('ArrayList', 'ArrayList<Dot> dots = new ArrayList<Dot>();\nvoid f() { dots.add(new Dot()); println(dots.size()); Dot d = dots.get(0); dots.remove(0); }',
  /let dots = \[\];[\s\S]*dots\.push\(new Dot\(\)\); println\(dots\.length\); let d = dots\[0\]; dots\.splice\(0, 1\);/);
has('HashMap', 'HashMap<String, Integer> m = new HashMap<String, Integer>();\nvoid f() { m.put("a", 1); int v = m.get("a"); if (m.containsKey("a")) {} println(m.size()); }',
  /new Map\(\)[\s\S]*m\.set\("a", 1\)[\s\S]*m\.get\("a"\)[\s\S]*m\.has\("a"\)[\s\S]*m\.size/);
has('System.out.println', 'System.out.println("x");', /println\("x"\);/);
has('Integer.parseInt', 'int a = Integer.parseInt("5");', /parseInt\("5"\)/);

// ----- classes
const cls = `class Particle {
  float x, y;
  float speed = 2;
  PVector vel;
  Particle(float x, float y) {
    this.x = x;
    this.y = y;
    vel = new PVector(1, 0);
  }
  void update() {
    float dx = speed * 2;
    x += dx;
    if (x > width) x = 0;
    wrap();
  }
  void wrap() { y = y % height; }
  void show() { ellipse(x, y, 8, 8); }
}
ArrayList<Particle> ps = new ArrayList<Particle>();
void setup() { for (int i = 0; i < 5; i++) ps.add(new Particle(random(width), random(height))); }
void draw() { for (Particle p : ps) { p.update(); p.show(); } }
`;
const c = P.convert(cls);
check('a class converts to valid JavaScript', syntaxOk(c.code) === null, String(syntaxOk(c.code)) + '\n' + c.code);
check('  fields become class fields with defaults', /\n  x = 0;\n|\n  x = 0; ?\n/.test(c.code) || /x = 0;[\s\S]*y = 0;/.test(c.code));
check('  the constructor is named constructor', /constructor\(x, y\)/.test(c.code));
check('  a parameter that shadows a field is left alone', /this\.x = x;/.test(c.code) && !/this\.this/.test(c.code));
check('  bare field and method names get this.', /this\.vel = new PVector/.test(c.code) && /this\.x \+= dx|x \+= dx/.test(c.code) && /this\.wrap\(\)/.test(c.code) && /this\.speed \* 2/.test(c.code));
check('  a local named like nothing is untouched', /let dx = this\.speed/.test(c.code));
check('  methods lose their types', /\n  update\(\) \{/.test(c.code) && /\n  show\(\) \{/.test(c.code));

// it actually runs, and does the same thing as the Java would
const run = (code, draw = 'draw') => { const log = []; const p = new Function('p', 'with(p){' + code + '\n;return typeof setup==="function"?setup:null;}'); return p; };
check('the converted class runs', (() => {
  const drawn = [];
  const env = { width: 100, height: 100, random: (a) => a / 2, ellipse: (...a) => drawn.push(a), PVector: class { constructor(x, y) { this.x = x; this.y = y; } } };
  const f = new Function('p', 'with(p){' + c.code + '\n;return {setup, draw};}')(env);
  f.setup(); f.draw(); f.draw();
  return drawn.length === 10 && drawn[0][0] === 54 && drawn[5][0] === 58;
})());

// ----- Java semantics
check('whole-number division matches Java', (() => {
  const env = { int: Math.trunc };
  const f = new Function('p', 'with(p){' + conv('int a = 7 / 2;\nint half(int n) { return n / 2; }\nfloat b = 7 / 2.0;') + '\n;return [a, half(9), b];}')(env);
  return f[0] === 3 && f[1] === 4 && f[2] === 3.5;
})());
check('2-D arrays work', (() => {
  const f = new Function('p', 'with(p){' + conv('int[][] g = new int[3][2];\ng[2][1] = 5;') + '\n;return g;}')({});
  return f.length === 3 && f[0].length === 2 && f[2][1] === 5 && f[0][0] === 0;
})());

// ----- notes
check('unsupported things are reported', P.convert('void draw() { PGraphics pg = createGraphics(100, 100); }').notes.some((x) => /createGraphics/.test(x)));
check('a plain sketch has no notes', P.convert('void draw() { rect(1, 2, 3, 4); }').notes.length === 0);
check('already-converted code is left alone', conv('function draw() {\n  rect(1, 2, 3, 4);\n}\n') === 'function draw() {\n  rect(1, 2, 3, 4);\n}\n');

// ----- the built-in Processing examples
require('../app/src/examples.js');
require('../app/src/examples-code.js');
for (const ex of window.Daub.examples.pde) {
  const r = P.convert(ex.code), err = syntaxOk(r.code);
  check(`example converts to valid JavaScript: ${ex.name}`, P.looksLikeJava(ex.code) && !err && r.changed && !P.looksLikeJava(r.code), String(err));
  check(`  and converting again changes nothing: ${ex.name}`, P.convert(r.code).code === r.code);
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
