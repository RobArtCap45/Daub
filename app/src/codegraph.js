/* Daub code graph: Processing-style JavaScript <-> a graph of statement nodes.
 *
 * compile(text)   code -> { nodes, edges, subs }      (every statement becomes a node, wired in the order it runs)
 * generate(graph) graph -> code                        (walks the wires from the Start node)
 *
 * A graph is the same shape the node editor already uses:
 *   nodes: [{ id, type, x, y, params }]   edges: [{ from, to, input: 'flow' }]   subs: { <nodeId>: { name, nodes, edges } }
 * Loops, ifs and functions are "container" nodes: their body is a graph of its own in subs[nodeId].
 * Code the parser does not understand is kept verbatim in a Raw node, so nothing is ever lost.
 *
 * This file does not touch the page, so the tests load it straight into Node.
 */
(function (g) {
  'use strict';
  const D = (g.Daub = g.Daub || {});

  // ---------------------------------------------------------------- tokenizer
  const lineOf = (src, at) => { let n = 1; for (let i = 0; i < at && i < src.length; i++) if (src[i] === '\n') n++; return n; };
  const fail = (src, at, msg) => { const e = new Error(msg); e.line = lineOf(src, at); throw e; };
  const PUNCT = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**'];
  const NUM = /(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?/y;
  const IDENT = /[A-Za-z_$\u0080-￿][\w$\u0080-￿]*/y;
  const REGEX_AFTER = /^(?:return|typeof|case|in|of|new|delete|void|throw|else|do|instanceof|yield|await)$/;

  // index just after a template literal that starts at i (a backtick)
  function skipTemplate(src, i) {
    let j = i + 1;
    while (j < src.length) {
      const c = src[j];
      if (c === '\\') j += 2;
      else if (c === '`') return j + 1;
      else if (c === '$' && src[j + 1] === '{') j = skipBraces(src, j + 2);
      else j++;
    }
    return fail(src, i, 'This template string is never closed.');
  }
  // index just after the } that closes a ${ ... } (j is the first character inside)
  function skipBraces(src, j) {
    let depth = 1;
    while (j < src.length) {
      const c = src[j];
      if (c === '`') { j = skipTemplate(src, j); continue; }
      if (c === '"' || c === "'") { j++; while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; } j++; continue; }
      if (c === '/' && src[j + 1] === '/') { while (j < src.length && src[j] !== '\n') j++; continue; }
      if (c === '/' && src[j + 1] === '*') { const k = src.indexOf('*/', j + 2); j = k < 0 ? src.length : k + 2; continue; }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return j + 1;
      j++;
    }
    return fail(src, j, 'This ${ in a template string is never closed.');
  }

  function tokenize(src) {
    const T = [], n = src.length;
    const push = (t, s, e) => T.push({ t, v: src.slice(s, e), s, e });
    const prevSig = () => { for (let k = T.length - 1; k >= 0; k--) if (T[k].t !== 'comment' && T[k].t !== 'nl') return T[k]; return null; };
    let i = 0;
    while (i < n) {
      const ch = src[i];
      if (ch === '\n') { push('nl', i, i + 1); i++; continue; }
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '/' && src[i + 1] === '/') { let j = src.indexOf('\n', i); if (j < 0) j = n; push('comment', i, j); i = j; continue; }
      if (ch === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); if (j < 0) fail(src, i, 'This /* comment is never closed.'); push('comment', i, j + 2); i = j + 2; continue; }
      if (ch === '"' || ch === "'") {
        let j = i + 1;
        while (j < n && src[j] !== ch) { if (src[j] === '\\') j++; else if (src[j] === '\n') fail(src, i, 'This string is never closed.'); j++; }
        if (j >= n) fail(src, i, 'This string is never closed.');
        push('str', i, j + 1); i = j + 1; continue;
      }
      if (ch === '`') { const j = skipTemplate(src, i); push('str', i, j); i = j; continue; }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) { NUM.lastIndex = i; const m = NUM.exec(src); push('num', i, i + m[0].length); i += m[0].length; continue; }
      if (/[A-Za-z_$\u0080-￿]/.test(ch)) { IDENT.lastIndex = i; const m = IDENT.exec(src); push('id', i, i + m[0].length); i += m[0].length; continue; }
      if (ch === '/') {
        const p = prevSig();
        const regexOk = !p || (p.t === 'punct' && !/^[)\]}]$/.test(p.v)) || (p.t === 'id' && REGEX_AFTER.test(p.v));
        if (regexOk) {
          let j = i + 1, cls = false;
          for (; j < n; j++) {
            const c = src[j];
            if (c === '\\') j++;
            else if (c === '[') cls = true;
            else if (c === ']') cls = false;
            else if (c === '/' && !cls) break;
            else if (c === '\n') fail(src, i, 'This regular expression is never closed.');
          }
          if (j >= n) fail(src, i, 'This regular expression is never closed.');
          j++; while (j < n && /[a-z]/i.test(src[j])) j++;
          push('regex', i, j); i = j; continue;
        }
      }
      const op = PUNCT.find((q) => src.startsWith(q, i));
      if (op) { push('punct', i, i + op.length); i += op.length; continue; }
      push('punct', i, i + 1); i++;
    }
    return T;
  }

  // Keep the meaningful tokens; remember the newlines and comments around each one.
  //   tok.nlBefore: a line break came before it (for automatic semicolons)
  //   tok.blank:    a blank line came before it (kept so spacing survives)
  //   tok.comments: [{ text, trail }] comments between the previous token and this one (trail = on the previous token's line)
  function prepare(src) {
    const S = [];
    let comments = [], nl = 0, run = 0, firstRun = null, hasPrev = false;
    const take = (tok) => {
      tok.nlBefore = nl > 0; tok.blank = firstRun !== null ? firstRun >= 2 : run >= 2; tok.comments = comments;
      S.push(tok); comments = []; nl = 0; run = 0; firstRun = null; hasPrev = true;
    };
    for (const t of tokenize(src)) {
      if (t.t === 'nl') { nl++; run++; }
      else if (t.t === 'comment') {
        const trail = hasPrev && nl === 0 && !comments.some((c) => !c.trail);
        if (!trail && firstRun === null) firstRun = run;
        comments.push({ text: t.v, trail }); run = 0;
      } else take(t);
    }
    take({ t: 'eof', v: '', s: src.length, e: src.length });
    return S;
  }

  // ---------------------------------------------------------------- parser
  const OPEN = { '(': ')', '[': ']', '{': '}' };
  const isP = (t, v) => t && t.t === 'punct' && t.v === v;
  const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
  const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '&&=', '||=', '??=']);
  const CONT_NEXT = /^(?:\.|\?\.|\(|\[|,|\?|:|=|=>|==|===|!=|!==|<|>|<=|>=|\*|\/|%|&&|\|\||\?\?|&|\||\^|<<|>>|>>>|\+|-|\*\*|[-+*/%&|^]=|\*\*=|<<=|>>=|>>>=|&&=|\|\|=|\?\?=)$/;

  function Parser(src) {
    const S = prepare(src);
    let i = 0;
    const P = {
      src, S,
      get i() { return i; }, set i(v) { i = v; },
      tok: () => S[i],
      text: (a, b) => src.slice(S[a].s, S[b].e), // source from token a through token b (inclusive)
      // index of the bracket that closes the one at k
      close(k) {
        const stack = [];
        for (let j = k; j < S.length; j++) {
          const t = S[j];
          if (t.t !== 'punct') continue;
          if (OPEN[t.v]) stack.push(OPEN[t.v]);
          else if (t.v === ')' || t.v === ']' || t.v === '}') { if (stack.pop() !== t.v) fail(src, t.s, `Unexpected ${t.v}`); if (!stack.length) return j; }
        }
        return fail(src, S[k].s, `This ${S[k].v} is never closed.`);
      },
      // split tokens a..b (inclusive) at top-level separators
      split(a, b, sep) {
        const parts = []; let depth = 0, from = a;
        for (let j = a; j <= b; j++) {
          const t = S[j];
          if (t.t === 'punct') {
            if (OPEN[t.v]) depth++; else if (t.v === ')' || t.v === ']' || t.v === '}') depth--;
            else if (depth === 0 && t.v === sep) { parts.push([from, j - 1]); from = j + 1; }
          }
        }
        parts.push([from, b]);
        return parts;
      },
      slice(range) { return range[1] < range[0] ? '' : tidy(P.text(range[0], range[1])); },
      // where does the statement that starts at token `from` end? -> { last: its final token, next: the token after its terminator }
      end(from, blockKw) {
        let depth = 0;
        for (let j = from; j < S.length; j++) {
          const t = S[j];
          if (t.t === 'eof') return { last: j - 1, next: j, semi: false };
          if (t.t === 'punct') {
            if (depth === 0 && t.v === ';') return { last: j - 1, next: j + 1, semi: true, semiAt: j };
            if (OPEN[t.v]) depth++;
            else if (t.v === ')' || t.v === ']' || t.v === '}') { depth--; if (depth < 0) return { last: j - 1, next: j, semi: false }; }
          }
          const nx = S[j + 1];
          if (depth === 0 && nx && nx.t !== 'eof' && nx.nlBefore && !continues(t, nx, blockKw)) return { last: j, next: j + 1, semi: false };
        }
        return { last: S.length - 2, next: S.length - 1, semi: false };
      },
    };
    return P;
  }
  // does the statement go on across a line break between prev and next? (JavaScript's automatic semicolon rules, roughly)
  function continues(prev, next, blockKw) {
    if (blockKw && isP(next, '{') && !isP(prev, '}')) return true; // class A\n{ ... }
    if (prev.t === 'id' && /^(?:return|break|continue|throw)$/.test(prev.v)) return false;
    if (blockKw && isP(prev, '}')) {
      if (blockKw === 'try') return isId(next, 'catch') || isId(next, 'finally');
      if (blockKw === 'do') return isId(next, 'while');
      return false;
    }
    if (prev.t === 'punct' && !/^(?:\)|\]|\}|\+\+|--)$/.test(prev.v)) return true;
    if (prev.t === 'id' && /^(?:typeof|new|in|of|instanceof|delete|void|await|else)$/.test(prev.v)) return true;
    if (next.t === 'punct') return CONT_NEXT.test(next.v);
    if (next.t === 'id' && /^(?:in|of|instanceof)$/.test(next.v)) return true;
    return false;
  }
  // whitespace inside a value: a line break becomes a space, unless a comment, a { block } or a template string is in the way
  const tidy = (s) => (/[`{}]|\/\//.test(s) ? s.trim() : s.replace(/\s*\n\s*/g, ' ').trim());

  const noteOf = (comments) => {
    if (!comments.length) return '';
    if (comments.every((c) => c.text.startsWith('//'))) return comments.map((c) => c.text.replace(/^\/\/ ?/, '')).join('\n');
    return comments.map((c) => c.text).join('\n'); // block comments stay as they were typed
  };
  const callParts = (P, a, b) => { // is tokens a..b exactly  name(args) or a.b.c(args)?  -> { fn, args } or null
    const S = P.S;
    if (!isId(S[a])) return null;
    let k = a + 1;
    while (isP(S[k], '.') && S[k + 1] && S[k + 1].t === 'id' && k + 1 <= b) k += 2;
    if (!isP(S[k], '(') || k > b) return null;
    if (/^(?:function|typeof|void|delete|new|await|yield|class|if|for|while|switch|return)$/.test(S[a].v)) return null;
    const cl = P.close(k);
    if (cl !== b) return null;
    const fn = P.text(a, k - 1).replace(/\s+/g, '');
    let args = [];
    if (cl > k + 1) {
      args = P.split(k + 1, cl - 1, ',').map((r) => P.slice(r));
      if (args.length > 1 && args[args.length - 1] === '') args.pop(); // a trailing comma
    }
    return args.length > 12 || args.some((x) => x === '') ? null : { fn, args };
  };
  const targetOk = (P, a, b) => { // left side of an assignment: name, name.prop, name[expr] ...
    const S = P.S;
    if (b < a || !isId(S[a])) return false;
    let k = a + 1;
    while (k <= b) {
      if (isP(S[k], '.') && S[k + 1] && S[k + 1].t === 'id' && k + 1 <= b) k += 2;
      else if (isP(S[k], '[')) { const c = P.close(k); if (c > b) return false; k = c + 1; }
      else return false;
    }
    return true;
  };

  // statements -> items: { kind, ...fields, note, trail, blank, body? }
  function parseStatements(P, inBlock) {
    const items = [];
    for (;;) {
      let t = P.tok();
      if (t.t === 'eof') { if (inBlock) fail(P.src, P.src.length, 'A { is never closed.'); break; }
      if (isP(t, '}')) { if (inBlock) break; fail(P.src, t.s, 'Unexpected }'); }
      if (isP(t, ';')) { P.i++; continue; }
      const lead = t.comments, blank = t.blank && items.length > 0;
      const first = items.length;
      parseOne(P, items);
      if (items[first]) { if (lead.length) items[first].note = noteOf(lead); if (blank) items[first].blank = true; }
      const after = P.tok(), trail = after.comments.filter((c) => c.trail);
      if (trail.length && items.length) { items[items.length - 1].trail = noteOf(trail); after.comments = after.comments.filter((c) => !c.trail); }
    }
    const t = P.tok(), rest = t.comments;
    if (rest.length) { const it = { kind: 'comment', note: noteOf(rest) }; if (t.blank && items.length) it.blank = true; items.push(it); t.comments = []; }
    return items;
  }
  function parseBody(P) { // { ... } or a single statement
    if (isP(P.tok(), '{')) {
      const open = P.i; P.close(open); P.i++;
      const items = parseStatements(P, true);
      P.i++; // the }
      return items;
    }
    const items = []; parseOne(P, items); return items;
  }

  function parseOne(P, items) {
    const { S } = P, t = P.tok(), start = P.i;
    const raw = (to) => { items.push({ kind: 'raw', code: P.text(start, to) }); };
    if (t.t === 'id') {
      switch (t.v) {
        case 'function': {
          if (isId(S[start + 1]) && isP(S[start + 2], '(')) {
            const cl = P.close(start + 2);
            if (isP(S[cl + 1], '{')) {
              P.i = cl + 1;
              const body = parseBody(P);
              items.push({ kind: 'func', name: S[start + 1].v, params: cl > start + 3 ? P.slice([start + 3, cl - 1]) : '', body });
              return;
            }
          }
          break;
        }
        case 'for': {
          if (!isP(S[start + 1], '(')) break;
          const cl = P.close(start + 1);
          P.i = cl + 1;
          const body = parseBody(P), last = P.i - 1;
          const parts = cl > start + 2 ? P.split(start + 2, cl - 1, ';') : [];
          if (parts.length === 3) { items.push({ kind: 'for', init: P.slice(parts[0]), test: P.slice(parts[1]), step: P.slice(parts[2]), body }); return; }
          if (parts.length === 1 && !isId(S[start + 1 + 1], 'await') && (() => { let d = 0; for (let j = start + 2; j < cl; j++) { const q = S[j]; if (q.t === 'punct') { if (OPEN[q.v]) d++; else if (')]}'.includes(q.v)) d--; } else if (d === 0 && q.t === 'id' && (q.v === 'of' || q.v === 'in')) return true; } return false; })()) {
            items.push({ kind: 'foreach', head: P.slice(parts[0]), body }); return;
          }
          raw(last); return;
        }
        case 'while': {
          if (!isP(S[start + 1], '(')) break;
          const cl = P.close(start + 1);
          P.i = cl + 1;
          const body = parseBody(P);
          items.push({ kind: 'while', test: P.slice([start + 2, cl - 1]), body }); return;
        }
        case 'if': {
          if (!isP(S[start + 1], '(')) break;
          let cl = P.close(start + 1);
          P.i = cl + 1;
          items.push({ kind: 'if', test: P.slice([start + 2, cl - 1]), body: parseBody(P) });
          while (isId(P.tok(), 'else')) {
            const e = P.tok(), lead = e.comments; P.i++;
            let it;
            if (isId(P.tok(), 'if') && isP(S[P.i + 1], '(')) {
              const k = P.i; cl = P.close(k + 1); P.i = cl + 1;
              it = { kind: 'elseif', test: P.slice([k + 2, cl - 1]), body: parseBody(P) };
            } else it = { kind: 'else', body: parseBody(P) };
            if (lead.length) it.note = noteOf(lead);
            items.push(it);
            if (it.kind === 'else') break;
          }
          return;
        }
        case 'return': case 'break': case 'continue': {
          const e = P.end(start);
          P.i = e.next;
          const rest = e.last >= start + 1 ? P.slice([start + 1, e.last]) : '';
          if (t.v === 'return') items.push({ kind: 'return', expr: rest });
          else if (!rest) items.push({ kind: t.v });
          else raw(e.semi ? e.semiAt : e.last);
          return;
        }
        case 'let': case 'const': case 'var': {
          const e = P.end(start), end = e.last;
          P.i = e.next;
          if (isId(S[start + 1]) && end >= start + 1) {
            const rest = end >= start + 2 ? [start + 2, end] : null;
            if (!rest) { items.push({ kind: 'let', kw: t.v, name: S[start + 1].v, value: '' }); return; }
            if (isP(S[start + 2], '=') && P.split(start + 3, end, ',').length === 1 && end >= start + 3) { items.push({ kind: 'let', kw: t.v, name: S[start + 1].v, value: P.slice([start + 3, end]) }); return; }
          }
          raw(e.semi ? e.semiAt : end); return;
        }
        case 'class': case 'switch': case 'try': case 'do': case 'with': case 'async': case 'import': case 'export': case 'throw': case 'debugger': {
          const e = P.end(start, /^(?:try|do)$/.test(t.v) ? t.v : 'block');
          P.i = e.next; raw(e.semi ? e.semiAt : e.last); return;
        }
        default:
      }
    }
    if (isP(t, '{')) { const cl = P.close(start); P.i = cl + 1; raw(cl); return; }
    // an expression statement: a call, an assignment, or anything else
    const e = P.end(start), last = e.last;
    P.i = e.next;
    if (last < start) return;
    const call = callParts(P, start, last);
    if (call) { items.push({ kind: 'call', fn: call.fn, args: call.args }); return; }
    let depth = 0, at = -1;
    for (let j = start; j <= last; j++) {
      const q = S[j];
      if (q.t !== 'punct') continue;
      if (OPEN[q.v]) depth++; else if (q.v === ')' || q.v === ']' || q.v === '}') depth--;
      else if (depth === 0 && ASSIGN.has(q.v)) { at = j; break; }
      else if (depth === 0 && q.v === '=>') break;
    }
    if (at > start && at < last && targetOk(P, start, at - 1)) { items.push({ kind: 'set', target: P.slice([start, at - 1]), op: S[at].v, value: P.slice([at + 1, last]) }); return; }
    items.push({ kind: 'run', expr: P.slice([start, last]) });
  }

  // ---------------------------------------------------------------- Processing calls the nodes know by name
  // name: [labels, default arguments (separated by |), category, description]
  const COLOR_LABELS = { 1: ['gray'], 2: ['gray', 'alpha'], 3: ['red / hue', 'green / sat', 'blue / bri'], 4: ['red / hue', 'green / sat', 'blue / bri', 'alpha'] };
  const API = {
    background: ['', '20|20|30', 'Style', 'Fills the whole canvas with a color.', COLOR_LABELS],
    fill: ['', '232|72|58', 'Style', 'Sets the color shapes are filled with.', COLOR_LABELS],
    stroke: ['', '255|255|255', 'Style', 'Sets the color of outlines and lines.', COLOR_LABELS],
    noFill: ['', '', 'Style', 'Shapes after this have no fill.'],
    noStroke: ['', '', 'Style', 'Shapes after this have no outline.'],
    strokeWeight: ['weight', '2', 'Style', 'Sets how thick lines and outlines are.'],
    strokeCap: ['cap', 'ROUND', 'Style', 'Sets the ends of lines: ROUND, SQUARE or PROJECT.'],
    strokeJoin: ['join', 'ROUND', 'Style', 'Sets the corners of outlines: MITER, BEVEL or ROUND.'],
    colorMode: ['mode max1 max2 max3 maxA', 'HSB', 'Style', 'Chooses RGB or HSB colors, and their ranges.'],
    blendMode: ['mode', 'ADD', 'Style', 'How new shapes mix with what is already drawn.'],
    rect: ['x y w h radius', '40|40|120|80', 'Draw', 'Draws a rectangle.'],
    square: ['x y size', '40|40|100', 'Draw', 'Draws a square.'],
    ellipse: ['x y w h', 'width / 2|height / 2|160|100', 'Draw', 'Draws an ellipse.'],
    circle: ['x y diameter', 'width / 2|height / 2|120', 'Draw', 'Draws a circle.'],
    line: ['x1 y1 x2 y2', '40|40|width - 40|height - 40', 'Draw', 'Draws a line between two points.'],
    point: ['x y', 'width / 2|height / 2', 'Draw', 'Draws a single point.'],
    triangle: ['x1 y1 x2 y2 x3 y3', '300|100|100|450|500|450', 'Draw', 'Draws a triangle.'],
    quad: ['x1 y1 x2 y2 x3 y3 x4 y4', '100|100|500|140|460|480|140|440', 'Draw', 'Draws a four-sided shape.'],
    arc: ['x y w h start stop', 'width / 2|height / 2|240|240|0|PI', 'Draw', 'Draws part of an ellipse (angles in radians).'],
    bezier: ['x1 y1 cx1 cy1 cx2 cy2 x2 y2', '60|500|60|100|540|100|540|500', 'Draw', 'Draws a curve with two control points.'],
    text: ['text x y', "'Hello'|40|60", 'Text', 'Writes text on the canvas.'],
    textSize: ['size', '24', 'Text', 'Sets the size of text.'],
    textAlign: ['horizontal vertical', 'CENTER|CENTER', 'Text', 'Sets how text lines up with its point.'],
    textFont: ['font size', "createFont('Courier', 16)", 'Text', 'Picks the font (made with createFont).'],
    image: ['image x y w h', 'img|0|0|width|height', 'Draw', 'Draws a loaded picture.'],
    beginShape: ['mode', '', 'Draw', 'Starts a shape made of vertices.'],
    vertex: ['x y', '100|100', 'Draw', 'Adds a corner to the shape being drawn.'],
    endShape: ['close', 'CLOSE', 'Draw', 'Finishes the shape.'],
    translate: ['x y', 'width / 2|height / 2', 'Transform', 'Moves the origin.'],
    rotate: ['angle', 'PI / 4', 'Transform', 'Turns everything drawn after it (radians).'],
    scale: ['x y', '1.5', 'Transform', 'Makes everything drawn after it bigger or smaller.'],
    shearX: ['angle', 'PI / 8', 'Transform', 'Slants everything after it sideways.'],
    shearY: ['angle', 'PI / 8', 'Transform', 'Slants everything after it up or down.'],
    resetMatrix: ['', '', 'Transform', 'Undoes every move, turn and scale.'],
    push: ['', '', 'Transform', 'Saves the current transform and style.'],
    pop: ['', '', 'Transform', 'Goes back to the last push().'],
    pushMatrix: ['', '', 'Transform', 'Saves the current transform.'],
    popMatrix: ['', '', 'Transform', 'Goes back to the last pushMatrix().'],
    noLoop: ['', '', 'Other', 'Draw once instead of every frame.'],
    loop: ['', '', 'Other', 'Draw every frame again.'],
    redraw: ['', '', 'Other', 'Draw one more frame.'],
    frameRate: ['fps', '30', 'Other', 'Sets how many frames a second.'],
    randomSeed: ['seed', '1', 'Other', 'Makes random() repeat the same numbers.'],
    noiseSeed: ['seed', '1', 'Other', 'Makes noise() repeat the same values.'],
    print: ['value', "'hello'", 'Other', 'Prints a value in the browser console.'],
  };
  const labelsFor = (fn, n) => {
    const a = API[fn];
    if (a && a[4] && a[4][n]) return a[4][n];
    if (a && a[0]) return a[0].split(' ');
    return [];
  };

  // ---------------------------------------------------------------- node definitions (what the editor needs)
  const note = { n: 'note', t: 'note', d: '', label: '// comment' };
  const flowIn = { n: 'flow', t: 'flow', d: null, label: 'after' };
  const txt = (n, label, d = '') => ({ n, t: 'text', d, label });
  const sel = (n, label, o, d) => ({ n, t: 'enum', o, d: d || o[0], label });
  const stmt = (label, cat, desc, inputs, extra) => ({ label, cat, desc, out: 'flow', inputs: [flowIn, ...inputs, note], ...extra });
  const FIXED = {
    start: { label: 'Start', cat: 'Flow', desc: 'Where the code begins. Connect the first statement to it.', out: 'flow', inputs: [], singleton: true },
    let: stmt('variable', 'Data', 'Makes a variable (let / const) with a starting value.', [sel('kw', 'keyword', ['let', 'const', 'var']), txt('name', 'name', 'x'), txt('value', 'value')]),
    set: stmt('set', 'Data', 'Changes a variable: x = 5, x += 1 …', [txt('target', 'variable', 'x'), sel('op', 'operation', ['=', '+=', '-=', '*=', '/=', '%=', '**=', '&&=', '||=', '??=']), txt('value', 'value')]),
    run: stmt('statement', 'Data', 'Any one line of code, like i++ or list.push(x).', [txt('expr', 'code')]),
    return: stmt('return', 'Data', 'Leaves the function, optionally with a value.', [txt('expr', 'value')]),
    break: stmt('break', 'Flow', 'Leaves the loop.', []),
    continue: stmt('continue', 'Flow', 'Skips to the next round of the loop.', []),
    func: stmt('function', 'Flow', 'Your own function (setup and draw are functions too). Open it to edit what is inside.', [txt('name', 'name', 'myFunction'), txt('params', 'inputs')], { container: true }),
    for: stmt('for', 'Flow', 'Repeats what is inside, counting. Open it to edit what is inside.', [txt('init', 'start', 'let i = 0'), txt('test', 'while', 'i < 10'), txt('step', 'each time', 'i++')], { container: true }),
    foreach: stmt('for each', 'Flow', 'Repeats what is inside for every item in a list.', [txt('head', 'for (…)', 'const item of items')], { container: true }),
    while: stmt('while', 'Flow', 'Repeats what is inside while something is true.', [txt('test', 'while', 'true')], { container: true }),
    if: stmt('if', 'Flow', 'Runs what is inside only if something is true.', [txt('test', 'if', 'true')], { container: true }),
    elseif: stmt('else if', 'Flow', 'Another condition. Put it right after an if.', [txt('test', 'else if', 'true')], { container: true, follows: true }),
    else: stmt('else', 'Flow', 'Runs when the if before it was not true. Put it right after an if.', [], { container: true, follows: true }),
    raw: stmt('code', 'Data', 'Plain code Daub has no node for. It is kept exactly as you typed it.', [{ n: 'code', t: 'code', d: '', label: 'code' }]),
    comment: { label: 'comment', cat: 'Other', desc: 'A note to yourself. It does not run.', out: 'flow', inputs: [flowIn, { n: 'note', t: 'note', d: '', label: 'comment' }] },
  };
  const MISSING = { label: 'Unknown', cat: 'Other', desc: '', out: 'flow', inputs: [flowIn, note] };
  const cache = new Map();
  function getDef(type) {
    if (FIXED[type]) return FIXED[type];
    if (cache.has(type)) return cache.get(type);
    const m = /^call:(.+)\/(\d+)$/.exec(type);
    if (!m) return MISSING;
    const fn = m[1], n = +m[2], labels = labelsFor(fn, n), a = API[fn];
    const d = stmt(fn, (a && a[2]) || 'Call', (a && a[3]) || `Calls ${fn}().`,
      Array.from({ length: n }, (_, k) => txt('a' + k, labels[k] || 'argument ' + (k + 1))), { variadic: { fn, min: 0, max: 12 } });
    cache.set(type, d);
    return d;
  }

  // what the "add node" menu offers, and the values a new node starts with
  const DEFAULTS = {
    let: { kw: 'let', name: 'x', value: '0' }, set: { target: 'x', op: '=', value: '0' }, run: { expr: '' },
    for: { init: 'let i = 0', test: 'i < 10', step: 'i++' }, foreach: { head: 'const item of items' }, while: { test: 'true' },
    if: { test: 'true' }, elseif: { test: 'true' }, func: { name: 'myFunction', params: '' }, raw: { code: '' }, comment: { note: '' },
  };
  function defaults(type) {
    if (DEFAULTS[type]) return { ...DEFAULTS[type] };
    const m = /^call:(.+)\/(\d+)$/.exec(type), out = {};
    if (!m) return out;
    const a = API[m[1]], ds = a && a[1] ? a[1].split('|') : [];
    for (let k = 0; k < +m[2]; k++) out['a' + k] = ds[k] || '0';
    return out;
  }
  // what a new argument starts as when you press + on a call (a color's last value is alpha, so it starts opaque)
  const newArg = (fn, k) => ((fn === 'fill' || fn === 'stroke' || fn === 'background') && (k === 1 || k === 3) ? '255' : '0');
  function entries() {
    const list = ['let', 'set', 'run', 'for', 'foreach', 'while', 'if', 'elseif', 'else', 'func', 'return', 'break', 'continue', 'raw', 'comment'].map((type) => ({ type, label: FIXED[type].label, cat: FIXED[type].cat, desc: FIXED[type].desc }));
    for (const [fn, a] of Object.entries(API)) {
      const n = a[1] ? a[1].split('|').length : 0;
      list.push({ type: `call:${fn}/${n}`, label: fn + '()', cat: a[2], desc: a[3] });
    }
    return list;
  }

  // ---------------------------------------------------------------- items -> graph
  const COLS = 4, NODE_W = 300;
  function heightOf(n) {
    const d = getDef(n.type);
    let h = 40;
    for (const s of d.inputs) {
      const v = (n.params && n.params[s.n]) || '';
      if (s.t === 'code') h += 24 + 18 * Math.min(8, String(v).split('\n').length + 1);
      else if (s.t === 'note') h += v ? 14 + 16 * Math.min(4, String(v).split('\n').length) : 0;
      else h += 28;
    }
    return h;
  }
  function layout(gph) { // chain order, left to right, wrapping every few nodes
    const order = [], seen = new Set(), next = new Map(gph.edges.filter((e) => e.input === 'flow').map((e) => [e.from, e.to]));
    const byId = new Map(gph.nodes.map((n) => [n.id, n]));
    for (let id = 'start'; id && byId.has(id) && !seen.has(id); id = next.get(id)) { seen.add(id); order.push(byId.get(id)); }
    let y = 20;
    for (let r = 0; r * COLS < order.length; r++) {
      const row = order.slice(r * COLS, r * COLS + COLS);
      row.forEach((n, k) => { n.x = 20 + k * NODE_W; n.y = y; });
      y += Math.max(...row.map(heightOf)) + 50;
    }
  }

  function compile(src) {
    const P = Parser(String(src));
    const items = parseStatements(P, false);
    let counter = 0;
    const subs = {};
    const nextId = () => 'n' + ++counter;
    const build = (list, label) => {
      const gph = { nodes: [{ id: 'start', type: 'start', x: 0, y: 0, params: {} }], edges: [] };
      let prev = 'start';
      for (const it of list) {
        const node = { id: nextId(), type: 'comment', x: 0, y: 0, params: {} }, p = node.params;
        switch (it.kind) {
          case 'call': node.type = `call:${it.fn}/${it.args.length}`; it.args.forEach((a, k) => { p['a' + k] = a; }); break;
          case 'let': node.type = 'let'; p.kw = it.kw; p.name = it.name; p.value = it.value; break;
          case 'set': node.type = 'set'; p.target = it.target; p.op = it.op; p.value = it.value; break;
          case 'run': node.type = 'run'; p.expr = it.expr; break;
          case 'return': node.type = 'return'; p.expr = it.expr; break;
          case 'break': case 'continue': node.type = it.kind; break;
          case 'raw': node.type = 'raw'; p.code = it.code; break;
          case 'comment': node.type = 'comment'; break;
          case 'func': node.type = 'func'; p.name = it.name; p.params = it.params; break;
          case 'for': node.type = 'for'; p.init = it.init; p.test = it.test; p.step = it.step; break;
          case 'foreach': node.type = 'foreach'; p.head = it.head; break;
          case 'while': case 'if': case 'elseif': node.type = it.kind; p.test = it.test; break;
          case 'else': node.type = 'else'; break;
          default: node.type = 'run'; p.expr = '';
        }
        if (it.note) p.note = it.note;
        if (it.trail) p.trail = it.trail;
        if (it.blank) p.blank = true;
        gph.nodes.push(node);
        gph.edges.push({ from: prev, to: node.id, input: 'flow' });
        prev = node.id;
        if (it.body) subs[node.id] = build(it.body, node.type);
      }
      gph.name = label;
      layout(gph);
      return gph;
    };
    const root = build(items, 'program');
    for (const [id, s] of Object.entries(subs)) s.name = containerName(root, subs, id);
    delete root.name;
    return { nodes: root.nodes, edges: root.edges, subs };
  }
  function containerName(root, subs, id) {
    const all = [root, ...Object.values(subs)];
    for (const gph of all) { const n = gph.nodes.find((x) => x.id === id); if (n) return nodeTitle(n); }
    return 'inside';
  }
  function nodeTitle(n) {
    const p = n.params || {};
    switch (n.type) {
      case 'func': return `function ${p.name || ''}()`;
      case 'for': return 'for loop';
      case 'foreach': return 'for each';
      case 'while': return 'while loop';
      case 'if': return 'if';
      case 'elseif': return 'else if';
      case 'else': return 'else';
      default: return getDef(n.type).label;
    }
  }

  // ---------------------------------------------------------------- graph -> code
  const IND = '  ';
  const noteLines = (text, ind) => {
    const s = String(text);
    if (/^\s*(\/\/|\/\*)/.test(s)) return s.split('\n').map((l) => { const q = l.trim(); return q ? ind + (q[0] === '*' ? ' ' : '') + q : ''; });
    return s.split('\n').map((l) => (ind + '// ' + l).replace(/\s+$/, ''));
  };
  const trailText = (t) => (/^\s*(\/\/|\/\*)/.test(t) ? t.trim() : '// ' + String(t).replace(/\n/g, ' '));
  const bad = (n, msg) => { const e = new Error(msg); e.nodeId = n && n.id; throw e; };

  function generate(project) {
    const subs = project.subs || {}, out = [];
    const walk = (gph, ind, depth) => {
      if (depth > 40) throw new Error('These blocks are nested too deeply.');
      const byId = new Map(gph.nodes.map((n) => [n.id, n]));
      const next = new Map();
      for (const e of gph.edges) if (e.input === 'flow' && !next.has(e.from)) next.set(e.from, e.to);
      const seen = new Set(['start']);
      let prevKind = null, closeAt = -1, first = true;
      for (let id = next.get('start'); id; id = next.get(id)) {
        const n = byId.get(id);
        if (!n) break;
        if (seen.has(id)) bad(n, 'The wires go in a circle here. Code runs in a line, so a wire cannot lead back.');
        seen.add(id);
        const p = n.params || {}, def = getDef(n.type);
        if (def.follows && !(prevKind === 'if' || prevKind === 'elseif')) bad(n, `“${def.label}” has to come right after an “if” (or an “else if”).`);
        const chained = def.follows;
        if (p.blank && !first && !chained) out.push('');
        const notes = p.note ? noteLines(p.note, ind + (chained ? IND : '')) : [];
        if (!chained) out.push(...notes);
        const line = (head) => { // one statement, with its trailing comment
          out.push(ind + head + (p.trail ? ' ' + trailText(p.trail) : ''));
        };
        const T = (k) => String(p[k] ?? '');
        const block = (head) => {
          const inner = subs[n.id];
          if (chained) { out[closeAt] = ind + '} ' + head + ' {'; out.push(...notes); } else out.push(ind + head + ' {');
          if (inner) walk(inner, ind + IND, depth + 1);
          closeAt = out.length; out.push(ind + '}' + (p.trail ? ' ' + trailText(p.trail) : ''));
        };
        switch (n.type) {
          case 'let': line(`${T('kw') || 'let'} ${T('name') || 'x'}${T('value') ? ' = ' + T('value') : ''};`); break;
          case 'set': line(`${T('target') || 'x'} ${T('op') || '='} ${T('value')};`); break;
          case 'run': line(T('expr') ? T('expr').replace(/;\s*$/, '') + ';' : ';'); break;
          case 'return': line(T('expr') ? `return ${T('expr')};` : 'return;'); break;
          case 'break': case 'continue': line(n.type + ';'); break;
          case 'comment': if (!p.note) out.push(ind + '//'); break;
          case 'raw': { const c = T('code'); out.push(...(c ? c.split('\n').map((l, k) => (k ? l : ind + l)) : [ind])); break; }
          case 'func': block(`function ${T('name') || 'myFunction'}(${T('params')})`); break;
          case 'for': block(`for (${T('init')}; ${T('test')}; ${T('step')})`); break;
          case 'foreach': block(`for (${T('head')})`); break;
          case 'while': block(`while (${T('test') || 'true'})`); break;
          case 'if': block(`if (${T('test') || 'true'})`); break;
          case 'elseif': block(`else if (${T('test') || 'true'})`); break;
          case 'else': block('else'); break;
          default: {
            const m = /^call:(.+)\/(\d+)$/.exec(n.type);
            if (!m) bad(n, `Unknown node “${n.type}”.`);
            line(`${m[1]}(${Array.from({ length: +m[2] }, (_, k) => T('a' + k)).join(', ')});`);
          }
        }
        prevKind = n.type === 'elseif' ? 'elseif' : n.type === 'if' ? 'if' : n.type === 'else' ? 'else' : null;
        first = false;
        if (!def.container) closeAt = -1;
      }
    };
    walk({ nodes: project.nodes, edges: project.edges }, '', 0);
    return out.join('\n') + (out.length ? '\n' : '');
  }

  // the statements that are wired up, as a count (for messages)
  function stats(project) {
    const all = [project, ...Object.values(project.subs || {})];
    let raw = 0, total = 0;
    for (const gph of all) for (const n of gph.nodes) { if (n.type === 'start') continue; total++; if (n.type === 'raw') raw++; }
    return { nodes: total, raw };
  }

  D.codegraph = { compile, generate, decompile: generate, getDef, entries, defaults, newArg, layout, nodeTitle, stats, API, _tokens: (s) => prepare(s).filter((t) => t.t !== 'eof').map((t) => t.v) };
  if (D.PORT_COLORS) Object.assign(D.PORT_COLORS, { flow: '#e8483a', text: '#9a9a94', note: '#9a9a94', code: '#9a9a94' });
})(window);
