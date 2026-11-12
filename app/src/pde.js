/* Daub Processing importer: real Processing (Java) code -> Daub's Processing-style JavaScript.
 *
 *   looksLikeJava(text)  does this look like a Processing (Java) sketch?
 *   convert(text)        -> { code, notes }   the same sketch in JavaScript, and what to know about the result
 *
 * It works on tokens and edits the source in place, so comments, spacing and line breaks stay as they were.
 * It covers what sketches use: typed variables and arrays, functions, classes with fields and constructors,
 * casts, ArrayList / HashMap, for-each loops, hex colors (#ff8800), float literals (1.5f), generics.
 * Anything it does not know is left alone, and the notes say what to check.
 *
 * This file does not touch the page, so the tests load it straight into Node.
 */
(function (g) {
  'use strict';
  const D = (g.Daub = g.Daub || {});

  const PRIMS = new Set(['int', 'float', 'double', 'long', 'short', 'byte', 'char', 'boolean']);
  const NUMERIC = new Set(['int', 'float', 'double', 'long', 'short', 'byte']);
  const INTS = new Set(['int', 'long', 'short', 'byte']);
  const MODS = new Set(['public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized', 'transient', 'volatile']);
  const KEYWORDS = new Set(['return', 'new', 'throw', 'case', 'else', 'do', 'in', 'of', 'typeof', 'delete', 'instanceof', 'import', 'package', 'class', 'interface', 'extends', 'implements', 'if', 'for', 'while', 'switch', 'try', 'catch', 'finally', 'break', 'continue', 'default', 'this', 'super', 'null', 'true', 'false', 'var', 'let', 'const', 'function', 'void_']);
  const UNSUPPORTED_CALLS = ['createGraphics', 'loadStrings', 'loadTable', 'loadFont', 'loadShape', 'loadXML', 'loadJSONObject', 'loadBytes', 'saveStrings', 'saveFrame', 'sphere', 'box', 'lights', 'camera', 'perspective', 'ortho', 'tint', 'noTint', 'blend', 'filter', 'shader', 'loadPixels', 'updatePixels'];
  const UNSUPPORTED_WORDS = ['P3D', 'P2D', 'FX2D', 'Serial', 'Capture', 'Movie', 'SoundFile', 'Minim', 'OscP5'];

  const sigTokens = (src) => D.codegraph.tokenize(src).filter((t) => t.t !== 'nl' && t.t !== 'comment');

  // ---------------------------------------------------------------- does it look like Java?
  function looksLikeJava(src) {
    const s = String(src || '');
    if (!s.trim()) return false;
    const js = /^\s*(?:function\s+\w+\s*\(|(?:let|const)\s+[\w$]+\s*(?:=|;))/m.test(s);
    const java = /\bvoid\s+\w+\s*\(/.test(s)
      || /^\s*(?:(?:final|static|public|private)\s+)*(?:int|float|double|boolean|char|byte|long|String|color|PImage|PVector|PFont|ArrayList(?:<[^>]*>)?)\s*(?:\[\s*\]\s*)*\s+[\w$]+\s*(?:=|;|\[|,|\()/m.test(s)
      || /(?:^|[^\w'"])#[0-9a-fA-F]{6}\b/.test(s);
    return java && !js;
  }

  // ---------------------------------------------------------------- the converter
  function convert(src) {
    src = String(src);
    const T = sigTokens(src), n = T.length;
    const notes = new Set();
    const edits = [];
    const E = (s, e, t) => edits.push({ s, e, t, k: edits.length });
    const isId = (i, v) => i >= 0 && i < n && T[i].t === 'id' && (v === undefined || T[i].v === v);
    const isP = (i, v) => i >= 0 && i < n && T[i].t === 'punct' && T[i].v === v;
    const val = (i) => (i >= 0 && i < n ? T[i].v : '');
    const OPEN = { '(': ')', '[': ']', '{': '}' };

    const match = (i) => { // index of the bracket closing the one at i, or -1
      const st = [];
      for (let j = i; j < n; j++) {
        const t = T[j];
        if (t.t !== 'punct') continue;
        if (OPEN[t.v]) st.push(OPEN[t.v]);
        else if (')]}'.includes(t.v) && t.v.length === 1) { if (st.pop() !== t.v) return -1; if (!st.length) return j; }
      }
      return -1;
    };
    const skipGenerics = (i) => { // i is at '<': index after the matching '>', or -1
      let d = 0;
      for (let j = i; j < n; j++) {
        const t = T[j];
        if (t.t === 'punct' && t.v === '<') d++;
        else if (t.t === 'punct' && (t.v === '>' || t.v === '>>' || t.v === '>>>')) { d -= t.v.length; if (d <= 0) return d === 0 ? j + 1 : -1; }
        else if (!(t.t === 'id' || (t.t === 'punct' && /^[,?.[\]&]$/.test(t.v)))) return -1;
      }
      return -1;
    };
    // a declaration that starts at token i:  [modifiers] Type[<...>][[]...] name  then  = ; , [ ) : (
    function declAt(i) {
      let j = i; const mods = [];
      while (isId(j) && MODS.has(val(j))) { mods.push(val(j)); j++; }
      if (!isId(j) || KEYWORDS.has(val(j))) return null;
      const typeIdx = j; j++;
      while (isP(j, '.') && isId(j + 1)) j += 2; // a qualified type such as java.util.List
      if (isP(j, '<')) { j = skipGenerics(j); if (j < 0) return null; }
      let dims = 0;
      while (isP(j, '[') && isP(j + 1, ']')) { dims++; j += 2; }
      if (!isId(j) || KEYWORDS.has(val(j))) return null;
      const nameIdx = j, nx = j + 1;
      if (!(T[nx] && T[nx].t === 'punct' && ['=', ';', ',', '[', ')', ':', '('].includes(T[nx].v))) return null;
      return { start: i, mods, typeIdx, type: val(typeIdx), dims, nameIdx, name: val(nameIdx), next: val(nx), nextIdx: nx };
    }
    const namesOf = (d) => { // every name declared by this declaration:  float x, y = 2;
      const out = [d.name]; let depth = 0;
      for (let j = d.nameIdx + 1; j < n; j++) {
        const t = T[j];
        if (t.t !== 'punct') continue;
        if (OPEN[t.v]) depth++;
        else if (')]}'.includes(t.v) && t.v.length === 1) { if (depth === 0) break; depth--; }
        else if (depth === 0 && t.v === ';') break;
        else if (depth === 0 && t.v === ',' && isId(j + 1) && (isP(j + 2, '=') || isP(j + 2, ',') || isP(j + 2, ';'))) out.push(val(j + 1));
      }
      return out;
    };
    const startsStmt = (i) => i === 0 || isP(i - 1, ';') || isP(i - 1, '{') || isP(i - 1, '}');

    // ---- pass 1: class names, variable types, functions
    const classes = new Map(); // name -> { open, close, fields:Set, methods:Set }
    const funcAt0 = (i) => funcs.find((f) => i > f.from && i < f.to && f.to > 0);
    const types = new Map();   // variable name -> 'ArrayList' | 'HashMap' | 'int' ... (last declaration wins)
    const funcs = [];          // { from, to, ret } for int-division fixes
    for (let i = 0; i < n; i++) {
      if (isId(i, 'class') && isId(i + 1)) {
        let j = i + 2; while (j < n && !isP(j, '{')) j++;
        const close = j < n ? match(j) : -1;
        if (close > 0) classes.set(val(i + 1), { name: val(i + 1), kw: i, open: j, close, fields: new Set(), methods: new Set() });
      }
    }
    const inClass = (i) => { for (const c of classes.values()) if (i > c.open && i < c.close) return c; return null; };
    for (let i = 0; i < n; i++) {
      if (!(startsStmt(i) || isP(i - 1, '(') || isP(i - 1, ','))) continue;
      const d = declAt(i);
      if (!d) continue;
      const t = d.dims ? d.type + '[]' : d.type;
      if (d.next === '(') {
        const cl = match(d.nextIdx);
        if (cl > 0 && (isP(cl + 1, '{') || isId(cl + 1, 'throws'))) {
          let b = cl + 1; while (b < n && !isP(b, '{')) b++;
          funcs.push({ from: b, to: match(b), ret: d.dims ? '' : d.type });
          const c = inClass(i); if (c) c.methods.add(d.name);
        }
        continue;
      }
      const all = namesOf(d), c = inClass(i);
      for (const nm of all) { types.set(nm, t); if (c && startsStmt(i) && !funcAt0(i)) c.fields.add(nm); }
    }
    for (let i = 0; i < n; i++) { // constructors:  Name(params) {
      if (isId(i) && classes.has(val(i)) && isP(i + 1, '(') && !isId(i - 1, 'new') && !isId(i - 1, 'class')) {
        const cl = match(i + 1);
        if (cl > 0 && isP(cl + 1, '{')) funcs.push({ from: cl + 1, to: match(cl + 1), ret: '' });
      }
    }
    const funcAt = (i) => funcs.find((f) => i > f.from && i < f.to && f.to > 0);

    // ---- helpers for edits
    let skipTo = 0; // tokens before this index were handled as part of a bigger edit
    const defaultFor = (type, dims) => (dims ? null : NUMERIC.has(type) ? '0' : type === 'boolean' ? 'false' : type === 'char' ? "''" : null);
    // [from, to) tokens -> text
    const range = (a, b, t) => E(T[a].s, T[b].e, t);
    const upTo = (a, b, t) => E(T[a].s, T[b].s, t); // from token a up to where token b starts (takes the space in between)
    const hasTopSlash = (a, b) => { let d = 0; for (let j = a; j <= b; j++) { const t = T[j]; if (t.t !== 'punct') continue; if (OPEN[t.v]) d++; else if (')]}'.includes(t.v) && t.v.length === 1) d--; else if (d === 0 && t.v === '/') return true; } return false; };
    const exprEnd = (a) => { // last token of the expression starting at a (stops at ; or , or ) at depth 0)
      let d = 0;
      for (let j = a; j < n; j++) {
        const t = T[j];
        if (t.t === 'punct') {
          if (OPEN[t.v]) d++;
          else if (')]}'.includes(t.v) && t.v.length === 1) { if (d === 0) return j - 1; d--; }
          else if (d === 0 && (t.v === ';' || t.v === ',')) return j - 1;
        }
      }
      return n - 1;
    };
    // Java divides whole numbers as whole numbers. When the result goes into an int, cut the decimals off.
    const wrapInt = (a, b) => {
      if (b < a || !hasTopSlash(a, b)) return;
      if (isId(a, 'int') && isP(a + 1, '(')) return;
      E(T[a].s, T[a].s, 'int('); E(T[b].e, T[b].e, ')');
    };
    const bracesToBrackets = (open) => { // { {1,2}, {3} }  ->  [ [1,2], [3] ]
      const close = match(open); if (close < 0) return;
      for (let j = open; j <= close; j++) {
        if (isP(j, '{')) E(T[j].s, T[j].e, '['); else if (isP(j, '}')) E(T[j].s, T[j].e, ']');
      }
    };
    const params = (open, close) => { // (final float a, int[] b)  ->  (a, b)
      let from = open + 1;
      for (let j = open + 1; j <= close; j++) {
        if (isP(j, '<')) { const k = skipGenerics(j); if (k > 0) { j = k - 1; continue; } }
        if (j === close || (isP(j, ',') )) {
          if (j > from) {
            const d = declAt(from);
            if (d && d.nameIdx < j) { if (d.nameIdx > from) upTo(from, d.nameIdx, ''); }
          }
          from = j + 1;
        }
        if (OPEN[val(j)] && j !== open) { const k = match(j); if (k > 0) j = k; }
      }
    };

    // ---- pass 2: rewrite
    for (let i = 0; i < n; i++) {
      if (i < skipTo) continue;
      const t = T[i];

      // hex colors:  #8a8f94  ->  '#8a8f94'
      if (t.t === 'punct' && t.v === '#') {
        const m = /^#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w])/.exec(src.slice(t.s, t.s + 10));
        if (m) {
          const end = t.s + m[0].length;
          E(t.s, end, `'${m[0]}'`);
          while (i + 1 < n && T[i + 1].s < end) i++;
          continue;
        }
      }
      // import / package lines
      if (t.t === 'id' && (t.v === 'import' || t.v === 'package') && startsStmt(i)) {
        let j = i; while (j < n && !isP(j, ';')) j++;
        range(i, Math.min(j, n - 1), ''); i = j; continue;
      }
      // annotations: @Override
      if (isP(i, '@') && isId(i + 1)) { range(i, i + 1, ''); i++; continue; }

      // classes: drop "implements ...", fix the members below
      if (isId(i, 'class') && classes.has(val(i + 1))) {
        const c = classes.get(val(i + 1));
        for (let j = i + 2; j < c.open; j++) if (isId(j, 'implements')) { range(j, c.open - 1, ''); break; }
        convertClass(c);
        i = c.open; continue;
      }

      // declarations and functions (outside classes: inside classes convertClass already did the work)
      if (startsStmt(i) && (!inClass(i) || funcAt(i))) {
        const d = declAt(i);
        if (d) { i = Math.max(i, convertDecl(d)); continue; }
      }
      // for ( int i = 0 ... ) and for ( String s : list )
      if (isId(i, 'for') && isP(i + 1, '(')) {
        const d = declAt(i + 2);
        if (d) {
          const first = d.start;
          upTo(first, d.nameIdx, d.mods.includes('final') ? 'const ' : 'let ');
          if (d.next === ':') range(d.nextIdx, d.nextIdx, 'of');
          if (INTS.has(d.type) && !d.dims) types.set(d.name, 'int');
          // a default for  for (int i; ...)  is not needed. Continue after the name so the rest is rewritten normally.
          i = d.nameIdx; continue;
        }
      }
      // catch (Exception e)
      if (isId(i, 'catch') && isP(i + 1, '(')) {
        const d = declAt(i + 2);
        if (d && d.next === ')') { upTo(d.start, d.nameIdx, ''); i = d.nameIdx; continue; }
      }

      // new int[10], new float[w][h], new int[]{1,2}, new ArrayList<Foo>(), new HashMap<K,V>()
      if (isId(i, 'new') && isId(i + 1)) {
        const r = convertNew(i); if (r > i) { i = r; continue; }
      }
      // (int) x  (float) y  (char) z
      if (isP(i, '(') && isId(i + 1) && PRIMS.has(val(i + 1)) && isP(i + 2, ')') && castOperand(i + 3) >= i + 3) {
        const end = castOperand(i + 3), ty = val(i + 1);
        const fn = ty === 'char' ? 'char' : ty === 'boolean' ? 'Boolean' : ty === 'float' || ty === 'double' ? 'float' : 'int';
        upTo(i, i + 3, fn + '(');
        E(T[end].e, T[end].e, ')');
        i += 2; continue;
      }
      // 1.5f  10L  2d
      if (t.t === 'num' && T[i + 1] && T[i + 1].t === 'id' && T[i + 1].s === t.e && /^[fFdDlL]$/.test(T[i + 1].v) && !/^0[xX]/.test(t.v)) { range(i + 1, i + 1, ''); i++; continue; }
      // method names that differ
      if (isP(i, '.') && isId(i + 1) && isP(i + 2, '(')) {
        const m = val(i + 1), recv = isId(i - 1) ? types.get(val(i - 1)) : null, cl = match(i + 2);
        const list = recv && /^ArrayList|^List|\[\]$/.test(recv) && !/^HashMap|^Map/.test(recv), map = recv && /^HashMap|^Map|^HashSet|^Set/.test(recv);
        if (m === 'length' && cl === i + 3) { range(i + 2, i + 3, ''); i += 3; continue; }
        if (m === 'size' && cl === i + 3) { range(i + 1, i + 3, map ? 'size' : 'length'); i += 3; continue; }
        if (m === 'add' && list && !/\[\]$/.test(recv)) { range(i + 1, i + 1, 'push'); i += 1; continue; }
        if (m === 'get' && list && cl > 0) { range(i, i + 2, '['); E(T[cl].s, T[cl].e, ']'); i += 2; continue; }
        if (m === 'remove' && list && cl > 0) { range(i + 1, i + 1, 'splice'); E(T[cl].s, T[cl].s, ', 1'); i += 1; continue; }
        if (m === 'put' && map) { range(i + 1, i + 1, 'set'); i += 1; continue; }
        if (m === 'containsKey' && map) { range(i + 1, i + 1, 'has'); i += 1; continue; }
        if (m === 'isEmpty' && cl === i + 3) { range(i + 1, i + 3, 'length === 0'); i += 3; continue; }
        if (m === 'equals') { /* a String.prototype.equals shim in the sketch handles this */ }
      }
      // library names
      if (isId(i, 'Integer') && isP(i + 1, '.') && /^(parseInt|valueOf)$/.test(val(i + 2))) { range(i, i + 2, 'parseInt'); i += 2; continue; }
      if (isId(i, 'Float') && isP(i + 1, '.') && /^(parseFloat|valueOf)$/.test(val(i + 2))) { range(i, i + 2, 'parseFloat'); i += 2; continue; }
      if (isId(i, 'System') && isP(i + 1, '.') && isId(i + 2, 'out') && isP(i + 3, '.') && /^print(ln)?$/.test(val(i + 4))) { range(i, i + 4, 'println'); i += 4; continue; }
      if (isId(i, 'String') && isP(i + 1, '.') && isId(i + 2, 'valueOf')) { range(i, i + 2, 'String'); i += 2; continue; }
      // x = a / b;  when x is an int
      if (isId(i) && types.get(val(i)) === 'int' && isP(i + 1, '=') && !isP(i - 1, '.')) {
        const a = i + 2, b = exprEnd(a); wrapInt(a, b);
      }
      // return a / b;  in a function that returns int
      if (isId(i, 'return')) { const f = funcAt(i); if (f && INTS.has(f.ret)) { const a = i + 1, b = exprEnd(a); if (b >= a) wrapInt(a, b); } }
    }

    // a cast's operand: a name / number / string / ( group ), with its .x, [i] and (args) tails. Returns its last token.
    function castOperand(i) {
      let j = i;
      while (isP(j, '-') || isP(j, '+') || isP(j, '!') || isP(j, '~')) j++;
      if (j >= n) return -1;
      if (isP(j, '(')) { const c = match(j); if (c < 0) return -1; j = c; }
      else if (T[j].t === 'id' || T[j].t === 'num' || T[j].t === 'str') {
        if (isId(j, 'new')) return -1;
      } else return -1;
      for (;;) {
        if (isP(j + 1, '(') || isP(j + 1, '[')) { const c = match(j + 1); if (c < 0) break; j = c; }
        else if (isP(j + 1, '.') && isId(j + 2)) j += 2;
        else break;
      }
      return j;
    }

    // `new ...` expressions. Returns the last token consumed, or -1 if it left the code alone.
    function convertNew(i) {
      const ty = val(i + 1);
      let j = i + 2;
      if (isP(j, '<')) { const k = skipGenerics(j); if (k < 0) return -1; if (/^(ArrayList|List|LinkedList|HashMap|Map|HashSet|Set|IntList|FloatList|StringList)$/.test(ty) || true) { range(j, k - 1, ''); } j = k; }
      if (/^(ArrayList|LinkedList|IntList|FloatList|StringList)$/.test(ty) && isP(j, '(')) {
        const c = match(j);
        if (c === j + 1) { range(i, c, '[]'); return c; }
        range(i, j, 'Array.from('); return j; // new ArrayList<Foo>(other)  ->  Array.from(other)
      }
      if (/^(HashMap|TreeMap|LinkedHashMap)$/.test(ty)) { range(i + 1, i + 1, 'Map'); return j - 1 > i ? j - 1 : i + 1; }
      if (/^(HashSet|TreeSet)$/.test(ty)) { range(i + 1, i + 1, 'Set'); return j - 1 > i ? j - 1 : i + 1; }
      if (isP(j, '[') ) {
        const dims = []; let k = j;
        while (isP(k, '[')) { const c = match(k); if (c < 0) return -1; dims.push(c > k + 1 ? [k + 1, c - 1] : null); k = c + 1; }
        const text = (r) => src.slice(T[r[0]].s, T[r[1]].e);
        if (dims[0] === null) { // new int[]{1, 2, 3}
          if (isP(k, '{')) { range(i, k - 1, ''); bracesToBrackets(k); return k; }
          return -1;
        }
        const def = PRIMS.has(ty) ? (NUMERIC.has(ty) ? '0' : ty === 'boolean' ? 'false' : "''") : 'null';
        let out = `new Array(${text(dims[0])}).fill(${def})`;
        if (dims.length > 1 && dims[1]) out = `Array.from({ length: ${text(dims[0])} }, () => new Array(${text(dims[1])}).fill(${def}))`;
        if (dims.length > 2 && dims[1] && dims[2]) out = `Array.from({ length: ${text(dims[0])} }, () => Array.from({ length: ${text(dims[1])} }, () => new Array(${text(dims[2])}).fill(${def})))`;
        range(i, k - 1, out);
        return k - 1;
      }
      return -1;
    }

    // a declaration outside a class (or inside a method). Returns the last token it dealt with.
    function convertDecl(d) {
      if (d.next === '(') { // a function
        const cl = match(d.nextIdx);
        if (cl > 0 && (isP(cl + 1, '{') || isId(cl + 1, 'throws'))) {
          upTo(d.start, d.nameIdx, 'function ');
          params(d.nextIdx, cl);
          if (isId(cl + 1, 'throws')) { let b = cl + 1; while (b < n && !isP(b, '{')) b++; range(cl + 1, b - 1, ''); }
          return d.nextIdx;
        }
        return d.start;
      }
      upTo(d.start, d.nameIdx, d.mods.includes('final') ? 'const ' : 'let ');
      let j = d.nameIdx, name = d.name;
      const type = d.type, dims = d.dims;
      for (;;) { // every name in a list:  int a = 1, b, c = 3;
        types.set(name, dims ? type + '[]' : INTS.has(type) ? 'int' : type);
        let k = j + 1;
        while (isP(k, '[') && isP(k + 1, ']')) { range(k, k + 1, ''); k += 2; }
        if (isP(k, '=')) {
          const a = k + 1, b = exprEnd(a);
          if (isP(a, '{')) bracesToBrackets(a);
          if (INTS.has(type) && !dims) wrapInt(a, b);
          k = b + 1;
        } else {
          const def = defaultFor(type, dims);
          if (def !== null) E(T[j].e, T[j].e, ' = ' + def);
        }
        if (isP(k, ',') && isId(k + 1)) { j = k + 1; name = val(j); continue; }
        break;
      }
      return d.nameIdx;
    }

    // class Name { fields, constructors, methods }
    function convertClass(c) {
      const ctorOk = (i) => isId(i, c.name) && isP(i + 1, '(');
      const members = []; // [from, to] token ranges of each member at depth 1
      let i = c.open + 1;
      while (i < c.close) {
        let j = i;
        for (; j < c.close; j++) {
          if (isP(j, ';')) break;
          if (T[j].t === 'punct' && OPEN[T[j].v]) {
            const k = match(j);
            if (k < 0) { j = c.close; break; }
            const body = T[j].v === '{' && (isP(j - 1, ')') || isId(j - 1)); // a method body ends the member; an initializer { } does not
            j = k;
            if (body) break;
          }
        }
        if (j > c.close - 1) j = c.close - 1;
        if (j >= i) members.push([i, j]);
        i = j + 1;
      }
      const bodies = [];
      for (const [a, b] of members) {
        let s = a;
        while (isId(s) && MODS.has(val(s)) && s < b) { if (val(s) === 'static') notes.add('static members of a class become ordinary members.'); s++; }
        if (ctorOk(s)) { // constructor
          const cl = match(s + 1);
          if (a < s) upTo(a, s, '');
          range(s, s, 'constructor'); params(s + 1, cl);
          bodies.push({ from: cl + 1, to: b, params: declNames(s + 1, cl) });
          continue;
        }
        const d = declAt(s);
        if (!d) continue;
        if (d.next === '(') { // method
          const cl = match(d.nextIdx);
          if (a < d.nameIdx) upTo(a, d.nameIdx, '');
          params(d.nextIdx, cl);
          if (isId(cl + 1, 'throws')) { let q = cl + 1; while (q < n && !isP(q, '{')) q++; range(cl + 1, q - 1, ''); }
          bodies.push({ from: cl + 1, to: b, params: declNames(d.nextIdx, cl) });
          continue;
        }
        // field(s):  float x, y = 2;
        if (a < d.nameIdx) upTo(a, d.nameIdx, '');
        let j = d.nameIdx, type = d.type, dims = d.dims;
        for (;;) {
          let k = j + 1;
          if (isP(k, '=')) {
            const x = k + 1, y = exprEnd(x);
            if (isP(x, '{')) bracesToBrackets(x);
            if (INTS.has(type) && !dims) wrapInt(x, y);
            k = y + 1;
          } else { const def = defaultFor(type, dims); if (def !== null) E(T[j].e, T[j].e, ' = ' + def); }
          if (isP(k, ',') && isId(k + 1)) { range(k, k, ';'); j = k + 1; continue; }
          break;
        }
      }
      // inside methods, a bare field or method name means this.name
      for (const body of bodies) {
        if (body.to <= body.from) continue;
        const locals = new Set(body.params);
        for (let q = body.from; q <= body.to; q++) {
          if (startsStmt(q) || isP(q - 1, '(')) { const dq = declAt(q); if (dq && dq.next !== '(') namesOf(dq).forEach((x) => locals.add(x)); }
        }
        for (let q = body.from; q <= body.to; q++) {
          if (!isId(q)) continue;
          const nm = val(q);
          if (!(c.fields.has(nm) || c.methods.has(nm)) || locals.has(nm) || isP(q - 1, '.')) continue;
          if (isP(q + 1, ':') && !isP(q - 1, '?')) continue; // a label or object key
          E(T[q].s, T[q].s, 'this.');
        }
      }
    }
    function declNames(open, close) { // names in a parameter list
      const out = []; let from = open + 1;
      for (let j = open + 1; j <= close; j++) {
        if (j === close || isP(j, ',')) { if (j > from) { const d = declAt(from); if (d) out.push(d.name); } from = j + 1; }
        else if (OPEN[val(j)]) { const k = match(j); if (k > 0) j = k; }
      }
      return out;
    }

    // ---- apply the edits (left to right; an edit inside an earlier one is dropped)
    edits.sort((a, b) => a.s - b.s || a.e - b.e || a.k - b.k);
    let out = '', pos = 0;
    for (const e of edits) {
      if (e.s < pos) continue;
      out += src.slice(pos, e.s) + e.t; pos = Math.max(e.e, e.s);
    }
    out += src.slice(pos);
    // what to know about the result
    const size = /\b(?:size|fullScreen)\s*\(\s*(\d+)\s*,\s*(\d+)/.exec(src);
    if (size) notes.add(`The canvas takes the size from size(${size[1]}, ${size[2]}).`);
    const bare = stripStrings(out);
    const found = [
      ...UNSUPPORTED_CALLS.filter((w) => new RegExp('(^|[^\\w.])' + w + '\\s*\\(').test(bare)),
      ...UNSUPPORTED_WORDS.filter((w) => new RegExp('(^|[^\\w.])' + w + '\\b').test(bare)),
    ];
    const list = [...notes];
    if (found.length) list.push(`Daub does not have these yet, so the sketch may not run: ${found.join(', ')}.`);
    return { code: out, notes: list, changed: out !== src };
  }
  const stripStrings = (s) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');

  D.pde = { looksLikeJava, convert };
})(window);
