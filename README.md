# Loom

An open-source studio for designers and creative coders. Four workspaces share one canvas and one file:

- **Design**: a vector editor (think Figma/Illustrator) with a pen tool, shapes, layers, an inspector, and a keyframe timeline (think Rive/After Effects).
- **Nodes**: a node editor (in the spirit of NodeBox) for generative systems. Your Design artwork is a node you can copy onto points, wiggle, combine and animate.
- **Script**: the same node graph as a small text language. Edit either side and the other follows.
- **Code**: Processing-style JavaScript.

Released into the public domain under CC0 (see `LICENSE`). No build step, no dependencies.

## Run
Open `index.html` in a browser (or `python3 -m http.server`).
Tests: `node tests/engine.test.js` and `node tests/script.test.js`.

## Design tab
- **Draw:** pick a tool on the left and drag on the artboard: Rectangle (R), Ellipse (O), Polygon (Y), Star (S), Line (L). A plain click makes a 100 px shape.
- **Pen (P):** click for corner points, click-and-drag for smooth curves, click the first point to close, Enter to finish. Double-click a path with the Select tool to edit its points.
- **Select (V):** click, Shift+click or drag a box to select. Drag to move (snaps to the artboard and other layers; Alt turns snapping off), drag handles to resize (Shift keeps proportions, Alt resizes from the center), drag the round handle to rotate (Shift snaps to 15°).
- **Inspector:** position, size, rotation, corner radius / sides / star inner size, opacity, fill, stroke. Drag a label to scrub a value. Align buttons line shapes up with the artboard (or with each other).
- **Layers:** click to select, drag to reorder, eye to hide, lock, double-click to rename. Duplicate (Ctrl/Cmd+D), Delete, `[` and `]` to send back/forward, arrow keys to nudge.
- **Animate:** every number has a ◇ next to it. Move the playhead and click ◇ to add a keyframe; once a value has keyframes, changing it at another time adds a new one automatically. Drag keyframes in the timeline, pick **Easing to next key** (smooth, linear, ease in/out, overshoot, bounce, hold), set the duration, loop on/off.
- **Export:** File → PNG, SVG (vector, at the current frame) or WebM video (records the animation).

## Nodes tab (no programming needed)
1. Open **Examples** and pick one, then change things.
2. **Add a node:** double-click empty space and search (e.g. "circle", "grid", "wave", "design", "compound").
3. **Connect:** drag from the dot on the right of a node to a dot on the left of another. Drag a connected dot away to unplug it.
4. **Change a value:** type in the box, or drag its label left/right (hold Shift for fine control).
5. Everything flows into the **Output** node, which is what you see on the canvas.

**Design node:** brings everything from the Design tab into the graph, animated by its timeline. Wire it into *Copy to Points* and you have your own artwork stamped across a generative system.
**Import SVG** (File menu, or drag a `.svg` onto the graph) brings in logos and illustrations; **Draw** is a small pen editor inside a node.

### Shapes, paths and layout
- **Bezier paths:** *Curve* (two handles), *Connect* (turn on `smooth` for a flowing curve through points), *Path Points* (spread points along any shape; `degrees` follows the direction), *Resample* + *Wiggle Points* (make edges organic), *Move Points*.
- **Compound:** union, subtract, intersect or xor shapes into a single clean path (holes included). With nothing in `with`, it folds across the list: *union* merges everything, *subtract* cuts the rest out of the first.
- **Align:** line shapes up to a point (left/center/right, top/middle/bottom), as one group or each on its own.
- **Distribute:** space shapes evenly in a row or column, with a fixed gap or across a fixed length, centered where you like.

### Custom nodes
Select nodes (Shift+drag, or Shift+click), then **Make custom node** (Ctrl/Cmd+G). Connections coming in become inputs.
**Open** it to edit inside: click the ◦ next to any value to show it on the custom node, click ◦ in a header to choose the output, click the name to rename.
Use it again anywhere from the add-node search. Custom nodes can contain other custom nodes.

## Script tab: the text language
The Script tab shows your node graph as text, and your edits become the graph (live, after you stop typing). Errors name the line and suggest fixes; click the message to jump to the line.

```
// Pipe a value into the next node with |>. Name a value with "let" to reuse it.
let pts = grid(14, 14, 460, 460)
let n = noiseField(pts, scale: 0.004, time: time(0.3))

star(5, 22, 10)
  |> copy(pts, scale: n * 2.2, rotate: n * 720)     // math is plain: + - * / % ^
  |> style(hue: n * 300, sat: 70, alpha: 0.95)
  |> output(bri: 6)

// "def" makes your own node. Its parameters become its controls.
def petals(count = 12, radius = 60, hue = 0) {
  let spots = ring(count, radius)
  ellipse(70, 22)
    |> copy(spots, rotate: attribute(spots, degrees))
    |> style(hue: hue, sat: 55, alpha: 0.3)
}
```

- **Calling nodes:** `name(a, b, c)` fills inputs in order; `name(input: value)` sets one by name. Choices are plain words: `compound(op: subtract)`.
- **Pipes:** `x |> f(...)` puts `x` into the first free input of `f` that accepts its type (shapes into a shape input, points into a points input).
- **The last line** should make shapes. It gets an `output()` automatically if you don't write one.
- **Imported SVGs and hand-drawn paths** can't be written as text, so they appear as `svg(id: "…")` / `draw(id: "…")` and keep their data as long as that line stays.
- The reference at the bottom of the tab lists every node; click one to insert it. **Tidy** rewrites your script in its canonical form.

## Code tab: Processing-style JavaScript
Write `setup()` and `draw()` like in Processing, in plain JavaScript. Origin top-left, 600 × 600 canvas. Click ▶ (or Ctrl/Cmd+Enter) to run.

- **Drawing:** `background fill stroke noFill noStroke strokeWeight strokeCap strokeJoin rect square ellipse circle arc line point triangle quad bezier`, `beginShape(mode)` with `vertex bezierVertex quadraticVertex endShape` (modes: `POINTS LINES TRIANGLES TRIANGLE_STRIP TRIANGLE_FAN QUADS QUAD_STRIP`), `text textSize textAlign textWidth`, `blendMode(ADD | MULTIPLY | SCREEN …)`.
- **Transform:** `translate rotate scale shearX shearY applyMatrix resetMatrix push pop pushMatrix popMatrix pushStyle popStyle`.
- **Color:** `colorMode(RGB | HSB)` (HSB here is hue 0–360, saturation/brightness 0–100, alpha 0–1), `color lerpColor red green blue alpha`.
- **Math:** `map lerp norm constrain dist mag sq random randomSeed randomGaussian noise noiseSeed radians degrees`, all `Math` functions, constants `PI TWO_PI HALF_PI QUARTER_PI`, and a `PVector` class (`createVector`, `add sub mult div mag normalize setMag limit dist dot heading rotate lerp copy`, plus static `PVector.add/sub/mult/div/dist/fromAngle/random2D`).
- **Time & input:** `frameCount frameRate noLoop loop redraw millis hour minute second day month year`, `mouseX mouseY pmouseX pmouseY mouseIsPressed mouseButton`, and event functions `mousePressed mouseReleased mouseClicked mouseMoved mouseDragged keyPressed keyReleased keyTyped` with `key keyCode keyIsPressed`. Click the canvas to give the sketch the keyboard.
- **Examples → Code:** 61 sketches in groups that follow the usual Processing learning topics (color, control, forms, input, math, structure, transform, typography, cellular automata, drawing, fractals, interaction, motion, simulation, vectors). They are original programs written for Loom; they are not copies of the Processing examples (those are under a different license).

Not supported (yet): 3D, cameras, lights, images/pixels, file I/O, `createGraphics`, classes from Java mode (plain JavaScript classes work).

## Layout
- `src/engine.js`  node definitions, graph evaluation, bezier paths, boolean shape operations, SVG import, design documents + keyframes, rendering
- `src/script.js`  the text language: lexer, parser, compiler (text → graph), decompiler (graph → text)
- `src/design.js`  the Design workspace (tools, canvas, inspector, layers, timeline)
- `src/draw.js`    full-screen pen editor (used by the Draw node and Edit points)
- `src/editor.js`  node editor UI
- `src/sketch.js`  Processing-style API
- `src/examples.js`, `src/examples-code.js`  built-in examples (graphs, designs, scripts, code sketches)
- `src/app.js`     app wiring
- `tests/`         `node` test scripts (engine geometry, language round trips)

## Roadmap
1. Design: text (type to outlines), groups, boolean operations on design shapes, gradients, color palettes, import SVG straight into the artboard, animating colors.
2. Rive-style interactivity: state machines, triggers, and exporting a self-contained animation that plays on the web.
3. Language: list literals, `if`, syntax highlighting and autocomplete in the Script tab, a standalone CLI that renders a script to SVG/PNG.
4. More NodeBox parity (snap, text on paths, skew); more Processing (curveVertex, images, mouse events).

Note: node names follow NodeBox's reference for familiarity; their docs are CC BY-NC-SA, so do not copy doc text or example code from NodeBox or Processing into this repo. Write your own.
