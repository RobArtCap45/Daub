# Architecture

Daub is plain JavaScript that runs in a browser tab or in the Electron desktop wrapper. There is no framework and no build step for the app itself: `app/index.html` loads the scripts in `app/src/` in order.

```
daub/
├── app/                 the app. Open app/index.html and it runs.
│   ├── index.html       page shell, content-security-policy
│   ├── *.css            style.css (base, node editor), design.css (Design tab, dialogs), script.css (Script tab), code.css (Code tab and code nodes)
│   └── src/
│       ├── engine.js    the core: node definitions, graph evaluation, geometry, rendering   (no DOM needed, except SVG import)
│       ├── script.js    the text language: lexer, parser, compiler, decompiler               (no DOM)
│       ├── sketch.js    the Processing-style API for the Code tab
│       ├── codegraph.js code <-> statement nodes: parser and code writer                       (no DOM)
│       ├── pde.js       Processing (Java) -> Daub JavaScript                                   (no DOM)
│       ├── togen.js     a sketch -> the Nodes tab's nodes (records the sketch, then fits nodes)  (no DOM)
│       ├── editor.js    the node editor (DOM + SVG wires)
│       ├── codeeditor.js the node editor set up for code (Start node, wires = run order)
│       ├── design.js    the Design workspace
│       ├── draw.js      the full-screen pen editor
│       ├── examples.js, examples-code.js   built-in examples
│       └── app.js       wires the tabs, files, history, menus together
├── desktop/             Electron: main.js (window + menu), preload.js, build/icon.png
├── website/             the landing page (static)
├── scripts/             small Node scripts (serve, build-site, gen-docs, check-syntax)
├── tests/               tests that run in plain Node
├── docs/                these docs
└── .github/             CI, release builds, issue and PR templates
```

`engine.js` and `script.js` do not touch the page, so the tests load them straight into Node. Keep it that way: anything that needs the DOM belongs in the other files.

## The project

Everything you make is one JSON object (the *project*), also what **File → Save** writes (as `{ version: 2, graph: <project>, code: "…" }`):

```js
{
  nodes: [{ id: 'n1', type: 'grid', x: 0, y: 0, params: { cols: 14 } }, …],
  edges: [{ from: 'n1', to: 'n3', input: 'pts' }, …],      // an output of one node into an input of another
  subs:  { s1: { name, nodes, edges, inputs, out } },     // custom nodes (a graph inside a node)
  design: { shapes: [...], duration: 4, loop: true, bg: '#ffffff' }   // the Design tab
}
```

- A **node** has a `type` (a key of `NODES` in `engine.js`, or `sub:<id>` for a custom node), a position in the editor, and `params`: the values typed into its boxes.
- An **edge** connects a node's output to one named input of another.
- A **custom node** (`subs`) is its own small graph. `inputs` lists which inner values are shown as controls; `out` is the inner node whose result it returns.
- The **design** is a list of shapes with optional keyframes, evaluated at a time `t`.

## Code as nodes

The Code tab can show its sketch as a graph (**Code → Nodes**). `codegraph.js` does the work and has no DOM, so `tests/codegraph.test.js` runs it in Node.

- `compile(text)` splits the code into statements and makes a node for each one. `generate(graph)` writes the code again by following the wires from the Start node.
- A graph has the same shape as the rest of the editor: `nodes`, `edges` (always `input: 'flow'`), and `subs`. A loop, `if` or function is a *container* node: its body is a graph of its own in `subs[nodeId]`.
- A call is `call:<name>/<number of arguments>` (for example `call:rect/4`); its arguments are the params `a0, a1, …`. Variables, assignments and the rest have their own types. Anything the parser does not understand becomes a `raw` node holding the exact text, so every program round-trips.
- Comments are kept as the `note` (above) and `trail` (same line) params of the statement they belong to.
- The test checks every Code example: code → nodes → code gives the same program, and a second trip changes nothing.

## Processing import and Sketch to nodes

`pde.js` rewrites Processing (Java) to JavaScript. It edits the source in place by token ranges, so comments and layout survive, and it keeps a small table of variable types (for `ArrayList`, `HashMap` and `int` division). `tests/pde.test.js` covers declarations, casts, collections, classes and runs converted code to check Java's behavior (whole-number division, 2-D arrays).

`togen.js` does not translate the code. It **runs** the sketch once with a recorder instead of a canvas (frame 1, mouse in the middle) and writes down every shape with its final place, size, rotation and colors. Then it matches shapes to nodes: runs of one kind become one shape node plus Copy to Points; positions are tested for a lattice (Grid), a full circle (Ring) or else Scatter; per-shape sizes, rotations and colors are fitted to `a + b × attribute` and become Attribute → Remap (otherwise a Random node, flagged as approximate). `tests/togen.test.js` checks that the nodes put every shape where the sketch did, and that all Code examples convert to valid projects.

`codeeditor.js` makes the editor behave for code: new nodes are wired in after the selected one, deleting a node closes the gap, and nodes that are not wired to Start are dimmed. The app (`app.js`) keeps the text and the graph in step when you switch.

## How a frame is made

1. `evaluate(project, { time })` finds the **Output** node and evaluates backwards: each node's inputs come from connected nodes, or from `params`, or from the node's default. Results are remembered per frame, so a node used twice is computed once.
2. The result is a list of **shapes**: `{ k: 'rect' | 'ellipse' | 'path' …, m: [a b c d e f], fill, stroke, sw }`. A shape has a matrix `m`, so moving, rotating and copying shapes only multiplies matrices.
3. `drawScene` paints the shapes on the canvas. `toSVG` writes the same shapes as SVG.

Values flowing between nodes are numbers, lists of numbers, lists of points (`pts`) or lists of shapes (`geo`). Number inputs accept lists and match them up item by item.

## Adding a node

1. In `app/src/engine.js`, add an entry to `NODES`:

   ```js
   spiral: {
     label: 'Spiral', cat: 'Points', out: 'pts',
     inputs: [num('count', 60), num('turns', 3)],
     run: (i) => Array.from({ length: i.count }, (_, k) => { /* … */ return { x, y, i: k, u: k / i.count, v: 0 }; }),
   },
   ```

   `inputs` use the helpers `num`, `geo`, `pts`, `any`, `en` (a choice). `run` receives the input values and returns the output.
2. Add a one-line, plain-language description to `DESC` (the add-node search shows it).
3. Run `npm run docs` to refresh `docs/node-reference.md`, and `npm test`.
4. Add a test in `tests/engine.test.js` that checks the numbers.
5. If it is worth showing off, add an example to `app/src/examples.js`.

The Script language picks the new node up automatically: its name is its key in `NODES`.

## Examples

- `examples.nodes` and `examples.designs`: whole projects.
- `examples.scripts`: Script-tab text. `tests/script.test.js` compiles every one and checks that it draws something.
- `examples.code` (in `examples-code.js`): Code-tab sketches, grouped by `cat`.

**Write your own.** Daub's examples must be original work. Do not copy example programs or documentation text from Processing, NodeBox or other projects; their licenses are different from this repository's.

## Tests

`npm test` runs three things, all in plain Node with no install needed beyond the lockfile:

- `scripts/check-syntax.js` parses every `.js` file.
- `tests/engine.test.js` checks geometry (exact areas for Compound, Align, Distribute, a randomized property test).
- `tests/script.test.js` checks the language: compile, error messages, and a text → graph → text round trip for every example, comparing drawings.

The desktop app has a smoke test: `npx electron . --smoke-test` opens the app, uses each workspace, and exits 0 only if it works. CI runs it on Linux under a virtual display.
